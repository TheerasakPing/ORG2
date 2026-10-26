# Independent Fork Engineering Guide

This repository is the independent development fork maintained at **TheerasakPing/ORG2**.
Upstream: https://github.com/org2AI/ORG2 (tracked on branch `develop`).
**TP Agent Studio** is the provisional product name. Fork-specific desktop IDs, ports, icons, and runtime storage defaults (`~/.tp-agent-studio`) are active on `develop` following the merge of [PR #23](https://github.com/TheerasakPing/ORG2/pull/23) (`7cf8c3329d9ffd0379f72a1a73b05c84c9f2d210`).

## Release status taxonomy

Always distinguish these five engineering milestones in issues, PRs, and release reports:

1. **Implemented** — Code and configuration exist on the branch (`develop`).
2. **Tested** — Automated unit, integration, lint, typecheck, and synthetic concurrency tests have executed with passing logs.
3. **Built** — Native platform bundles (`.app`, `.dmg`, `.exe`, `.msi`, `.deb`, `.rpm`) have been compiled and packaged.
4. **Installed** — Packaged bundles have been mounted/installed and launched on target hardware (`aarch64-apple-darwin` Mac M4), confirming UI rendering, `org2-pm` sidecar staging, disabled updater, and isolated profile storage (`~/.tp-agent-studio`).
5. **Release-ready** — Official code signing/notarization, fork-owned Cloud/OAuth backend, co-installation migration tests, and live-provider concurrency certification are complete. **TP Agent Studio is currently at the Built & Installed (Unsigned Beta Preview) stage on macOS M4, and is NOT yet Release-ready for signed public distribution.**

## Current safety status

- **Fork exists** with its own GitHub ownership and history (`develop` contains PR #23 merge `7cf8c3329d9ffd0379f72a1a73b05c84c9f2d210`).
- **Unsigned preview builds only (`ORGII_BUILD_KIND=local`).** Official signed production installers are not yet published.
- The base Tauri updater has `plugins.updater.active=false`, an empty endpoints list, and `bundle.createUpdaterArtifacts=false`. Fork README does not link to upstream production installers.
- The custom Rust `check_app_update` command is fail-closed while `FORK_UPDATER_READY=false` in `src-tauri/src/app_update.rs`.
- Original two-tone desktop icon artwork and generated macOS/Windows/Linux icon assets are active for production and Dev, with the default macOS live Dock variant included (see [branding guide](docs/fork/TWO_TONE_BRANDING.md)).
- Base (`com.theerasakping.tpagentstudio`), Dev (`com.theerasakping.tpagentstudio.dev`), and numbered instance (`com.theerasakping.tpagentstudio.instance2..99`) identities, deep-link schemes (`tpagentstudio`, `tpagentstudio-dev`), application data defaults (`~/.tp-agent-studio`, `~/.tp-agent-studio-dev`), and local ports (`23847`/`27888` prod, `23946`/`27987` dev) are isolated from upstream ORG2 (`~/.orgii`, ports `13847`/`17888`).
- `resolve_explicit_home_override` in `src-tauri/src/runtime_instance.rs` rejects any `ORGII_HOME` or `ORGII_EXTERNAL_HISTORY_HOME` override that points at `~/.orgii`, uses parent traversal (`..`), lacks the `.tp-agent-studio` suffix, or traverses a symlinked ancestor.
- The inherited `release.yaml` workflow is guarded to run **only** in `org2AI/ORG2`, not this fork.

## Architecture, reliability & performance improvements

### 1. Native Rust `DialogScheduler` & Worker Overview

- Located in `src-tauri/crates/agent-core/src/core/session/scheduler.rs` and aggregated via `src-tauri/src/agent_sessions/worker_overview.rs`.
- Each registered session lazily spawns at most one Tokio worker task when work is submitted (`execute`, `interrupt`, `abort`, `maintenance`).
- Bounded per-session queue (`MAX_PENDING_JOBS_PER_SESSION = 64`) prevents unbounded memory growth under bursty callers.
- If a worker panics inside its future factory (`AssertUnwindSafe` + `catch_unwind`) or terminates unexpectedly, `ensure_worker_alive()` replaces the dead worker on the next submission and clears stale active flags without replaying failed user turns.
- `NativeWorkerOverviewSection` in the Live Session Monitor displays all 10 runtime counters (`registeredSessions`, `initializedWorkers`, `liveWorkers`, `busyWorkers`, `activeTurnWorkers`, `maintenanceWorkers`, `idleWorkers`, `queuedJobs`, `terminatedWorkers`, `neverStarted`) and syncs with both the top-level panel Refresh button and its own section Refresh button.

### 2. Multi-session diagnostics & safe recovery

- **7-condition disambiguation**:
  1. _UI frozen_: mitigated by bounding Live Session Monitor rendering to 50 rows (`MAX_VISIBLE_SESSIONS = 50`), bounding phase/heartbeat maps to 128 entries (`MAX_TRACKED_SESSIONS = 128`), and using a single 30s visibility-gated age-label interval only while the panel is open.
  2. _Worker heartbeat missing_: `DialogScheduler` emits `agent:scheduler-heartbeat` every 15s during active turn polling; frontend flags `late` (≥45s) and `missing` (≥120s).
  3. _Scheduler task terminated_: `worker_snapshot()` checks `JoinHandle::is_finished()` and reports `Terminated` (`Dead / closed` in UI).
  4. _Provider request pending_: `agent:native-phase` records `provider_request_start`, and `agent:native-progress` emits rate-limited (≥2s) streaming delta pulses.
  5. _Tool execution blocked_: `agent:native-phase` records `tool_execute_start` with sanitized tool name; quiet-period advisories warn after 5m (`quiet`) and 60m (`expired`).
  6. _Session database locked_: SQLite uses `WAL` mode, `busy_timeout = 5000ms`, and bounded retry/backoff; `pm-cli` release confirmation stops at a hard deadline without notifying a busy store.
  7. _Waiting for user input_: `waiting_for_user` and `paused` states are classified into the `attention` bucket and excluded from quiet/hung warnings.
- **Startup recovery**: Reconciles stale `running` / `in_progress` sessions to `abandoned` on app boot across independent phases without replaying tools or aborting subsequent cleanup phases on partial errors.
- **Auto-Dream memory consolidation lease**: `src-tauri/crates/agent-core/src/specialization/memory/workspace_memory/lock.rs` uses an OS-level exclusive non-blocking `flock`/`LockFileEx` lease (`auto-dream.lease`) with a 1-hour stale fallback, preventing multi-process lock contention and double consolidation.

### 3. Build & runtime performance optimizations

- **Dev server & build pipeline**: Rspack is default on macOS and Linux (`dev:frontend:rspack`, `build:web`), cutting frontend bundling time to ~6s.
- **Wrapper sidecar forwarding**: `scripts/tauri/run-with-features.cjs` forwards both `--target <triple>` / `--target=<triple>` and `--profile <prof>` / `--profile=<prof>` to `scripts/tauri/prepare-sidecars.cjs`, preventing redundant host-triple rebuilds during targeted builds.
- **Zero background polling when monitor is closed**: `LiveSessionMonitorPanel` mounts Tauri event listeners and timers only while expanded.

## Recent feature status

The following changes are **Implemented & Tested** on `work/macos-m4-beta-readiness` at `0ff8c489a` and `83b04d2ce`. This status records implementation and focused automated tests, not integration into `develop` or installer certification.

- **Chat Panel Action Stream Feed (`TurnActionFeed`)** displays terminal commands, file reads, and file edits in the turn footer, with timestamps and expandable command output. Resource interactions provide a fallback when detailed action events are absent.
- **Changed Files Tree Card (`TurnChangedFilesTreeCard`)** groups changed files by folder, shows file and folder addition/deletion totals, and supports folder collapse, diff navigation, and summary copying. Both components are integrated into `TurnMetadataFooter`.
- **Window drag fallback (`src/util/platform/windowDrag.ts`)** lets non-interactive descendants of declared drag regions start native dragging on macOS and Linux. Interactive controls, explicit no-drag regions, right clicks, and double clicks are excluded. The fallback is disabled on Windows and outside Tauri desktop, and its listener can be disposed.
- **Conversation continuation and queue recovery (`src/engines/SessionCore/conversations/localConversationSettledTail.ts`)** recovers provider-native output using turn identity or semantic-prefix and matching-user proof. Failed and cancelled turns preserve interrupted suffixes. Lifecycle-only receipts do not count as answers, and unrecoverable missing anchors reach explicit pending or blocked recovery errors instead of silent success.

Verification on 2026-10-19 passed **51 tests across five files** using the command below. Chat coverage tests action extraction and file-tree grouping, not rendered interactions. Window-drag coverage uses jsdom with mocked native APIs. Continuation coverage includes settled-tail and dispatcher recovery regressions. Native macOS/Linux dragging, rendered Chat Panel E2E, live-provider recovery, lint, and typecheck were not run in this documentation audit.

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/engines/ChatPanel/ChatHistory/components/TurnActionFeed/__tests__/actionFeedHelpers.test.ts \
  src/engines/ChatPanel/ChatHistory/components/TurnChangedFilesTreeCard/__tests__/fileTreeHelpers.test.ts \
  src/util/platform/windowDrag.test.ts \
  src/engines/SessionCore/conversations/localConversationSettledTail.test.ts \
  src/features/ConversationContinuation/canonicalConversationDispatcher.recovery.test.ts
```

## Known limitations

1. **Synthetic vs live-provider stress coverage**: The 1, 5, 20, and 50 concurrent session stress tests in `scheduler.rs` validate real Rust `DialogScheduler` / Tokio task scheduling, cancellation, queue bounds, and dead-worker recovery under controlled offline workloads. They **do not** prove 50 concurrent live LLM API streams or external CLI subagent processes.
2. **Unsigned preview installers (`ORGII_BUILD_KIND=local`)**: Preview `.app` and `.dmg` builds on macOS use ad-hoc signing (`APPLE_SIGNING_IDENTITY="-"`). Gatekeeper on other Macs will prompt unless `xattr -cr` is run or Apple Developer ID signing + notarization is configured.
3. **Cloud/OAuth boundary**: Default Cloud endpoints still reference upstream infrastructure (`docs/fork/FORK_CLOUD_BOUNDARY.md`). Do not use production Cloud accounts until fork-owned OAuth/Supabase endpoints are configured.

## Troubleshooting (macOS Apple Silicon M4)

- **`build.rs` panics with `Unsupported ORGII_BUILD_KIND`**:
  Ensure `ORGII_BUILD_KIND=local` is set when building unsigned local/preview bundles (`ORGII_BUILD_KIND=preview` is rejected by `src-tauri/build.rs`).
- **Missing `src-tauri/binaries/org2-pm-aarch64-apple-darwin`**:
  Run `node scripts/tauri/prepare-sidecars.cjs --profile release --target aarch64-apple-darwin` (or let `pnpm tauri:build` invoke it via `run-with-features.cjs`).
- **Gatekeeper "App is damaged or can't be opened" on unsigned `.dmg`**:
  Clear quarantine attributes on local preview builds: `xattr -cr "/Applications/TP Agent Studio.app"`.
- **`ORGII_HOME` rejected at startup**:
  Custom `ORGII_HOME` paths must end with a `.tp-agent-studio*` directory name and must not point inside `~/.orgii` or traverse symlinks.
- **Session appears active with no new output**:
  Open the **Live Session Monitor** (bottom-right status bar) and compare **Phase silence** vs **Scheduler heartbeat** and **Worker Overview**. Never delete `sessions.db`, `-wal`, or `-shm` files while the app is running; see [SESSION_STALL_RECOVERY.md](docs/fork/SESSION_STALL_RECOVERY.md).

## Development and verification commands

```bash
# Fast daily verification loop
pnpm install --frozen-lockfile
node scripts/fork/check-safety.mjs
node scripts/fork/check-identity.mjs
node scripts/fork/check-icons.mjs
pnpm scripts:test
node --test scripts/tauri/*.test.cjs
pnpm typecheck:fast
pnpm lint:fast
pnpm exec vitest run --config config/vitest.config.ts src/features/SessionHealth/

# Targeted Rust reliability & scheduler checks
cargo test --manifest-path src-tauri/Cargo.toml -p agent_core --lib session::scheduler::
cargo test --manifest-path src-tauri/Cargo.toml -p agent_core --lib specialization::memory::workspace_memory::lock::tests
cargo test --manifest-path src-tauri/Cargo.toml -p org2 --lib runtime_instance::tests
cargo test --manifest-path src-tauri/Cargo.toml -p org2 --lib agent_sessions::worker_overview::tests

# macOS M4 native preview installer build
ORGII_BUILD_KIND=local APPLE_SIGNING_IDENTITY="-" \
  pnpm tauri:build --target aarch64-apple-darwin --bundles app,dmg
```

## Contribution and upstream notice

The original ORG2 source, licensing and attribution remain the foundation of this fork.
See [roadmap](docs/fork/ROADMAP.md). Any shipped modifications should record their author, purpose, test evidence and user-facing migration impact.
