# Design Spec: Core Engine Resilience and Watchdog Protection

**Date:** 2026-10-18  
**Topic:** Core Engine Resilience, Concurrency Governor, and State Recovery  
**Target Subsystem:** Rust/Tokio Scheduler Backend (`src-tauri/crates/agent-core`, `session-persistence`, `src-tauri/src/app`)

---

## 1. Problem Statement & Motivation

During extended agent operations or heavy multi-session usage, long-running agent tasks risk silent hangs if external tools or remote LLM providers fail to respond. Furthermore, abrupt application restarts or crashes can leave phantom `running` sessions in the persistent SQLite store, preventing clean subsequent turns. Unconstrained concurrent workers can also monopolize Apple Silicon CPU/RAM, degrading UI responsiveness.

This spec establishes a hardened, cooperative resilience architecture encompassing:

1. Cooperative Watchdog with per-tool and global-turn timeouts.
2. Startup state reconciliation ensuring recoverable sessions with clean restart boundaries.
3. A concurrency governor restricting active parallel Tokio workers while keeping FIFO queues predictable.

---

## 2. Architecture & Components

### 2.1 DialogScheduler Watchdog Layer

- **Location:** `src-tauri/crates/agent-core/src/core/session/scheduler.rs`
- **Mechanism:**
  - Wrap turn and tool execution futures with `tokio::time::timeout`.
  - Configurable timeouts:
    - Default Tool Execution Timeout: 90 seconds (extendable per tool definition).
    - Default Global Turn Timeout: 15 minutes.
  - On timeout expiry:
    - Signal cancellation safely without aborting the underlying Tokio worker thread.
    - Record durable state transition as `timed_out`.
    - Return worker state smoothly to `idle` to process subsequent FIFO queue items.

### 2.2 Concurrency Governor (`WorkerGovernor`)

- **Location:** `src-tauri/crates/agent-core/src/core/session/scheduler.rs`
- **Mechanism:**
  - Introduce an `Arc<tokio::sync::Semaphore>` limiting active concurrent turn workers across all sessions.
  - Default permit cap: 4 concurrent active workers on macOS Apple Silicon.
  - When all permits are occupied, new turns remain safely queued in the scheduler's existing FIFO channel without dropping messages or starving resources.

### 2.3 Startup Crash & State Recovery Hardening

- **Location:** `src-tauri/src/app/startup_recovery.rs` & `agent-core/src/core/session/persistence.rs`
- **Mechanism:**
  - During application startup (`run_persistence_startup_recovery`), sweep SQLite for any session remaining in `running` or `in_progress` state.
  - Reconcile stale active records into `interrupted_recoverable`, preserving the last known turn checkpoint.
  - Present a clean resume trigger in the UI rather than replaying destructive side-effectful actions automatically.

---

## 3. Data Flow

```
[User / Frontend]
       │
       ▼
[DialogScheduler::enqueue]
       │
       ▼ (FIFO Channel)
[Worker Loop] ──► Acquire Permit from Concurrency Governor (Max 4 active)
       │
       ▼
[Tokio Watchdog Wrapper] ──► Timeout Watch (90s tool / 15m turn)
       │
       ├─► Normal Completion ──► Release Permit ──► Update SQLite (Completed/NeedsInput)
       │
       └─► Timeout / Error   ──► Abort Future  ──► Release Permit ──► Update SQLite (TimedOut/Recoverable)
```

---

## 4. Error Handling & Edge Cases

- **Cancellation Race:** If a user clicks Stop while the Watchdog is timing out, the synchronous targeted cancel gate (`SchedulerTurnControl`) takes precedence and deduplicates the abort signal.
- **Worker Panic:** Any panic occurring inside a tool execution future is captured via `AssertUnwindSafe(tokio::spawn(...))` so the scheduler loop continues serving the session queue.
- **Resource Cleanup:** Ephemeral child processes spawned by tools are reaped upon cancellation or timeout.

---

## 5. Testing & Verification

1. **Unit & Synthetic Stress Tests:**
   - Add tests in `src-tauri/crates/agent-core/src/core/session/scheduler/` verifying:
     - Synthetic timeout aborts future and releases governor permit.
     - 8 concurrent sessions respect the 4-worker permit limit without starvation.
     - Worker loop remains functional after simulated tool timeout.
2. **Startup Recovery Tests:**
   - Verify in `startup_recovery.rs` that interrupted sessions transition to clean recoverable state.
3. **Workspace Invariants:**
   - Full `cargo test -p agent-core` pass.
   - `node scripts/fork/check-safety.mjs` and `check-icons.mjs` pass.
