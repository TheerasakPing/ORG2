# TP Agent Studio — Session long-running diagnostics (P1)

**Development status (17 October 2026):** source-level feature on the separate
`feature/tp-session-watchdog-observability` branch. Not merged, stress-tested,
or released. PR #9's slow CI is deliberately left untouched.

## Problem

When many sessions run concurrently, a pending LLM, provider, tool, file IO or
desktop-automation Future can keep a queue worker busy. The app can continue
displaying `running` while users see no answer. That alone **does not prove
that the Future is deadlocked**: slow network calls, waiting for approval,
backpressure and an intentional long-running tool can exhibit the same age.

## Non-destructive first-stage implementation

The per-session scheduler wraps the **already panic-protected** executor with
a lightweight observation-only Tokio timer.

- At **180 seconds** of still-pending execution, log a structured warning.
- While still running, repeat every **300 seconds**, not every second.
- A user-facing Turn additionally emits `agent:turn_watchdog` with:
  ```json
  {
    "sessionId": "session-123",
    "messageId": "queued-message-123",
    "elapsedSeconds": 180,
    "warningCount": 1,
    "observeOnly": true
  }
  ```
- Maintenance jobs emit warnings to Rust logs, not a fake user-visible Turn.
- The timer exists only while the worker is active. No app-wide poller,
  detached task, watchdog thread or persistent data is created.
- The warning does **not** change SQLite session status, mark intents failed,
  cancel provider requests, consume queue entries, or retry Tools. The original
  executor result/panic handler/finalizer remains authoritative.
- Only opaque IDs and elapsed time are emitted; user prompts, auth credentials
  and tool arguments are not included.
- The UI does **not** yet consume this diagnostic event. The wire format
  is groundwork for a future compact per-session warning indicator.

## Tested behavior (source tests added; CI execution pending)

`scheduler_watchdog.rs` has fake-Tokio-clock tests for:
1. Quick jobs returning without a false warning.
2. Still-pending work warning at 180 seconds and again at 480 seconds, with
   the executor preserved and completed after explicit release.
3. A completed job not producing a delayed warning after its timer expires.

The tests use `start_paused = true` and `tokio::time::advance`, not
40-minute real-time sleeps.

## Open work before calling this a true stall detector

- Instrument actual **progress** (provider token receipts, tool-start/end,
  interactive approval heartbeat, stdout, DB checkpoint), not elapsed time alone.
- Add per-session and global load diagnostics (CPU/RAM, queue depth,
  open sessions, requests, provider rate limits).
- Distinguish waiting for user approval from network/rate-limit waiting.
- Implement bounded provider timeouts with explicit opt-in retry policy;
  **never** automatically replay a command with possible side effects.
- Add UX: `Running for N min` / `Waiting for approval` / `May be stalled`,
  user-owned Stop and safe Retry only after reconciliation.
- Run 1/5/20/50-session stress and forced close/relaunch tests with durable
  turn-intent/status recovery on macOS M4, Windows 11 and Linux.

**Important:** a long-running warning is **not** evidence of deadlock or a
reason to automatically abort work. Until measured activity signals exist,
the feature is diagnostic only. Leave its roadmap item unchecked until
full progress/heartbeat support and OS acceptance tests pass.
