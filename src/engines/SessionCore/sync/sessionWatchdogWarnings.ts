/**
 * Session-scoped UI projection of the Rust scheduler's observation-only
 * "agent:turn_watchdog" wire event. No command execution or lifecycle writes.
 *
 * Stored as one bounded last-warning snapshot per session, never appended to
 * chat history. A terminal/idle/new-turn event clears it synchronously.
 */
export interface SessionWatchdogWarning {
  sessionId: string;
  messageId: string;
  elapsedSeconds: number;
  warningCount: number;
  observeOnly: true;
}

const MAX_WARNINGS = 128;
const warnings = new Map<string, SessionWatchdogWarning>();
const listeners = new Map<string, Set<() => void>>();

export function getSessionWatchdogWarning(
  sessionId: string
): SessionWatchdogWarning | null {
  return warnings.get(sessionId) ?? null;
}

export function subscribeSessionWatchdogWarning(
  sessionId: string,
  listener: () => void
): () => void {
  let subscribers = listeners.get(sessionId);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(sessionId, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(sessionId);
  };
}

function notify(sessionId: string): void {
  listeners.get(sessionId)?.forEach((listener) => listener());
}

/**
 * Return false on malformed messages or wrong-session delivery. Backend
 * warnings are diagnostic only; their payload must not hold user content.
 */
export function recordSessionWatchdogWarning(
  sessionId: string,
  payload: unknown
): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const event = payload as Record<string, unknown>;
  if (
    !sessionId ||
    event.sessionId !== sessionId ||
    typeof event.messageId !== "string" ||
    event.messageId.length === 0 ||
    event.observeOnly !== true ||
    typeof event.elapsedSeconds !== "number" ||
    !Number.isSafeInteger(event.elapsedSeconds) ||
    event.elapsedSeconds < 180 ||
    typeof event.warningCount !== "number" ||
    !Number.isSafeInteger(event.warningCount) ||
    event.warningCount < 1
  ) {
    return false;
  }
  const previous = warnings.get(sessionId);
  if (
    previous?.messageId === event.messageId &&
    previous.warningCount >= event.warningCount
  ) {
    return false;
  }
  const warning: SessionWatchdogWarning = {
    sessionId,
    messageId: event.messageId,
    elapsedSeconds: event.elapsedSeconds,
    warningCount: event.warningCount,
    observeOnly: true,
  };
  warnings.delete(sessionId);
  warnings.set(sessionId, warning);
  // Prevent an app running thousands of sessions from retaining an
  // unbounded diagnostics map if a terminal signal was missed.
  if (warnings.size > MAX_WARNINGS) {
    const oldest = warnings.keys().next().value;
    if (oldest) {
      warnings.delete(oldest);
      notify(oldest);
    }
  }
  notify(sessionId);
  return true;
}

export function clearSessionWatchdogWarning(
  sessionId: string,
  activeMessageId?: string
): void {
  const previous = warnings.get(sessionId);
  if (!previous) return;
  // A duplicate start for the SAME job cannot erase its warning; starting
  // a different job (or an idle/terminal notification) clears stale UI.
  if (activeMessageId && previous.messageId === activeMessageId) return;
  warnings.delete(sessionId);
  notify(sessionId);
}

/** Test-only cleanup; also notifies mounted consumers to drop stale labels. */
export function clearAllSessionWatchdogWarnings(): void {
  for (const id of [...warnings.keys()]) clearSessionWatchdogWarning(id);
}
