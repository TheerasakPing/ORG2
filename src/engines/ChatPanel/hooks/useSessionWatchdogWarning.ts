import { useCallback, useSyncExternalStore } from "react";

import {
  getSessionWatchdogWarning,
  subscribeSessionWatchdogWarning,
} from "@src/engines/SessionCore/sync/sessionWatchdogWarnings";

/**
 * Lightweight, per-session readout for the leaf Status Trail. The React
 * subscription is scoped to the displayed session so token events and
 * unrelated sessions cannot cause a chat list-wide re-render.
 */
export function useSessionWatchdogWarning(sessionId: string | null) {
  const subscribe = useCallback(
    (listener: () => void) =>
      sessionId
        ? subscribeSessionWatchdogWarning(sessionId, listener)
        : () => undefined,
    [sessionId]
  );
  const snapshot = useCallback(
    () => (sessionId ? getSessionWatchdogWarning(sessionId) : null),
    [sessionId]
  );
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
