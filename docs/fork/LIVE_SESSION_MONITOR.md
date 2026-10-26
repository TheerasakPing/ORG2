# TP Agent Studio — Live Session Monitor (v1)

**Scope:** in-app, read-only *state projection* for sessions already present in
the local session roster. It is **not** a native provider watchdog, a full
backend diagnostic API, a proof of liveness, or an auto-recovery mechanism.

## Entry point and behavior

Open the **Session Monitor** pill at the bottom-right of the Workstation.
The panel is lazy-loaded only after the user clicks it. Closing via its Close
button or Escape unmounts the Jotai session subscriptions, timer and UI.

The display aggregates already-known local/CLI sessions:
- Active and waiting counts, with a compact bounded list of **at most 50**
  rows. Toggle **Active only** to show terminal/idle rows as well.
- Status/phase comes from `sessionsAtom` (backend-persisted roster state), or
  the existing Tauri `agent-live-status:changed` CLI hook registry when a
  matching session id has a hook.
- Native Rust sessions display *provider/tool step unknown* because their
  per-session runtime tool/provider phase is **not** currently available via
  this roster. A CLI hook can display a conservative, syntactically validated
  tool identifier but never a tool input or user prompt.
- The **old status** warning means a `running` row's persisted
  `updated_at` is over ten minutes old. This timestamp is *not* a verified
  provider/tool progress heartbeat. A genuinely running agent may have no
  persisted row updates, and a stuck agent can have frequent unrelated writes.
- Only loaded roster rows are shown. The monitor does **not** claim to have
  enumerated every historical or attached process. Cloud-imported replay
  copies are excluded; local read-only CLI history appears only when a live
  hook with the matching session ID is available.
- **Refresh** explicitly requests the existing single-flight
  `loadSessionRoster({ forceRefresh: true })`. No new backend polling loop,
  new endpoint, channel subscription or periodic roster reload is introduced.

## Lifecycle and performance

- The launcher itself contains no Jotai subscriptions or timers.
- The content and session projections are dynamically imported and mounted
  only when expanded.
- A 30-second clock tick for the displayed *age caution* exists only while
  the panel is open; it is suppressed when the webview is hidden and removed
  on unmount.
- It uses the already-mounted global CLI hook ingestion from
  `AppBootstrap.useAgentLiveStatusSync`. No second event listener is created.
- A single projection scan of the already-loaded array is acceptable on
  opened-panel updates; a 50-row cap bounds rendered DOM work.
- The UI never opens SessionCore conversations or subscribes to transcript,
  tool-input or command-result event streams. Switching between sessions
  does not change its subscription ownership.

## Privacy and security

Only status labels, local session titles, sanitized CLI **tool names** and
caution flags are rendered. Prompt bodies, `toolInputPreview`, pending
question contents, raw error_message, credentials, process commands and
provider endpoints are deliberately excluded from projection. The panel does
not expose a stop/kill/retry button or write session state. It does not auto
navigate to cloud/onboarding surfaces.

All React text output is escaped normally; unsanitized hook
`toolName` is discarded. Hover title is the same *local session name*
already shown by the session roster. Do not treat the screenshot as a
privacy-safe external report if the user's session titles contain secrets.

## Validation and remaining work

```bash
pnpm exec vitest run src/features/SessionHealth/liveSessionMonitorModel.test.ts
pnpm typecheck:fast
pnpm exec eslint src/features/SessionHealth/*.ts src/features/SessionHealth/*.tsx
```

The integration PR must have frontend typecheck, lint, unit-test, production
build, security and OS-specific validations verified separately. This
feature does not certify native Rust sessions on macOS M4, Windows 11 or Linux.

## V2 — Native execution-phase events (stacked PR)

The Rust `UnifiedEventHandler` publishes the new content-free
`agent:monitor_phase` event at three **observed** boundaries:

| Phase | Owning Rust callback | What it proves |
| --- | --- | --- |
| `provider_request` | `on_provider_request` | The request callback was entered, not that the model will respond. |
| `tool_executing` | `on_tool_execute_start` | The tool execution start callback was entered (not merely a proposal). |
| `tool_finished` | `on_tool_result_with_metadata` | A tool result callback was received, not that the tool succeeded. |

The payload contains only `sessionId`, optional `turnId`, enum `phase`
and a conservative, length-bounded tool name. Prompts, tool arguments/results,
file paths, credentials and response bodies are **not** emitted. Group
projection-only turns suppress the ordinary Session surface to respect
existing ownership rules. Outdated/cancelled turn callbacks are ignored
where their lifecycle gates are available.

When the panel is opened, the existing Tauri listener wrapper subscribes
to that sparse phase event and the existing `agent:complete` /
`agent:error` terminal events. A bounded in-memory map tracks at most
128 currently observed Session IDs. Closing the panel drops its listeners
and ephemeral state. The loaded roster retains authoritative persisted
status; phase details never overwrite `running`/`failed` or alter the
real execution pipeline. It does not subscribe to high-frequency
`message_delta` or `thinking_delta` content.

**Important:** this records **transitions**, not periodic provider
heartbeats. A single `provider_request` followed by silence could mean
a slow model, blocked network, paused OS, or a hung future; the Monitor
must not claim to have determined which. The panel also cannot reconstruct
the phase of an already-running turn if it was opened after the transition.

## V3 — Evidence-based progress pulses and quiet-period advisory (stacked PR)

While a Rust agent is producing real provider output, the turn event handler
emits a sparse **`agent:monitor_progress`** signal. Sources are
`on_message_delta`, `on_thinking_delta` and actual tool-call stream
deltas. No pulse is emitted from a mere periodic timer, idle UI repaint or
SQLite timestamp update.

