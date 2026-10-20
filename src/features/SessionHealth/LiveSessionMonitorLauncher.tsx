import React, { Suspense, lazy, useCallback, useState } from "react";

const LiveSessionMonitorPanel = lazy(
  () =>
    import(
      /* webpackChunkName: "session-health-monitor" */ "./LiveSessionMonitorPanel"
    )
);

/** No Jotai subscriptions, listeners or timers until the user opens Monitor. */
export function LiveSessionMonitorLauncher(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[85]">
      <button
        type="button"
        data-testid="live-session-monitor-trigger"
        aria-label="Open Live Session Monitor"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border-2 bg-bg-2 px-3 py-2 text-xs font-semibold text-text-1 shadow-lg transition-colors hover:bg-fill-1"
      >
        <span
          aria-hidden
          className="relative flex h-2.5 w-2.5 items-center justify-center"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-gradient-to-tr from-cyan-500 to-emerald-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
        </span>
        Session Monitor
      </button>
      {open && (
        <div className="pointer-events-auto">
          <Suspense
            fallback={
              <div
                role="status"
                className="absolute right-0 bottom-12 rounded-xl bg-bg-2 p-4 text-xs"
              >
                Loading monitor…
              </div>
            }
          >
            <LiveSessionMonitorPanel onClose={close} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
