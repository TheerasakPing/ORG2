import React, { Suspense, lazy, useCallback, useState } from "react";

const LiveSessionMonitorPanel = lazy(
  () => import(/* webpackChunkName: "session-health-monitor" */ "./LiveSessionMonitorPanel")
);

/** No Jotai subscriptions, listeners or timers until the user opens Monitor. */
export function LiveSessionMonitorLauncher(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[85]">
      <button
        type="button"
        data-testid="live-session-monitor-trigger"
        aria-label="Open Live Session Monitor"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border-2 bg-bg-2 px-3 py-2 text-xs font-semibold text-text-1 shadow-lg transition-colors hover:bg-fill-1"
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-cyan-500" />
        Session Monitor
      </button>
      {open && (
        <div className="pointer-events-auto">
          <Suspense fallback={<div role="status" className="absolute bottom-12 right-0 rounded-xl bg-bg-2 p-4 text-xs">Loading monitor…</div>}>
            <LiveSessionMonitorPanel onClose={close} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
