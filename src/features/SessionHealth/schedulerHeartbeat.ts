/**
 * Scheduler-observed heartbeats, not provider/tool progress heartbeats.
 * The source Rust task polls its own turn future and timer in one task.
 */
export const SCHEDULER_HEARTBEAT_EVENT = "agent:scheduler_heartbeat";
export const MAX_SCHEDULER_HEARTBEAT_RECORDS = 128;
export const SCHEDULER_HEARTBEAT_LATE_MS = 45_000;
export const SCHEDULER_HEARTBEAT_MISSING_MS = 120_000;

export type WorkerPulseState = "alive" | "finished";
export interface SchedulerPulse {
  turnIntentId: string;
  epoch: number;
  sequence: number;
  state: WorkerPulseState;
  observedAtMs: number;
}
export type SchedulerPulseMap = ReadonlyMap<string, SchedulerPulse>;
export type SchedulerPulseHealth = "recent" | "late" | "missing" | "unknown";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function validId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 256;
}

function safeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

export function ingestSchedulerPulse(
  current: SchedulerPulseMap,
  payload: unknown,
  nowMs = Date.now()
): SchedulerPulseMap {
  if (!isRecord(payload) || !validId(payload.sessionId)
    || !validId(payload.turnIntentId)
    || !safeNumber(payload.epoch) || payload.epoch === 0
    || !safeNumber(payload.sequence)
    || (payload.state !== "alive" && payload.state !== "finished")
    || !Number.isFinite(nowMs) || nowMs < 0) {
    return current;
  }
  const previous = current.get(payload.sessionId);
  if (previous) {
    if (payload.epoch < previous.epoch) return current;
    if (payload.epoch === previous.epoch) {
      if (payload.turnIntentId !== previous.turnIntentId) return current;
      if (payload.sequence < previous.sequence) return current;
      if (previous.state === "finished") return current;
      // Replayed or duplicated events do not create false clock progress.
      if (previous.state === payload.state && previous.sequence === payload.sequence) {
        return current;
      }
    }
  }
  const next = new Map(current);
  next.delete(payload.sessionId);
  next.set(payload.sessionId, {
    turnIntentId: payload.turnIntentId,
    epoch: payload.epoch,
    sequence: payload.sequence,
    state: payload.state,
    observedAtMs: nowMs,
  });
  while (next.size > MAX_SCHEDULER_HEARTBEAT_RECORDS) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

/**
 * Heartbeat silence is a warning about scheduler polling visibility, not
 * proof of an executor deadlock. Window sleep, IPC loss and overload can also
 * delay events. Stopped observations are tombstones for epoch fencing.
 */
export function schedulerPulseHealth(
  pulse: SchedulerPulse | undefined,
  nowMs: number
): SchedulerPulseHealth {
  if (!pulse || pulse.state !== "alive" ||
    !Number.isFinite(nowMs) || nowMs < pulse.observedAtMs) return "unknown";
  const lagMs = nowMs - pulse.observedAtMs;
  if (lagMs >= SCHEDULER_HEARTBEAT_MISSING_MS) return "missing";
  if (lagMs >= SCHEDULER_HEARTBEAT_LATE_MS) return "late";
  return "recent";
}

export function countSchedulerPulseHealth(
  loadedSessionIds: readonly string[],
  pulses: SchedulerPulseMap,
  nowMs: number
): { recent: number; late: number; missing: number; unknown: number } {
  const counts = { recent: 0, late: 0, missing: 0, unknown: 0 };
  for (const id of new Set(loadedSessionIds)) {
    counts[schedulerPulseHealth(pulses.get(id), nowMs)]++;
  }
  return counts;
}

export function schedulerPulseMessage(health: SchedulerPulseHealth): string | null {
  switch (health) {
    case "recent":
      return "Scheduler heartbeat ล่าสุด · ยืนยันเพียง Worker ถูก Poll ไม่ใช่ Provider คืบหน้า";
    case "late":
      return "Scheduler heartbeat เงียบ ≥45 วินาที · ตรวจการพักหน้าต่าง/ระบบ และ Logs";
    case "missing":
      return "Scheduler heartbeat เงียบ ≥2 นาที · ตรวจสอบ Worker แต่ยังไม่ยืนยันว่า Deadlock";
    case "unknown":
      return null;
  }
}
