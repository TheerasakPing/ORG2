# Core Engine Resilience & Watchdog Implementation Plan

> **Goal:** Harden the Rust/Tokio execution engine against long-running tool/turn hangs, enforce concurrency governance on Apple Silicon, and ensure clean crash state reconciliation on startup.

- **Architecture:** Cooperative Watchdog timeout wrappers, global Tokio concurrency governor, and enhanced startup state reconciliation.
- **Reference Spec:** [`docs/superpowers/specs/2026-10-18-core-engine-resilience-design.md`](file:///Volumes/Data/workspace/git/ORG2/docs/superpowers/specs/2026-10-18-core-engine-resilience-design.md)
- **Branch:** `work/macos-m4-beta-readiness`

---

## Proposed Changes

### `src-tauri/crates/agent-core`

#### [scheduler.rs](file:///Volumes/Data/workspace/git/ORG2/src-tauri/crates/agent-core/src/core/session/scheduler.rs)

- Implement `WorkerGovernor` backed by `Arc<tokio::sync::Semaphore>` (default 4 permits for active parallel turns).
- Add timeout wrapper around turn/tool future execution (`tokio::time::timeout`) with clean abort and idle worker restoration.
- Update `DialogScheduler::new` and worker execution loop to acquire permits and observe watchdog limits.

#### [scheduler/resilience_tests.rs](file:///Volumes/Data/workspace/git/ORG2/src-tauri/crates/agent-core/src/core/session/scheduler/resilience_tests.rs)

- Synthetic unit tests asserting:
  1. Timeout triggers abort and returns worker to idle without panicking.
  2. Concurrency cap permits at most 4 simultaneous running turns, queuing the 5th cleanly.
  3. Permit is released even if the turn times out or panics.

### `src-tauri/src/app`

#### [startup_recovery.rs](file:///Volumes/Data/workspace/git/ORG2/src-tauri/src/app/startup_recovery.rs)

- Strengthen `run_persistence_startup_recovery()` to reconcile stale in-flight turns cleanly into `interrupted_recoverable` without silent dropped turns.

---

## Tasks

### Task 1: Add Concurrency Governor & Permit Management

- **Files:** `src-tauri/crates/agent-core/src/core/session/scheduler.rs`
- **Steps:**
  1. Define global or shared `WorkerGovernor` with a bounded Tokio Semaphore.
  2. Acquire permit in `SchedulerInner::process_message` before executing `ScheduledKind::Turn`.
  3. Release permit in a drop guard or completion block.
  4. Run `cargo test -p agent-core --lib scheduler` to verify existing tests pass.

### Task 2: Implement Watchdog Timeout Protection

- **Files:** `src-tauri/crates/agent-core/src/core/session/scheduler.rs`
- **Steps:**
  1. Wrap turn future with `tokio::time::timeout(turn_timeout, ...)`.
  2. Handle `Elapsed` error: record cancel/timeout state and reset `processing_turn` to false.
  3. Ensure worker remains alive and drains any pending FIFO items.
  4. Write targeted unit test in `src-tauri/crates/agent-core/src/core/session/scheduler/stress_tests.rs`.

### Task 3: Harden Startup State Reconciliation

- **Files:** `src-tauri/src/app/startup_recovery.rs`
- **Steps:**
  1. Verify stale `running` sessions transition to `abandoned` or `interrupted_recoverable`.
  2. Ensure recovery report logs all reconciled session IDs.
  3. Run `cargo test -p app_window` and workspace checks.

### Task 4: Verify Integration, Package & Release Smoke Test

- **Steps:**
  1. Run `cargo test --workspace`.
  2. Run `node scripts/fork/check-safety.mjs`.
  3. Commit and push changes to `origin/work/macos-m4-beta-readiness`.
