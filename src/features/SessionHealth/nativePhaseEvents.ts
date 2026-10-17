/**
 * Runtime signals from the Rust TurnEventHandler. This is a phase transition
 * stream, NOT an instrumented watchdog or proof that a future is progressing.
 * Never hold prompts, tool args, provider URLs or error bodies here.
 */
export const NATIVE_PHASE_EVENT = "agent:monitor_phase";
export const NATIVE_PROGRESS_EVENT = "agent:monitor_progress";
export const MAX_NATIVE_PHASE_RECORDS = 128;

export type NativePhase = "provider_request" | "tool_executing" | "tool_finished";
export interface NativePhaseObservation {
  turnId: string | null;
  phase: NativePhase;
  tool: string | null;
  observedAtMs: number;
  /** Last *actual* provider output, not a timed ping. */
  lastProgressAtMs: number | null;
}
export type NativePhaseMap = ReadonlyMap<string, NativePhaseObservation>;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function safeToolName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  return /^[a-zA-Z][a-zA-Z0-9_./-]{0,47}$/.test(input) ? input : null;
}

function phaseOf(value: unknown): NativePhase | null {
  switch (value) {
    case "provider_request":
    case "tool_executing":
    case "tool_finished":
      return value;
    default:
      return null;
  }
}

/** Accept only a deliberately strict allowlist, dropping extra payload keys. */
export function ingestNativePhase(
  current: NativePhaseMap,
  payload: unknown,
  nowMs = Date.now()
): NativePhaseMap {
  if (!isRecord(payload) || !validId(payload.sessionId)) return current;
  const phase = phaseOf(payload.phase);
  if (!phase) return current;
  if (payload.turnId != null && !validId(payload.turnId)) return current;
  if (!Number.isFinite(nowMs) || nowMs < 0) return current;
  const id = payload.sessionId;
  const previous = current.get(id);
  const turnId = typeof payload.turnId === "string" ? payload.turnId : null;

  // The Rust handler owns an execution-generation guard, but still defend
  // against a delayed completion from the last turn on the client.
  if (
    previous?.turnId && turnId &&
    previous.turnId !== turnId &&
    phase === "tool_finished"
  ) return current;
  const next = new Map(current);
  next.delete(id);
  next.set(id, {
    turnId,
    phase,
    tool: phase === "provider_request" ? null : safeToolName(payload.tool),
    observedAtMs: nowMs,
    lastProgressAtMs: null,
  });
  while (next.size > MAX_NATIVE_PHASE_RECORDS) {
    const first = next.keys().next().value;
    if (first === undefined) break;
    next.delete(first);
  }
  return next;
}

/**
 * A pulse exists only when Rust received a real provider delta (text,
 * thinking, or model tool-call bytes), rate-limited at source.
 * No payload content is retained; missing pulses do not prove a dead future.
 */
export function ingestNativeProgress(
  current: NativePhaseMap,
  payload: unknown,
  nowMs = Date.now()
): NativePhaseMap {
  if (
    !isRecord(payload) ||
    !validId(payload.sessionId) ||
    payload.kind !== "response_delta" ||
    !validId(payload.turnId) ||
    !Number.isFinite(nowMs) ||
    nowMs < 0
  ) return current;
  const previous = current.get(payload.sessionId);
  if (
    !previous ||
    previous.phase !== "provider_request" ||
    previous.turnId !== payload.turnId ||
    (previous.lastProgressAtMs !== null && nowMs <= previous.lastProgressAtMs) ||
    nowMs < previous.observedAtMs
  ) return current;
  const next = new Map(current);
  next.set(payload.sessionId, { ...previous, lastProgressAtMs: nowMs });
  return next;
}

/** Turn completion/error retracts the indication, not the underlying session. */
export function clearNativePhase(
  current: NativePhaseMap,
  payload: unknown
): NativePhaseMap {
  if (!isRecord(payload) || !validId(payload.sessionId)) return current;
  const existing = current.get(payload.sessionId);
  if (!existing) return current;
  if (payload.turnId != null && !validId(payload.turnId)) return current;
  // Some legacy agent:error payloads omit turnId. Never allow an
  // unscoped terminal to erase a known newer turn's progress indication.
  if (existing.turnId && payload.turnId !== existing.turnId) return current;
  const next = new Map(current);
  next.delete(payload.sessionId);
  return next;
}

export function nativePhaseDescription(phase: NativePhase, tool: string | null): string {
  switch (phase) {
    case "provider_request":
      return "Rust: entered provider request · รอผลจากโมเดล (ยังไม่ใช่ heartbeat)";
    case "tool_executing":
      return "Rust: tool execution started" + (tool ? " · " + tool : "");
    case "tool_finished":
      return "Rust: tool result received" + (tool ? " · " + tool : "");
  }
}
