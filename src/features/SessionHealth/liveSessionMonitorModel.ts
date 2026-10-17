/**
 * Bounded, presentation-only view of session state already pushed by Rust.
 * Never represents a stale persisted timestamp as proof of a hung future.
 */
import type { AgentLiveStatus } from "@src/api/tauri/rpc/schemas/agentOrgs";
import type { Session } from "@src/store/session/sessionAtom/types";

const BUSY_STATUSES = new Set([
  "running", "in_progress", "installing", "pending", "queued",
  "waiting_for_funds",
]);
const ATTENTION_STATUSES = new Set([
  "waiting_for_user", "paused",
]);
const TERMINAL_STATUSES = new Set([
  "completed", "failed", "error", "cancelled",
  "abandoned", "timeout", "killed", "archived",
]);

export const MAX_LIVE_MONITOR_ROWS = 50;
export const PERSISTED_STATUS_AGE_WARNING_MS = 10 * 60 * 1000;

export type MonitorPhase = "working" | "attention" | "idle" | "terminal" | "unknown";

export interface LiveSessionRow {
  id: string;
  title: string;
  status: string;
  phase: MonitorPhase;
  /** Provider/tool phase is unknown for native Rust rows without a hook. */
  detail: string;
  source: "cli-hook" | "session-roster";
  /** Only means the persisted row has not updated recently; NOT a hang. */
  oldPersistedStatus: boolean;
  updatedAtMs: number | null;
}

export interface LiveSessionSummary {
  rows: LiveSessionRow[];
  totalLoaded: number;
  visibleCount: number;
  busy: number;
  attention: number;
  olderStatus: number;
  truncated: boolean;
}

export function monitorPhase(status: string): MonitorPhase {
  if (BUSY_STATUSES.has(status)) return "working";
  if (ATTENTION_STATUSES.has(status)) return "attention";
  if (status === "idle") return "idle";
  if (TERMINAL_STATUSES.has(status)) return "terminal";
  return "unknown";
}

function safeToolName(raw: string | undefined): string | null {
  if (!raw) return null;
  // Tool arguments and previews may contain secrets. Only a conservative
  // identifier is displayed. Never render toolInputPreview/prompt contents.
  return /^[a-zA-Z][a-zA-Z0-9_./-]{0,47}$/.test(raw) ? raw : null;
}

export function deriveLiveSessionSummary(
  sessions: readonly Session[],
  statuses: ReadonlyMap<string, AgentLiveStatus>,
  options: {
    activeOnly?: boolean;
    nowMs?: number;
    maxRows?: number;
  } = {}
): LiveSessionSummary {
  const nowMs = options.nowMs ?? Date.now();
  const activeOnly = options.activeOnly ?? true;
  const limit = Math.max(1, Math.min(MAX_LIVE_MONITOR_ROWS, options.maxRows ?? MAX_LIVE_MONITOR_ROWS));
  let busy = 0;
  let attention = 0;
  let olderStatus = 0;
  const rows: LiveSessionRow[] = [];

  // The app-wide session roster is already paginated. Do not trigger a
  // per-session data load or subscribe to transcript/event atoms.
  for (const session of sessions) {
    if (session.readOnly || session.importedFrom) continue;
    const hook = statuses.get(session.session_id);
    const status = hook?.status ?? session.status;
    const phase = monitorPhase(status);
    if (activeOnly && phase !== "working" && phase !== "attention") continue;
    if (phase === "working") busy++;
    if (phase === "attention") attention++;
    const stamp = Date.parse(session.updated_at);
    const updatedAtMs = Number.isFinite(stamp) && stamp <= nowMs ? stamp : null;
    const oldPersistedStatus =
      phase === "working" &&
      updatedAtMs !== null &&
      nowMs - updatedAtMs >= PERSISTED_STATUS_AGE_WARNING_MS;
    if (oldPersistedStatus) olderStatus++;

    const tool = hook?.status === "running" ? safeToolName(hook.toolName) : null;
    const detail = hook
      ? hook.status === "waiting_for_user"
        ? "CLI hook: waiting for user"
        : tool
          ? "CLI tool: " + tool
          : "CLI hook status · step unspecified"
      : "Persisted Rust/session status · provider/tool step unknown";

    rows.push({
      id: session.session_id,
      title: (session.displayLabel || session.name || session.agentDisplayName || "Untitled session").slice(0, 90),
      status,
      phase,
      detail,
      source: hook ? "cli-hook" : "session-roster",
      oldPersistedStatus,
      updatedAtMs,
    });
  }

  const totalLoaded = rows.length;
  const priority: Record<MonitorPhase, number> = {
    working: 0, attention: 1, idle: 2, unknown: 3, terminal: 4,
  };
  rows.sort((a, b) =>
    priority[a.phase] - priority[b.phase] ||
    (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0) ||
    a.id.localeCompare(b.id)
  );
  return {
    rows: rows.slice(0, limit),
    totalLoaded,
    visibleCount: Math.min(totalLoaded, limit),
    busy,
    attention,
    olderStatus,
    truncated: totalLoaded > limit,
  };
}