- Throttle: at most **one IPC progress pulse every 10 seconds per owning
  handler**, using a monotonic Rust clock and an atomic compare/exchange.
- Event payload: only `sessionId`, `turnId` and enum
  `kind=response_delta`. No response text, tokens, reasoning, tool-call
  arguments, result, file path or API keys cross the new monitor channel.
- Turn cancellation/generation and Group projection boundary checks apply.
  A new provider request resets the per-handler throttle so the first actual
  delta in that request is observed promptly.
- Frontend accepts a pulse **only** for the same live session + turn, with
  the current phase still `provider_request`; rejects stale, unscoped and
  malformed payloads. It records **last actual delta receipt time**, not a
  fabricated backend heartbeat or liveness proof.
- The monitor reads these signals only while opened. The existing
  30-second panel-only clock recomputes *advisory* thresholds, with no
  separate polling and no changes to the Rust scheduler itself.

| Situation | Threshold | UI interpretation |
| --- | --- | --- |
| Rust entered Provider request, no response delta | 90s | Provider may be slow; ask user to investigate. |
| Provider previously sent deltas, now silent | 120s | No recent output received; cannot prove it hung. |
| Rust started Tool execution, no result callback | 300s | Tool still pending; could legitimately be long-running. |
| Session waiting for user or terminal | None | No false provider/Tool quiet warning. |
| No observed native event (panel opened late) | None | State unknown; do not guess. |

There is **no automatic stop, timeout, retry, kill, database change or
tool replay** in V3. A busy process with zero new tokens may still be
correctly computing; OS sleep, offline mode and an unloaded monitor can
also change time observations. Use this as a diagnostic clue, not as an
availability SLO.

```bash
pnpm exec vitest run src/features/SessionHealth/progressAssessment.test.ts \
  src/features/SessionHealth/nativePhaseEvents.test.ts \
  src/features/SessionHealth/liveSessionMonitorModel.test.ts
```

Synthetic fixture counts of 1/5/20/50 are only **in-memory projection
tests**, not real concurrent Rust/Provider work; native multi-session stress
and safe cancellation/fault injection remain required.
## V3 — passive phase-silence advisories (stacked PR)

While the panel is **open**, each observed native turn receives a local,
ephemeral timestamp. Silence of >=5 minutes is labelled **quiet**; >=60
minutes is **old observation**. Neither indicator is a heartbeat or
proof of a hung worker. A healthy long-running inference/tool and a
blocked worker can both be silent. Sessions not observed by this monitor
are **unknown**, never treated as healthy or failed.

The quiet summary intentionally scopes to the displayed maximum 50
loaded, working, native-phase rows, not the entire installed database
or cloud history. No background intervals, logs, restarts, cancel
requests, database edits or network calls are introduced. The same
30-second in-panel display timer updates these cautions; closing the
panel discards every observation and notification.

V3 remains diagnostics-only: backend watchdogs, monotonic heartbeat
semantics and timeout classification require separate Rust work and
fault-injection tests on actual providers/tools.

## V4 — Scheduler worker polling heartbeat (stacked PR)

The Rust per-session `DialogScheduler` now sends a **content-free**
`agent:scheduler_heartbeat` signal from *inside the same Tokio worker task*
that polls the active Turn future, every **15 seconds** while that Turn is
running. The first tick is eligible immediately after the callback future
begins being awaited. Maintenance jobs do not emit this signal.

Payload fields are limited to `sessionId`, `turnIntentId`, a monotonically
increasing **per-claimed-turn epoch**, a monotonically increasing tick
`sequence`, and `state: alive | finished`. No prompt, tool argument,
provider endpoint, command output, or credentials are attached.

The panel listens only while open and stores up to **128** records. The
`finished` state is retained as a short-lived **epoch tombstone** to reject
late heartbeats from a completed Turn, rather than falsely showing a worker
alive. Out-of-order epochs and duplicate tick sequences cannot refresh the
observed-time clock. Closing the panel discards all observations.

For native sessions currently marked working, the panel shows:
- **Recent:** worker tick seen within 45 seconds.
- **Late:** no new worker tick for at least 45 seconds.
- **Missing:** no new worker tick for at least 2 minutes.
- **Unobserved:** panel did not see a heartbeat, the Turn finished, or
  timing is invalid. **Not evidence of failure.**

The 30-second UI display timer already used by the open Monitor updates
these age categories; no additional polling/IPC requests are introduced.
The Rust heartbeat's timer runs only **while a Turn future is pending**,
and is dropped when the Turn ends or its owning Worker task is aborted.
It never touches the durable queue, session store, provider, or tools.

**Crucial semantics:** This detects whether the **Tokio Scheduler task
continued getting polled**, NOT whether the LLM made progress or a tool
finished. Healthy long model calls and blocked provider futures can still
produce on-time scheduler ticks. A suspended laptop, overloaded event loop,
window hidden, or IPC delivery loss can delay observed ticks. No automatic
kill/retry/replay/restart action is permitted from these indicators.

The existing dead-Worker replacement on **next enqueue** remains as-is.
This PR does not add proactive worker recovery and does not certify
a recovered native turn across app restart.

**Next phases** (not included in v1):
1. Rust-native **session-scoped** scheduler/watchdog heartbeat distinct from response progress, with a
   monotonic per-turn generation and a bounded event schema that never
   includes tool args or prompts.
2. Explicit `waiting_for_provider`, `executing_tool`, retry/error,
   user-approval states from real runtime events; no heuristic classification.
3. Timeouts, cancellation/restart fault injection and 1/5/20/50 concurrent
   native sessions, including safe worker crash/restart handling.
4. Optional rate-limited diagnostics export and operator permissions;
   do not auto-replay potentially side-effectful tool work.

Source roadmap: [ROADMAP.md](ROADMAP.md).
