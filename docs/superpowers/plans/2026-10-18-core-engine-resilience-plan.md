# Core Engine Resilience & Watchdog Implementation Plan

> **Goal:** Harden the Rust/Tokio execution engine against long-running tool/turn hangs, enforce concurrency governance on Apple Silicon, and ensure clean crash state reconciliation on startup.

- **Architecture:** Cooperative Watchdog timeout wrappers, global Tokio concurrency governor, and enhanced startup state reconciliation.
- **Reference Spec:** [`docs/superpowers/specs/2026-10-18-core-engine-resilience-design.md`](file:///Volumes/Data/workspace/git/ORG2/docs/superpowers/specs/2026-10-18-core-engine-resilience-design.md)
- **Branch:** `work/macos-m4-beta-readiness`
- **PR:** [#24](https://github.com/TheerasakPing/ORG2/pull/24)

---

## Status: COMPLETED ✅

### Executed Tasks

#### Task 1: Add Concurrency Governor & Permit Management ✅

- **Files:** [`src-tauri/crates/agent-core/src/core/session/scheduler.rs`](file:///Volumes/Data/workspace/git/ORG2/src-tauri/crates/agent-core/src/core/session/scheduler.rs)
- **Implementation:**
  - Implemented `global_turn_governor()` backed by `tokio::sync::Semaphore` (4 permits default on macOS Apple Silicon, configurable via `TP_AGENT_MAX_CONCURRENT_TURNS`, test-aware permit size for barrier tests).
  - Acquired turn permits prior to invoking `inner.process_turn_direct()` and cleanly released on completion or drop guard.
- **Commit:** `1579b3f68`

#### Task 2: Implement Watchdog Timeout Protection ✅

- **Files:** [`src-tauri/crates/agent-core/src/core/session/scheduler.rs`](file:///Volumes/Data/workspace/git/ORG2/src-tauri/crates/agent-core/src/core/session/scheduler.rs)
- **Implementation:**
  - Added global turn timeout wrapper with `tokio::time::timeout(DEFAULT_GLOBAL_TURN_TIMEOUT, ...)` (15 minutes limit), gracefully restoring worker to idle on timeout without process panic.
  - Added unit test `watchdog_timeout_recovers_worker_to_idle` verifying timeout recovery.
  - Verified `cargo test -p agent_core --lib session::scheduler` (25/25 tests passed).
- **Commit:** `1579b3f68`

#### Task 3: Harden Startup State Reconciliation ✅

- **Files:** [`src-tauri/src/app/startup_recovery.rs`](file:///Volumes/Data/workspace/git/ORG2/src-tauri/src/app/startup_recovery.rs)
- **Implementation:**
  - Verified `run_persistence_startup_recovery()` handles stale `running` sessions into `abandoned` or `interrupted_recoverable`.
  - Added test `recovery_report_serializes_cleanly`.
  - Verified `cargo test --lib app::startup_recovery` passes.
- **Commit:** `b039530a0`

#### Task 4: Package, Install & Smoke Test Release Bundle ✅

- **Implementation & Results:**
  - Built production frontend with `pnpm build`.
  - Compiled release binaries and packaged Tauri app & dmg bundles with:
    `ORGII_BUILD_KIND=local APPLE_SIGNING_IDENTITY="-" pnpm exec tauri build --target aarch64-apple-darwin --bundles app,dmg --config '{"build":{"beforeBuildCommand":""}}'`
  - Installed bundle to `/Applications/TP Agent Studio.app` and cleared quarantine via `xattr -cr`.
  - Smoke tested binary execution: started Unified IDE server on `http://127.0.0.1:23847` successfully without crashes or missing dynamic libraries.
  - **Release Artifacts & SHA-256 Hashes:**
    - App Binary: `93ad0865830f9c999284847d0c9166383d3526d6830d40b5b818c541dd3ee1de` (`/Applications/TP Agent Studio.app/Contents/MacOS/org2`)
    - DMG: `8bbc0fc818995caa306a0a08b92affe814f8292e2d5d7c468603b380f834ef1f` (`src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/TP Agent Studio_2.0.8_aarch64.dmg`)
