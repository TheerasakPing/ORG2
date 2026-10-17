//! Read-only counts from the native in-memory per-session DialogSchedulers.
//!
//! The registered AgentSession count is not the Worker count: workers are
//! lazily spawned on first enqueue and may be idle after their last Turn.

use agent_core::session::SchedulerWorkerSnapshot;
use agent_core::state::AgentAppState;
use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeWorkerOverview {
    /// In-memory AgentSession objects, including those with no spawned worker.
    pub registered_sessions: usize,
    /// Session-owned schedulers with no worker task initialized yet.
    pub never_started: usize,
    /// Workers that have been spawned and retained (including terminated).
    pub initialized_workers: usize,
    /// Spawned worker tasks whose task handle and queue receiver look alive.
    pub live_workers: usize,
    /// Running any kind of job, including invisible maintenance work.
    pub busy_workers: usize,
    /// Running user-facing agent Turns (subset of busy_workers).
    pub active_turn_workers: usize,
    /// Running maintenance work (subset of busy_workers).
    pub maintenance_workers: usize,
    /// Spawned, live workers not currently processing a job.
    pub idle_workers: usize,
    /// Retained handles detected finished/closed; next enqueue may replace.
    pub terminated_workers: usize,
    /// Approximate queued message count, excludes jobs currently executing.
    pub queued_jobs: usize,
}

impl NativeWorkerOverview {
    fn accumulate(&mut self, worker: SchedulerWorkerSnapshot) {
        self.registered_sessions += 1;
        self.queued_jobs = self.queued_jobs.saturating_add(worker.pending);
        if !worker.initialized {
            self.never_started += 1;
            return;
        }
        self.initialized_workers += 1;
        if worker.terminated {
            self.terminated_workers += 1;
            return;
        }
        self.live_workers += 1;
        if worker.busy {
            self.busy_workers += 1;
            if worker.turn_processing {
                self.active_turn_workers += 1;
            } else {
                self.maintenance_workers += 1;
            }
        } else {
            self.idle_workers += 1;
        }
    }
}

/// A local diagnostics snapshot, not persistent session history. Returns only
/// aggregates: no session IDs, prompts, tool inputs, paths or tenant metadata.
#[tauri::command]
pub async fn agent_scheduler_worker_overview(
    state: tauri::State<'_, AgentAppState>,
) -> Result<NativeWorkerOverview, String> {
    // Clone handles under the registry lock then release before awaiting each
    // Scheduler. This avoids holding the whole app's session lock across I/O.
    let sessions = {
        let registry = state.sessions.lock().await;
        registry.values().cloned().collect::<Vec<_>>()
    };
    let mut totals = NativeWorkerOverview::default();
    for session in sessions {
        totals.accumulate(session.scheduler.worker_snapshot().await);
    }
    Ok(totals)
}

#[cfg(test)]
mod tests {
    use agent_core::session::SchedulerWorkerSnapshot;

    use super::NativeWorkerOverview;

    fn state(initialized: bool, terminated: bool, busy: bool,
             turn_processing: bool, pending: usize) -> SchedulerWorkerSnapshot {
        SchedulerWorkerSnapshot {
            initialized, terminated, busy, turn_processing, pending,
        }
    }

    #[test]
    fn counts_only_spawned_workers_and_excludes_uninitialized_sessions() {
        let mut s = NativeWorkerOverview::default();
        s.accumulate(state(false, false, false, false, 0));
        s.accumulate(state(true, false, true, true, 2));
        s.accumulate(state(true, false, true, false, 3));
        s.accumulate(state(true, false, false, false, 0));
        s.accumulate(state(true, true, true, true, 1));
        assert_eq!(s.registered_sessions, 5);
        assert_eq!(s.never_started, 1);
        assert_eq!(s.initialized_workers, 4);
        assert_eq!(s.live_workers, 3);
        assert_eq!(s.busy_workers, 2);
        assert_eq!(s.active_turn_workers, 1);
        assert_eq!(s.maintenance_workers, 1);
        assert_eq!(s.idle_workers, 1);
        assert_eq!(s.terminated_workers, 1);
        assert_eq!(s.queued_jobs, 6);
    }

    #[test]
    fn exports_aggregate_keys_only_without_any_session_identifiers() {
        let mut totals = NativeWorkerOverview::default();
        totals.accumulate(state(true, false, false, false, 0));
        let value = serde_json::to_value(totals).unwrap();
        let map = value.as_object().unwrap();
        assert_eq!(map.len(), 9);
        assert_eq!(map["initializedWorkers"], 1);
        assert!(!value.to_string().contains("sessionId"));
        assert!(!value.to_string().contains("turnIntentId"));
    }

    #[test]
    fn empty_registry_is_a_valid_zero_snapshot() {
        let totals = NativeWorkerOverview::default();
        assert_eq!(totals.initialized_workers, 0);
        assert_eq!(totals.live_workers, 0);
        assert_eq!(totals.queued_jobs, 0);
    }
}
