/**
 * Read-only overview of all registered in-memory native Rust schedulers.
 * One bounded aggregate IPC request on open and once a minute while visible;
 * never spawn Workers, query transcripts or create timers while closed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { rpc } from "@src/api/tauri/rpc";
import type { NativeWorkerOverview } from "@src/api/tauri/rpc/schemas/sessionAggregate";

const REFRESH_MS = 60_000;

export function useNativeWorkerOverview(): {
  overview: NativeWorkerOverview | null;
  isLoading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const [overview, setOverview] = useState<NativeWorkerOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const epoch = generation.current;
    setIsLoading(true);
    const request = rpc.sessionAggregate.workerOverview()
      .then((snapshot) => {
        if (epoch !== generation.current) return;
        setOverview(snapshot);
        setError(false);
      })
      .catch(() => {
        // Never surface raw RPC / filesystem paths or secrets in the UI.
        if (epoch === generation.current) setError(true);
      })
      .finally(() => {
        if (epoch === generation.current) setIsLoading(false);
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    generation.current += 1;
    // Schedule the initial IPC request after effect setup. React effects must
    // not synchronously trigger a state update during their execution.
    const initialTimer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      generation.current += 1;
      inFlight.current = null;
    };
  }, [refresh]);

  return { overview, isLoading, error, refresh };
}
