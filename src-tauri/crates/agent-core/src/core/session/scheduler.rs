//! Per-session dialog scheduler — non-blocking message queue.
//!
//! ## Problem
//!
//! Without a scheduler, `sde_session_message` holds `processing_lock` for the
//! entire duration of an LLM turn (potentially minutes).  Any subsequent Tauri
//! command call either:
//! - Blocks the calling thread until the lock is released, or
//! - Times out and returns an error to the frontend.
//!
//! ## Solution
//!
//! Each `AgentSession` owns a `DialogScheduler`.  When a new message arrives:
//!
//! 1. The Tauri command enqueues a `ScheduledMessage` and **immediately returns**
//!    `{ "status": "queued", "queuePosition": N }` to the frontend.
//! 2. The scheduler's background worker processes messages one at a time,
//!    executing the full turn pipeline (init → process → finalize).
//! 3. Results are broadcast as `agent:complete` / `agent:error` events — the
//!    same events the frontend already listens to.
//!
//! ## Ordering guarantee
//!
//! Messages are processed **FIFO** within a session.  Cross-session ordering
//! is independent.
//!
//! ## Cancellation
//!
//! Call `AgentSession::cancel_active_turn()` to signal the running turn via
//! the shared `cancel_flag`.  To discard all pending messages, drop and
//! recreate the scheduler (session eviction handles this automatically).
//!
//! ## Lazy initialization
//!
//! The worker task is spawned on the **first enqueue**, not at construction.
//! This avoids requiring a Tokio runtime when `AgentSession::new()` is called
//! from synchronous Tauri state initialization code.

use futures::FutureExt;
use std::any::Any;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::time::Duration;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex as TokioMutex, Semaphore};
use std::sync::OnceLock;
use tokio::time::MissedTickBehavior;
use tracing::{error, info, warn};

use super::turn::streaming::{
    broadcast_agent_error_structured, classify_streaming_error_message, StreamingError,
};
use crate::bus::broadcast_event;

// ============================================
// Scheduler worker heartbeat (observation only, no automatic recovery)
// ============================================

// ============================================
// Concurrency Governor & Watchdog Protection
// ============================================

/// Default maximum parallel active turns permitted across all sessions simultaneously.
pub const DEFAULT_MAX_CONCURRENT_TURNS: usize = 4;

/// Default global turn timeout safeguarding against frozen remote providers or deadlocked tools.
pub const DEFAULT_GLOBAL_TURN_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// Shared global turn concurrency governor enforcing bounded active parallel turns.
pub fn global_turn_governor() -> &'static Arc<Semaphore> {
    static GOVERNOR: OnceLock<Arc<Semaphore>> = OnceLock::new();
    GOVERNOR.get_or_init(|| {
        let max_permits = std::env::var("TP_AGENT_MAX_CONCURRENT_TURNS")
            .ok()
            .and_then(|val| val.parse::<usize>().ok())
            .unwrap_or_else(|| {
                if cfg!(test) {
                    // In synthetic multi-session tests (e.g. 50 barrier-waiting sessions),
                    // allow all synthetic test sessions to enter concurrently so barriers do not deadlock.
                    256
                } else {
                    DEFAULT_MAX_CONCURRENT_TURNS
                }
            });
        Arc::new(Semaphore::new(max_permits))
    })
}

const SCHEDULER_HEARTBEAT_PERIOD: Duration = Duration::from_secs(15);
const SCHEDULER_HEARTBEAT_EVENT: &str = "agent:scheduler_heartbeat";

/// One content-free observation. Epoch fences delayed callbacks from older
/// turns even when the queue generation is unchanged. This does not mean the
/// provider or tool future is progressing: only this worker task reached a
/// Tokio polling boundary.
fn scheduler_heartbeat_payload(
    session_id: &str,
    turn_intent_id: &str,
    epoch: u64,
    sequence: u64,
    state: &'static str,
) -> serde_json::Value {
    serde_json::json!({
        "sessionId": session_id,
        "turnIntentId": turn_intent_id,
        "epoch": epoch,
        "sequence": sequence,
        "state": state,
    })
}

/// Poll the *same* worker task's future and timer: a detached ticker could
/// keep saying alive even if the worker task had died or stopped being polled.
/// A slow awaited model/tool does not block heartbeat polling, but it also
/// does not provide progress evidence. No deadline/abort/replay is introduced.
async fn await_with_scheduler_heartbeat<F: Future>(
    session_id: &str,
    turn_intent_id: &str,
    epoch: u64,
    future: F,
) -> F::Output {
    let mut interval = tokio::time::interval(SCHEDULER_HEARTBEAT_PERIOD);
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    tokio::pin!(future);
    let mut sequence = 0u64;

    loop {
        tokio::select! {
            biased;
            result = &mut future => {
                broadcast_event(
                    SCHEDULER_HEARTBEAT_EVENT,
                    scheduler_heartbeat_payload(session_id, turn_intent_id, epoch, sequence, "finished"),
                );
                return result;
            }
            _ = interval.tick() => {
                broadcast_event(
                    SCHEDULER_HEARTBEAT_EVENT,
                    scheduler_heartbeat_payload(session_id, turn_intent_id, epoch, sequence, "alive"),
                );
                sequence = sequence.saturating_add(1);
            }
        }
    }
}

#[cfg(test)]
mod scheduler_heartbeat_payload_tests {
    use super::scheduler_heartbeat_payload;

    #[test]
    fn heartbeat_contains_only_fenced_noncontent_metadata() {
        let payload = scheduler_heartbeat_payload("s", "turn-intent", 17, 6, "alive");
        assert_eq!(payload["sessionId"], "s");
        assert_eq!(payload["turnIntentId"], "turn-intent");
        assert_eq!(payload["epoch"], 17);
        assert_eq!(payload["sequence"], 6);
        assert_eq!(payload["state"], "alive");
        assert_eq!(payload.as_object().unwrap().len(), 5);
        assert!(!payload.to_string().contains("content"));
        assert!(!payload.to_string().contains("provider"));
    }

    #[test]
    fn terminal_event_is_scoped_to_identical_epoch_and_intent() {
        let payload = scheduler_heartbeat_payload("s", "intent-new", 18, 9, "finished");
        assert_eq!(payload["epoch"], 18);
        assert_eq!(payload["turnIntentId"], "intent-new");
    }

    #[tokio::test]
    async fn observation_does_not_complete_or_cancel_a_pending_turn() {
        use std::time::Duration;

        let (release, pending) = tokio::sync::oneshot::channel::<u32>();
        let observed = tokio::spawn(async move {
            super::await_with_scheduler_heartbeat("session", "turn", 1, async {
                pending.await.expect("test releases pending future")
            }).await
        });
        // Wait long enough for the immediate first interval tick to be
        // eligible, but not for its 15-second follow-up. The wait is NOT an
        // agent timeout and must never cancel the pending future.
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert!(!observed.is_finished());
        release.send(42).expect("listener still owns the pending future");
        let result = tokio::time::timeout(Duration::from_secs(2), observed)
            .await
            .expect("released turn must complete")
            .expect("test task must not panic");
        assert_eq!(result, 42);
    }
}

// ============================================
// Scheduled Message
// ============================================

/// Boxed async callback type for scheduler messages.
pub type ExecuteFn = Box<
    dyn FnOnce() -> futures::future::BoxFuture<'static, Result<ExecutionCompletion, String>>
        + Send
        + 'static,
>;

/// Internal completion only; response content is consumed by the executor.
/// Maintenance and legacy adapters keep their existing completion behavior.
#[derive(Debug)]
pub enum ExecutionCompletion {
    Finished,
    NotAccepted,
    Turn(crate::lifecycle::TerminalTurnSignal),
}

/// What kind of work a queued job represents.
///
/// The worker serializes both kinds identically — the distinction exists
/// because a *turn* is the only thing the rest of the system may treat as
/// "the agent is answering the user":
///
/// - the frontend flips the session to `running` on an active
///   `agent:queue_status` and only flips back on a terminal
///   (`agent:complete` / `agent:error`), which maintenance jobs never emit;
/// - `agent_send_message` diverts a mid-turn message into the running turn's
///   `steering_queue`, which only a turn loop ever drains.
///
/// A maintenance job that advertised itself as a turn would therefore strand
/// the session in `running` and swallow the next user message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScheduledKind {
    /// A user-facing agent turn: broadcasts running status, drains steering.
    Turn,
    /// Internal work that must not overlap a turn (e.g. manual compaction).
    /// Occupies the worker but is invisible to turn-lifecycle consumers.
    Maintenance,
}

/// A single message waiting to be processed by the scheduler worker.
pub struct ScheduledMessage {
    /// Whether this job is a user-facing turn or internal maintenance.
    pub kind: ScheduledKind,
    /// Stable ID for this queued item (different from `turn_id`, which is
    /// assigned only when the message actually starts executing).
    pub message_id: String,
    /// Generation captured at enqueue time. Rewind/edit-resend invalidates
    /// queued stale generations so old user intent cannot write back later.
    pub generation: u64,
    /// Client-supplied idempotency key for suppressing duplicate sends.
    pub client_message_id: Option<String>,
    /// Canonical user-intent id. Stays stable across the IPC boundary and
    /// is written into the persisted user_message event so the turn
    /// indexer can collapse synthetic + backend rows that share the same
    /// id. Empty only on the rare turn paths that intentionally skip
    /// user-message persistence (resume with empty content).
    pub turn_intent_id: String,
    /// Durable Agent Org run that owns this turn, when any. The scheduler
    /// uses this only after the intent reaches a terminal state so Quiescence
    /// is rechecked after (not before) the current intent stops blocking it.
    pub org_run_id: Option<String>,
    /// The user content to process.
    pub content: String,
    /// Opaque processing callback.  Boxed future factory so the scheduler
    /// does not need to know about `TurnInput` / session internals.
    pub execute: ExecuteFn,
}

/// Decrement a pending-message counter only when nonzero, retaining
/// exactly the old checked_sub + fetch_update semantics on Rust MSRV 1.85.
fn decrement_pending(counter: &AtomicUsize) {
    let mut current = counter.load(Ordering::Acquire);
    while current > 0 {
        match counter.compare_exchange_weak(
            current,
            current - 1,
            Ordering::AcqRel,
            Ordering::Acquire,
        ) {
            Ok(_) => return,
            Err(actual) => current = actual,
        }
    }
}

#[cfg(test)]
mod atomic_pending_tests {
    use super::decrement_pending;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn pending_counter_never_underflows() {
        let count = Arc::new(AtomicUsize::new(7));
        let tasks: Vec<_> = (0..20)
            .map(|_| {
                let count = Arc::clone(&count);
                std::thread::spawn(move || decrement_pending(&count))
            })
            .collect();
        for handle in tasks {
            handle.join().unwrap();
        }
        assert_eq!(count.load(Ordering::Acquire), 0);
    }
}

pub(crate) fn panic_payload_to_string(payload: &(dyn Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return (*message).to_string();
    }
    "non-string panic payload".to_string()
}

impl std::fmt::Debug for ScheduledMessage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScheduledMessage")
            .field("message_id", &self.message_id)
            .field("kind", &self.kind)
            .field("content_len", &self.content.len())
            .finish()
    }
}

// ============================================
// Queue Status (serializable for Tauri events)
// ============================================

/// Current queue state, broadcast as `agent:queue_status`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStatus {
    pub session_id: String,
    /// Number of messages waiting (not including the one currently running).
    pub pending_count: usize,
    /// Whether a **turn** is currently being processed. Deliberately not
    /// "the worker is busy": the frontend turns this into the session's
    /// `running` status and only clears it on a turn terminal event, so a
    /// maintenance job must never set it.
    pub is_processing: bool,
}

// ============================================
// Enqueue Result
// ============================================

/// Returned to the Tauri command caller after a successful enqueue.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueResult {
    pub message_id: String,
    /// Zero-based position in the queue (0 = next to run).
    pub queue_position: usize,
    #[serde(default)]
    pub duplicate: bool,
}

/// Read-only, ephemeral snapshot of one session-owned Scheduler.
#[derive(Debug, Clone, Copy)]
pub struct SchedulerWorkerSnapshot {
    /// The scheduler has started a worker task at least once in this lifetime.
    pub initialized: bool,
    /// Tokio join handle or receiver indicates the worker is no longer live.
    pub terminated: bool,
    /// Any job, including maintenance, is currently being processed.
    pub busy: bool,
    /// Whether the active job is a user-facing Turn (not maintenance).
    pub turn_processing: bool,
    /// Approximate number of queued jobs, excluding the current job.
    pub pending: usize,
}

// ============================================
// DialogScheduler
// ============================================

/// Inner state initialized lazily on first enqueue.
struct SchedulerInner {
    tx: mpsc::Sender<ScheduledMessage>,
    /// Retain the worker handle to detect unexpected task termination.
    worker: tokio::task::JoinHandle<()>,
}

/// Per-session FIFO message queue with a single background worker.
///
/// Created once per `AgentSession` and kept alive for the session lifetime.
/// The worker task shuts down when the sender half is dropped (i.e. when the
/// session is removed from the registry).
///
/// **Lazy initialization**: The background worker is only spawned on the first
/// call to `enqueue()`. This allows `AgentSession::new()` to be called from
/// synchronous code (like Tauri state initialization) without requiring a
/// Tokio runtime.
pub struct DialogScheduler {
    /// Session this scheduler belongs to.
    session_id: String,
    /// Channel capacity.
    capacity: usize,
    /// Lazily initialized sender. `None` until first `enqueue()`.
    inner: TokioMutex<Option<SchedulerInner>>,
    /// Approximate pending count (best-effort; not a strong guarantee).
    pending: Arc<AtomicUsize>,
    /// Monotonic queue generation. Incrementing this invalidates messages
    /// enqueued under older generations without needing to recreate the worker.
    generation: Arc<AtomicU64>,
    /// Monotonic identity for every claimed Turn; unlike queue generation it
    /// changes for each Turn, fencing delayed/duplicate UI heartbeats.
    heartbeat_epoch: Arc<AtomicU64>,
    /// Whether the worker is currently executing a message of any kind.
    processing: Arc<std::sync::atomic::AtomicBool>,
    /// Whether the job the worker is currently executing is a [`ScheduledKind::Turn`].
    processing_turn: Arc<std::sync::atomic::AtomicBool>,
    client_message_ids: Arc<TokioMutex<HashMap<String, String>>>,
    /// Exact targeted cancellation gate. The worker claims `current` and
    /// checks `cancelled` under one synchronous lock, closing the race where
    /// Stop lands after dequeue but before the Turn installs its cancel flag.
    turn_control: Arc<parking_lot::Mutex<SchedulerTurnControl>>,
}

// The durable direct-work FIFO admits at most 32 queued/running Turns per
// Member in production. Keep a second window for dequeue races, while
// preventing stale Stop ids from becoming app-lifetime retained state. The
// database terminal row remains the authoritative Provider-start fence even
// if an old in-memory id is evicted here.
const MAX_TARGETED_CANCELLATIONS: usize = 64;

#[derive(Default)]
struct SchedulerTurnControl {
    current: Option<String>,
    cancelled: HashSet<String>,
}

impl DialogScheduler {
    /// Create a new scheduler. The background worker is **not** started yet;
    /// it will be spawned lazily on the first call to `enqueue()`.
    ///
    /// `capacity` is the maximum number of queued-but-not-yet-started messages.
    /// Once full, `enqueue` returns an error so the caller can surface
    /// "session queue full" to the user.
    pub fn new(session_id: impl Into<String>, capacity: usize) -> Self {
        Self {
            session_id: session_id.into(),
            capacity,
            inner: TokioMutex::new(None),
            pending: Arc::new(AtomicUsize::new(0)),
            generation: Arc::new(AtomicU64::new(0)),
            heartbeat_epoch: Arc::new(AtomicU64::new(0)),
            processing: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            processing_turn: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            client_message_ids: Arc::new(TokioMutex::new(HashMap::new())),
            turn_control: Arc::new(parking_lot::Mutex::new(SchedulerTurnControl::default())),
        }
    }
    /// Ensure the worker is spawned and return a reference to the sender.
    async fn ensure_initialized(&self) -> mpsc::Sender<ScheduledMessage> {
        let mut guard = self.inner.lock().await;
        if let Some(inner) = guard.as_ref() {
            if !inner.worker.is_finished() && !inner.tx.is_closed() {
                return inner.tx.clone();
            }

            // A previous worker died (for example, from a panic outside the
            // turn executor). Its receiver is gone, but the retained sender
            // makes the scheduler appear initialized forever. Reset only the
            // now-orphaned in-memory queue, never replay dropped tool effects.
            warn!(
                session_id = %self.session_id,
                "[scheduler] worker terminated unexpectedly; replacing closed queue"
            );
            self.generation.fetch_add(1, Ordering::AcqRel);
            self.pending.store(0, Ordering::Release);
            let was_running_turn = self.processing_turn.swap(false, Ordering::AcqRel);
            self.processing.store(false, Ordering::Release);
            self.client_message_ids.lock().await.clear();
            let interrupted = {
                let mut control = self.turn_control.lock();
                control.cancelled.clear();
                control.current.take()
            };
            if let Some(ref turn_id) = interrupted {
                crate::foundation::session_bridge::update_turn_intent_status(
                    &self.session_id,
                    turn_id,
                    crate::foundation::session_bridge::TurnIntentBridgeStatus::Failed,
                );
            }
            crate::foundation::session_bridge::mark_pending_turn_intents_stale(&self.session_id);
            if was_running_turn {
                if let Err(err) = crate::session::persistence::update_status(
                    &self.session_id,
                    crate::session::SessionStatus::Abandoned,
                ) {
                    warn!(
                        session_id = %self.session_id,
                        error = %err,
                        "[scheduler] could not persist interrupted session status"
                    );
                }
                let streaming_error = StreamingError::new(
                    "Session worker stopped unexpectedly; the interrupted turn was not replayed. Send a new message to retry.".to_string(),
                    classify_streaming_error_message("Session worker stopped unexpectedly"),
                );
                broadcast_agent_error_structured(&self.session_id, &streaming_error);
            }
            self.broadcast_queue_status();
        }

        // First enqueue or replace a dead worker — spawn a new receiver
        let (tx, rx) = mpsc::channel::<ScheduledMessage>(self.capacity);

        let worker = WorkerTask {
            session_id: self.session_id.clone(),
            rx,
            pending: Arc::clone(&self.pending),
            generation: Arc::clone(&self.generation),
            heartbeat_epoch: Arc::clone(&self.heartbeat_epoch),
            processing: Arc::clone(&self.processing),
            processing_turn: Arc::clone(&self.processing_turn),
            client_message_ids: Arc::clone(&self.client_message_ids),
            turn_control: Arc::clone(&self.turn_control),
        };
        let worker = tokio::spawn(worker.run());

        info!(
            "[scheduler] Worker spawned for session={} (capacity={})",
            self.session_id, self.capacity
        );

        *guard = Some(SchedulerInner {
            tx: tx.clone(),
            worker,
        });
        tx
    }

    /// Enqueue a message for processing.
    ///
    /// Returns immediately with the queue position, or an error if the queue
    /// is full (`TrySendError::Full`) or closed (`TrySendError::Closed`).
    ///
    /// **Note**: This method is `async` because lazy initialization requires
    /// holding a lock to spawn the worker on first use.
    pub async fn enqueue(&self, mut msg: ScheduledMessage) -> Result<EnqueueResult, String> {
        let tx = self.ensure_initialized().await;

        let message_id = msg.message_id.clone();
        if let Some(client_message_id) = msg.client_message_id.as_ref() {
            let mut ids = self.client_message_ids.lock().await;
            if let Some(existing_turn_intent_id) = ids.get(client_message_id) {
                // This request minted its own durable intent before enqueue,
                // but an equivalent client message is already queued/running.
                // A retry of the exact same Turn must leave that original
                // durable intent untouched; only a newly-minted equivalent
                // Turn is terminalized as coalesced.
                if existing_turn_intent_id != &msg.turn_intent_id {
                    crate::foundation::session_bridge::update_turn_intent_status(
                        &self.session_id,
                        &msg.turn_intent_id,
                        crate::foundation::session_bridge::TurnIntentBridgeStatus::Coalesced,
                    );
                }
                return Ok(EnqueueResult {
                    message_id,
                    queue_position: 0,
                    duplicate: true,
                });
            }
            ids.insert(client_message_id.clone(), msg.turn_intent_id.clone());
        }

        msg.generation = self.generation.load(Ordering::Acquire);
        let queue_position = self.pending.fetch_add(1, Ordering::Relaxed);

        match tx.try_send(msg) {
            Ok(()) => {
                let result = EnqueueResult {
                    message_id,
                    queue_position,
                    duplicate: false,
                };
                self.broadcast_queue_status();
                Ok(result)
            }
            Err(mpsc::error::TrySendError::Full(rejected)) => {
                self.pending.fetch_sub(1, Ordering::Relaxed);
                if let Some(client_message_id) = rejected.client_message_id.as_ref() {
                    self.client_message_ids
                        .lock()
                        .await
                        .remove(client_message_id);
                }
                crate::foundation::session_bridge::update_turn_intent_status(
                    &self.session_id,
                    &rejected.turn_intent_id,
                    crate::foundation::session_bridge::TurnIntentBridgeStatus::Rejected,
                );
                Err(format!(
                    "Session queue is full — message rejected (content_len={})",
                    rejected.content.len()
                ))
            }
            Err(mpsc::error::TrySendError::Closed(rejected)) => {
                self.pending.fetch_sub(1, Ordering::Relaxed);
                if let Some(client_message_id) = rejected.client_message_id.as_ref() {
                    self.client_message_ids
                        .lock()
                        .await
                        .remove(client_message_id);
                }
                crate::foundation::session_bridge::update_turn_intent_status(
                    &self.session_id,
                    &rejected.turn_intent_id,
                    crate::foundation::session_bridge::TurnIntentBridgeStatus::Rejected,
                );
                Err("Session scheduler has shut down".to_string())
            }
        }
    }

    /// Current number of pending messages (not including any running turn).
    pub fn pending_count(&self) -> usize {
        self.pending.load(Ordering::Relaxed)
    }

    /// Invalidate all queued messages that have not started yet.
    pub fn invalidate_pending(&self) {
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.pending.store(0, Ordering::Release);
        if let Ok(mut ids) = self.client_message_ids.try_lock() {
            ids.clear();
        }
        // Lifecycle: every still-queued / optimistic intent for this
        // session walks to `stale`. The worker drops queued-but-stale
        // messages on its next `recv` (see WorkerTask::run); the durable
        // log here ensures the turn indexer also stops grouping events
        // under those ids.
        crate::foundation::session_bridge::mark_pending_turn_intents_stale(&self.session_id);
        self.broadcast_queue_status();
    }

    /// Invalidate exactly one queued Turn. Returns `true` when the worker has
    /// already claimed that same Turn, in which case the caller must also
    /// signal the active Turn's cancellation flag.
    pub fn invalidate_turn(&self, turn_intent_id: &str) -> bool {
        let mut control = self.turn_control.lock();
        let is_current = control.current.as_deref() == Some(turn_intent_id);
        control.cancelled.insert(turn_intent_id.to_string());
        while control.cancelled.len() > MAX_TARGETED_CANCELLATIONS {
            let eviction = control
                .cancelled
                .iter()
                .find(|candidate| {
                    candidate.as_str() != turn_intent_id
                        && Some(candidate.as_str()) != control.current.as_deref()
                })
                .cloned();
            let Some(eviction) = eviction else {
                break;
            };
            control.cancelled.remove(&eviction);
        }
        is_current
    }

    pub fn current_turn_intent_id(&self) -> Option<String> {
        self.turn_control.lock().current.clone()
    }

    pub fn turn_is_invalidated(&self, turn_intent_id: &str) -> bool {
        self.turn_control.lock().cancelled.contains(turn_intent_id)
    }

    /// Snapshot the in-memory Worker state without creating a worker, queue,
    /// data source or performing any database I/O. The status is best effort
    /// while a concurrent enqueue/dequeue may advance between atomics.
    pub async fn worker_snapshot(&self) -> SchedulerWorkerSnapshot {
        let worker = self.inner.lock().await;
        let initialized = worker.is_some();
        let terminated = worker.as_ref().is_some_and(|entry| {
            entry.worker.is_finished() || entry.tx.is_closed()
        });
        SchedulerWorkerSnapshot {
            initialized,
            terminated,
            busy: self.is_processing(),
            turn_processing: self.is_turn_processing(),
            pending: self.pending_count(),
        }
    }

    /// Whether the worker is currently executing a job of any kind.
    ///
    /// This is "the worker is busy" — it includes maintenance jobs. Callers
    /// asking "is the agent answering the user right now?" want
    /// [`Self::is_turn_processing`] instead.
    pub fn is_processing(&self) -> bool {
        self.processing.load(Ordering::Relaxed)
    }

    /// Whether the worker is currently executing a user-facing turn.
    pub fn is_turn_processing(&self) -> bool {
        self.processing_turn.load(Ordering::Relaxed)
    }

    /// Snapshot of the current queue state.
    pub fn status(&self) -> QueueStatus {
        QueueStatus {
            session_id: self.session_id.clone(),
            pending_count: self.pending_count(),
            is_processing: self.is_turn_processing(),
        }
    }

    fn broadcast_queue_status(&self) {
        broadcast_event(
            "agent:queue_status",
            serde_json::to_value(self.status()).expect("QueueStatus serialization is infallible"),
        );
    }
}

#[cfg(test)]
mod worker_snapshot_tests {
    use super::DialogScheduler;

    #[tokio::test]
    async fn snapshot_does_not_spawn_uninitialized_worker() {
        let scheduler = DialogScheduler::new("snapshot-lazy", 4);
        let observation = scheduler.worker_snapshot().await;
        assert!(!observation.initialized);
        assert!(!observation.terminated);
        assert!(!observation.busy);
        assert!(!observation.turn_processing);
        assert_eq!(observation.pending, 0);
        // Merely reading state should not create an inner handle.
        assert!(scheduler.inner.lock().await.is_none());
    }

    #[tokio::test]
    async fn snapshot_distinguishes_spawned_idle_from_unstarted_worker() {
        let scheduler = DialogScheduler::new("snapshot-idle", 4);
        let tx = scheduler.ensure_initialized().await;
        let observation = scheduler.worker_snapshot().await;
        assert!(observation.initialized);
        assert!(!observation.terminated);
        assert!(!observation.busy);
        assert!(!observation.turn_processing);
        assert_eq!(observation.pending, 0);
        drop(tx);
    }
}

// ============================================
// Worker Task
// ============================================

struct WorkerTask {
    session_id: String,
    rx: mpsc::Receiver<ScheduledMessage>,
    pending: Arc<AtomicUsize>,
    generation: Arc<AtomicU64>,
    heartbeat_epoch: Arc<AtomicU64>,
    processing: Arc<std::sync::atomic::AtomicBool>,
    processing_turn: Arc<std::sync::atomic::AtomicBool>,
    client_message_ids: Arc<TokioMutex<HashMap<String, String>>>,
    turn_control: Arc<parking_lot::Mutex<SchedulerTurnControl>>,
}

impl WorkerTask {
    async fn run(mut self) {
        info!("[scheduler] Worker started for session {}", self.session_id);

        while let Some(msg) = self.rx.recv().await {
            let targeted_cancelled = {
                let mut control = self.turn_control.lock();
                if control.cancelled.remove(&msg.turn_intent_id) {
                    true
                } else {
                    control.current = Some(msg.turn_intent_id.clone());
                    false
                }
            };
            if targeted_cancelled {
                decrement_pending(&self.pending);
                crate::foundation::session_bridge::update_turn_intent_status(
                    &self.session_id,
                    &msg.turn_intent_id,
                    crate::foundation::session_bridge::TurnIntentBridgeStatus::Cancelled,
                );
                if let Some(client_message_id) = msg.client_message_id.as_ref() {
                    self.client_message_ids
                        .lock()
                        .await
                        .remove(client_message_id);
                }
                self.broadcast_idle_status();
                continue;
            }
            let current_generation = self.generation.load(Ordering::Acquire);
            if msg.generation != current_generation {
                info!(
                    "[scheduler] Skipping stale message {} for session {} (message_generation={}, current_generation={})",
                    msg.message_id, self.session_id, msg.generation, current_generation
                );
                // Lifecycle: invalidate_pending may have already marked
                // this intent stale; double-write is harmless because
                // the state machine treats it as a same-state update.
                // Cover the case where invalidate_pending ran while this
                // particular message was already past the channel boundary.
                crate::foundation::session_bridge::update_turn_intent_status(
                    &self.session_id,
                    &msg.turn_intent_id,
                    crate::foundation::session_bridge::TurnIntentBridgeStatus::Stale,
                );
                if let Some(client_message_id) = msg.client_message_id.as_ref() {
                    self.client_message_ids
                        .lock()
                        .await
                        .remove(client_message_id);
                }
                self.broadcast_idle_status();
                self.turn_control.lock().current = None;
                continue;
            }

            decrement_pending(&self.pending);

            let is_turn = msg.kind == ScheduledKind::Turn;
            self.processing.store(true, Ordering::Relaxed);
            self.processing_turn.store(is_turn, Ordering::Relaxed);

            info!(
                "[scheduler] Processing {:?} {} for session {}",
                msg.kind, msg.message_id, self.session_id
            );

            // Lifecycle: queued → running.
            crate::foundation::session_bridge::update_turn_intent_status(
                &self.session_id,
                &msg.turn_intent_id,
                crate::foundation::session_bridge::TurnIntentBridgeStatus::Running,
            );

            // Broadcast "now processing" status. Turn-only: the frontend
            // reads an active queue status as "a turn started" and clears it
            // only on a turn terminal event, which maintenance jobs never
            // emit — advertising one here would strand the session in
            // `running` and swallow every later user message.
            if is_turn {
                broadcast_event(
                    "agent:queue_status",
                    serde_json::json!({
                        "sessionId": self.session_id,
                        "pendingCount": self.pending.load(Ordering::Relaxed),
                        "isProcessing": true,
                        "currentMessageId": msg.message_id,
                    }),
                );
            }

            let client_message_id = msg.client_message_id.clone();
            let turn_intent_id = msg.turn_intent_id.clone();
            let org_run_id = msg.org_run_id.clone();
            // The factory itself can panic before it returns a Future.
            // Place its invocation INSIDE the catch boundary so an otherwise
            // valid per-session worker cannot disappear with a live sender.
            let execute = msg.execute;
            let execution = std::panic::AssertUnwindSafe(async move { execute().await })
                .catch_unwind();

            // Active turns acquire a concurrency permit from the global governor
            // to prevent worker storm or runaway resource exhaustion.
            let _permit = if is_turn {
                match global_turn_governor().acquire().await {
                    Ok(permit) => Some(permit),
                    Err(_) => {
                        warn!(
                            session_id = %self.session_id,
                            "Governor semaphore closed, proceeding without permit"
                        );
                        None
                    }
                }
            } else {
                None
            };

            // Heartbeat from inside the actual scheduler worker, never from a
            // detached timer. Active turns are also safeguarded by a global timeout.
            let outcome = if is_turn {
                let epoch = self.heartbeat_epoch.fetch_add(1, Ordering::AcqRel) + 1;
                let heartbeat_future = await_with_scheduler_heartbeat(
                    &self.session_id,
                    &turn_intent_id,
                    epoch,
                    execution,
                );
                match tokio::time::timeout(DEFAULT_GLOBAL_TURN_TIMEOUT, heartbeat_future).await {
                    Ok(completed_outcome) => completed_outcome,
                    Err(_) => {
                        error!(
                            "[scheduler] Global turn timeout exceeded ({:?}) for session {} message {}",
                            DEFAULT_GLOBAL_TURN_TIMEOUT, self.session_id, msg.message_id
                        );
                        Ok(Err(format!(
                            "Turn execution timed out after {:?}; worker restored to idle.",
                            DEFAULT_GLOBAL_TURN_TIMEOUT
                        )))
                    }
                }
            } else {
                execution.await
            };
            let result = outcome.unwrap_or_else(|panic_payload| {
                    let panic_message = panic_payload_to_string(panic_payload.as_ref());
                    error!(
                        "[scheduler] Turn executor panicked for session {} message {}: {}",
                        self.session_id, msg.message_id, panic_message
                    );
                    Err(format!(
                        "Turn executor panicked unexpectedly: {}",
                        panic_message
                    ))
                });

            let should_reconcile_agent_org_run = match result {
                Ok(completion) => {
                    let unaccepted = matches!(completion, ExecutionCompletion::NotAccepted);
                    let status = match completion {
                        ExecutionCompletion::Turn(signal) => signal.status,
                        ExecutionCompletion::NotAccepted => {
                            crate::lifecycle::TurnTerminalStatus::Cancelled
                        }
                        ExecutionCompletion::Finished => {
                            crate::lifecycle::TurnTerminalStatus::Completed
                        }
                    };
                    info!(
                        "[scheduler] Message {} completed for session {}",
                        msg.message_id, self.session_id
                    );
                    if let Some(run_id) = org_run_id
                        .as_deref()
                        .filter(|_| status == crate::lifecycle::TurnTerminalStatus::Completed)
                    {
                        match crate::coordination::agent_org_turn_contexts::optional_context_for_session(
                            &self.session_id,
                            &turn_intent_id,
                        ) {
                            Ok(Some(context))
                                if context.turn_kind
                                    == crate::coordination::agent_org_turn_contexts::AgentOrgTurnKind::Coordinator
                                    && context.source_kind.is_coordinator_root() =>
                            {
                                if let Err(error) = crate::coordination::agent_org_turn_contexts::mark_waiting_for_org_event_if_current(
                                    run_id,
                                    &self.session_id,
                                    &turn_intent_id,
                                ) {
                                    warn!(
                                        run_id,
                                        session_id = %self.session_id,
                                        turn_intent_id,
                                        error = %error,
                                        "[scheduler] failed to persist Coordinator event-waiting terminal reason"
                                    );
                                }
                            }
                            Ok(_) => {}
                            Err(error) => warn!(
                                run_id,
                                session_id = %self.session_id,
                                turn_intent_id,
                                error = %error,
                                "[scheduler] failed to inspect Agent Org Turn kind at completion"
                            ),
                        }
                    }
                    // Consume the explicit terminal, including Cancelled with an Ok executor return.
                    if org_run_id.is_none() || unaccepted {
                        crate::foundation::session_bridge::update_turn_intent_status(
                            &self.session_id,
                            &turn_intent_id,
                            status.intent_status(),
                        );
                    }
                    // agent:complete is already broadcast by processor; we
                    // only broadcast the updated queue status here.
                    true
                }
                Err(ref err) => {
                    warn!(
                        "[scheduler] Message {} failed for session {}: {}",
                        msg.message_id, self.session_id, err
                    );
                    let user_directed_waiting = err.starts_with(
                        crate::state::commands::session::message::USER_DIRECTED_WAITING_ERROR_PREFIX,
                    );
                    let user_directed_cancelled = err.starts_with(
                        crate::state::commands::session::message::USER_DIRECTED_CANCELLED_ERROR_PREFIX,
                    );
                    let terminal_final_summary_failure = is_terminal_final_summary_failure_for_run(
                        org_run_id.as_deref(),
                        &self.session_id,
                        &turn_intent_id,
                    );
                    let already_terminal =
                        crate::foundation::session_bridge::get_turn_intent_status(
                            &self.session_id,
                            &turn_intent_id,
                        )
                        .is_some_and(|status| !status.is_in_flight());
                    let stale_callback = msg.generation != self.generation.load(Ordering::Acquire);
                    if already_terminal || stale_callback {
                        info!(session_id = %self.session_id, turn_intent_id, "ignoring terminal or stale executor fallback");
                    } else if user_directed_waiting {
                        info!(
                            session_id = %self.session_id,
                            turn_intent_id = %turn_intent_id,
                            "[scheduler] direct Turn remains durably queued for intervention yield"
                        );
                    } else if user_directed_cancelled {
                        info!(
                            session_id = %self.session_id,
                            turn_intent_id = %turn_intent_id,
                            "[scheduler] exact direct Turn was cancelled before Provider execution"
                        );
                    } else {
                        // Lifecycle: running → failed. Cancelled turns walk
                        // here too (the executor returns Err on user stop).
                        crate::foundation::session_bridge::update_turn_intent_status(
                            &self.session_id,
                            &turn_intent_id,
                            crate::foundation::session_bridge::TurnIntentBridgeStatus::Failed,
                        );
                    }
                    // If the callback failed before its normal finalizer
                    // ran, the session DB can still say "running" while the
                    // in-memory worker has already moved on. Clear that
                    // phantom status for ordinary failed turns. Never alter
                    // previously terminal, stale, or intervention-owned work.
                    if is_turn
                        && !already_terminal
                        && !stale_callback
                        && !user_directed_waiting
                        && !user_directed_cancelled
                    {
                        if let Err(error) = crate::session::persistence::update_status(
                            &self.session_id,
                            crate::session::SessionStatus::Failed,
                        ) {
                            warn!(
                                session_id = %self.session_id,
                                error = %error,
                                "[scheduler] failed to persist failed turn session status"
                            );
                        }
                    }
                    // Turn-only: an `agent:error` renders as a chat bubble.
                    // Maintenance jobs report failures through their own
                    // channel (e.g. the manual-compact command's reply).
                    if is_turn
                        && !already_terminal
                        && !stale_callback
                        && !user_directed_waiting
                        && !user_directed_cancelled
                    {
                        let error_code = classify_streaming_error_message(err);
                        let streaming_error = StreamingError::new(err.clone(), error_code)
                            .with_details(serde_json::json!({
                                "messageId": msg.message_id,
                                "turnIntentId": turn_intent_id,
                            }));
                        broadcast_agent_error_structured(&self.session_id, &streaming_error);
                    }
                    terminal_final_summary_failure
                }
            };

            if should_reconcile_agent_org_run {
                if let Some(run_id) = org_run_id.as_deref() {
                    reconcile_agent_org_run_after_terminal(run_id).await;
                }
            }

            // `finalize_session` emits its session-change notification before
            // the scheduler persists the generic Turn-intent terminal above.
            // A Group projection refresh racing that earlier notification can
            // therefore still observe `running`. Publish once more only after
            // the terminal write so the run-scoped, debounced frontend store
            // is guaranteed to converge without polling.
            if let Some(run_id) = org_run_id.as_deref() {
                crate::coordination::agent_org_run_events::notify_agent_org_run_changed(run_id);
            }

            {
                let mut control = self.turn_control.lock();
                if control.current.as_deref() == Some(turn_intent_id.as_str()) {
                    control.current = None;
                }
                control.cancelled.remove(&turn_intent_id);
            }

            if let Some(client_message_id) = client_message_id.as_ref() {
                self.client_message_ids
                    .lock()
                    .await
                    .remove(client_message_id);
            }
            self.processing_turn.store(false, Ordering::Relaxed);
            self.processing.store(false, Ordering::Relaxed);
            self.broadcast_idle_status();
        }

        info!("[scheduler] Worker stopped for session {}", self.session_id);
    }

    fn broadcast_idle_status(&self) {
        broadcast_event(
            "agent:queue_status",
            serde_json::json!({
                "sessionId": self.session_id,
                "pendingCount": self.pending.load(Ordering::Relaxed),
                "isProcessing": false,
            }),
        );
    }
}

fn is_terminal_final_summary_failure(session_id: &str, turn_intent_id: &str) -> bool {
    matches!(
        crate::coordination::agent_org_final_summary::status_for_turn(session_id, turn_intent_id),
        Ok(Some(
            crate::coordination::agent_org_final_summary::FinalSummaryStatus::Failed
        ))
    )
}

fn is_terminal_final_summary_failure_for_run(
    org_run_id: Option<&str>,
    session_id: &str,
    turn_intent_id: &str,
) -> bool {
    org_run_id.is_some() && is_terminal_final_summary_failure(session_id, turn_intent_id)
}

async fn reconcile_agent_org_run_after_terminal(run_id: &str) {
    let reconcile_run_id = run_id.to_string();
    match tokio::task::spawn_blocking(move || {
        let assessment =
            crate::coordination::agent_org_runs::AgentOrgRunStore::assess_run_quiescence(
                &reconcile_run_id,
            )?;
        let Some(generation) = assessment.facts.activation_generation else {
            return Ok(false);
        };
        let Some(work_revision) = assessment
            .facts
            .progress
            .as_ref()
            .map(|progress| progress.work_revision)
        else {
            return Ok(false);
        };
        crate::coordination::agent_org_runs::AgentOrgRunStore::try_transition_working_to_idle(
            &reconcile_run_id,
            generation,
            work_revision,
        )
    })
    .await
    {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => warn!(
            run_id,
            error = %error,
            "[scheduler] post-intent Agent Org quiescence reconcile failed"
        ),
        Err(error) => warn!(
            run_id,
            error = %error,
            "[scheduler] post-intent Agent Org quiescence reconcile task failed"
        ),
    }
}

#[cfg(test)]
mod stress_tests;

#[cfg(test)]
mod fault_injection_tests;

#[cfg(test)]
mod final_summary_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn executor_factory_panic_does_not_kill_the_session_worker() {
        let scheduler = DialogScheduler::new("session-factory-panic", 8);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "factory-panics".into(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "panic".into(),
                execute: Box::new(|| panic!("factory failed before creating a future")),
            })
            .await
            .expect("factory panic must not occur on the caller");

        let completed = Arc::new(AtomicUsize::new(0));
        let completed_in_turn = Arc::clone(&completed);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "after-factory-panic".into(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "continue".into(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        completed_in_turn.fetch_add(1, Ordering::SeqCst);
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue after factory panic");

        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while completed.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("factory panic must not poison the worker or later queue items");
        assert_eq!(scheduler.pending_count(), 0);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn failed_executor_reconciles_persisted_running_session() {
        use crate::session::persistence::{self, UnifiedSessionRecord};
        use core_types::key_source::KeySource;

        let _sandbox = test_helpers::test_env::sandbox();
        let session_id = "session-failed-executor-status";
        {
            let conn = database::db::get_connection().expect("test DB");
            crate::persistence::test_schema::ensure_agent_sessions_schema(&conn);
            persistence::init(&conn).expect("session tables");
        }
        let record = UnifiedSessionRecord {
            session_id: session_id.to_string(),
            name: "status regression".to_string(),
            status: crate::session::SessionStatus::Running.as_str().to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            session_type: "sde".to_string(),
            key_source: KeySource::OwnKey,
            ..Default::default()
        };
        persistence::upsert_session(&record).expect("seed running session");

        let scheduler = DialogScheduler::new(session_id, 8);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "failing-turn".into(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "fail".into(),
                execute: Box::new(|| Box::pin(async { Err("provider failed".to_string()) })),
            })
            .await
            .expect("enqueue");

        tokio::time::timeout(std::time::Duration::from_secs(3), async {
            loop {
                if persistence::get_session(session_id)
                    .expect("query session")
                    .is_some_and(|row| row.status == crate::session::SessionStatus::Failed.as_str())
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("failed callback must clear durable running status");
    }

    #[tokio::test]
    async fn a_dead_worker_is_recreated_on_the_next_enqueue() {
        let scheduler = DialogScheduler::new("session-aborted-worker", 8);
        scheduler.ensure_initialized().await;
        {
            let guard = scheduler.inner.lock().await;
            guard.as_ref().expect("worker started").worker.abort();
        }
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let finished = {
                    let guard = scheduler.inner.lock().await;
                    guard.as_ref().expect("worker exists").worker.is_finished()
                };
                if finished {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("aborted worker eventually stops");

        let completed = Arc::new(AtomicUsize::new(0));
        let completed_in_turn = Arc::clone(&completed);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Maintenance,
                message_id: "after-worker-abort".into(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: String::new(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        completed_in_turn.fetch_add(1, Ordering::SeqCst);
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("dead worker must be replaced");
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while completed.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("replacement worker processes a fresh queue item");
    }

    #[test]
    fn targeted_cancellation_registry_is_bounded_and_keeps_the_latest_fence() {
        let scheduler = DialogScheduler::new("session-targeted-cancel-bound", 8);
        for index in 0..(MAX_TARGETED_CANCELLATIONS * 3) {
            scheduler.invalidate_turn(&format!("turn-{index}"));
        }

        let control = scheduler.turn_control.lock();
        assert_eq!(control.cancelled.len(), MAX_TARGETED_CANCELLATIONS);
        assert!(control
            .cancelled
            .contains(&format!("turn-{}", MAX_TARGETED_CANCELLATIONS * 3 - 1)));
    }

    #[tokio::test]
    async fn targeted_cancellation_skips_only_the_named_turn_and_preserves_fifo() {
        let scheduler = DialogScheduler::new("session-targeted-cancel", 8);
        let release_running = Arc::new(tokio::sync::Notify::new());
        let running_released = Arc::clone(&release_running);
        let cancelled_executed = Arc::new(AtomicUsize::new(0));
        let next_executed = Arc::new(AtomicUsize::new(0));
        let next_finished = Arc::new(tokio::sync::Notify::new());

        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "running-before-targeted-stop".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: "turn-running".to_string(),
                org_run_id: None,
                content: "running".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        running_released.notified().await;
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue running Turn");

        let cancelled_executed_for_closure = Arc::clone(&cancelled_executed);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "targeted-stop".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: "turn-stop".to_string(),
                org_run_id: None,
                content: "stop".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        cancelled_executed_for_closure.fetch_add(1, Ordering::SeqCst);
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue Turn that will be stopped");

        let next_executed_for_closure = Arc::clone(&next_executed);
        let next_finished_for_closure = Arc::clone(&next_finished);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "after-targeted-stop".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: "turn-next".to_string(),
                org_run_id: None,
                content: "next".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        next_executed_for_closure.fetch_add(1, Ordering::SeqCst);
                        next_finished_for_closure.notify_one();
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue later FIFO Turn");

        assert!(!scheduler.invalidate_turn("turn-stop"));
        release_running.notify_one();
        tokio::time::timeout(std::time::Duration::from_secs(1), next_finished.notified())
            .await
            .expect("later FIFO Turn should run");

        assert_eq!(cancelled_executed.load(Ordering::SeqCst), 0);
        assert_eq!(next_executed.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn invalidated_pending_message_is_skipped() {
        let scheduler = DialogScheduler::new("session-a", 8);
        let release_running = Arc::new(tokio::sync::Notify::new());
        let running_released = Arc::clone(&release_running);
        let stale_executed = Arc::new(AtomicUsize::new(0));

        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "running-before-rewind".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "running".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        running_released.notified().await;
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue succeeds");

        let stale_executed_for_closure = Arc::clone(&stale_executed);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "queued-before-rewind".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "stale".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        stale_executed_for_closure.fetch_add(1, Ordering::SeqCst);
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue succeeds");

        scheduler.invalidate_pending();
        release_running.notify_one();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        assert_eq!(stale_executed.load(Ordering::SeqCst), 0);
        assert_eq!(scheduler.pending_count(), 0);
    }

    #[tokio::test]
    async fn duplicate_client_message_id_is_not_enqueued() {
        let scheduler = DialogScheduler::new("session-dedupe", 8);
        let release_running = Arc::new(tokio::sync::Notify::new());
        let running_released = Arc::clone(&release_running);

        let first = scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "first".to_string(),
                generation: 0,
                client_message_id: Some("client-1".to_string()),
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "running".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        running_released.notified().await;
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("first enqueue succeeds");

        let second = scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "second".to_string(),
                generation: 0,
                client_message_id: Some("client-1".to_string()),
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "duplicate".to_string(),
                execute: Box::new(|| Box::pin(async { Ok(ExecutionCompletion::Finished) })),
            })
            .await
            .expect("duplicate enqueue returns idempotent success");

        assert!(!first.duplicate);
        assert!(second.duplicate);
        assert_eq!(second.message_id, "second");
        release_running.notify_one();
    }

    #[tokio::test]
    async fn twenty_concurrent_wakes_coalesce_to_one_turn() {
        let scheduler = Arc::new(DialogScheduler::new("session-wake-storm", 32));
        let release = Arc::new(tokio::sync::Notify::new());
        let executed = Arc::new(AtomicUsize::new(0));
        let mut joins = tokio::task::JoinSet::new();

        for index in 0..20 {
            let scheduler = Arc::clone(&scheduler);
            let release = Arc::clone(&release);
            let executed = Arc::clone(&executed);
            joins.spawn(async move {
                scheduler
                    .enqueue(ScheduledMessage {
                        kind: ScheduledKind::Turn,
                        message_id: format!("wake-{index}"),
                        generation: 0,
                        client_message_id: Some("agent-org-wake:run-1:member-a".to_string()),
                        turn_intent_id: String::new(),
                        org_run_id: None,
                        content: String::new(),
                        execute: Box::new(move || {
                            Box::pin(async move {
                                executed.fetch_add(1, Ordering::SeqCst);
                                release.notified().await;
                                Ok(ExecutionCompletion::Finished)
                            })
                        }),
                    })
                    .await
                    .expect("wake enqueue")
            });
        }

        let mut accepted = 0;
        let mut coalesced = 0;
        while let Some(result) = joins.join_next().await {
            if result.expect("join wake").duplicate {
                coalesced += 1;
            } else {
                accepted += 1;
            }
        }
        assert_eq!(accepted, 1);
        assert_eq!(coalesced, 19);
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while executed.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("accepted wake starts");
        assert_eq!(executed.load(Ordering::SeqCst), 1);
        release.notify_one();
    }

    #[tokio::test]
    async fn maintenance_job_never_reports_a_running_turn() {
        let scheduler = DialogScheduler::new("session-maintenance", 8);
        let observed_turn_processing = Arc::new(AtomicUsize::new(0));
        let observed_worker_busy = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(tokio::sync::Notify::new());

        let released = Arc::clone(&release);
        let turn_flag = Arc::clone(&observed_turn_processing);
        let busy_flag = Arc::clone(&observed_worker_busy);
        let probe = Arc::new(scheduler);
        let probe_for_job = Arc::clone(&probe);

        probe
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Maintenance,
                message_id: "compact".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "[manual compact]".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        // Sampled from inside the job: the worker is busy, but
                        // no turn is running — otherwise `agent_send_message`
                        // would divert into a steering queue nobody drains and
                        // the frontend would strand the session in `running`.
                        if probe_for_job.is_turn_processing() {
                            turn_flag.fetch_add(1, Ordering::SeqCst);
                        }
                        if probe_for_job.is_processing() {
                            busy_flag.fetch_add(1, Ordering::SeqCst);
                        }
                        released.notified().await;
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue succeeds");

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        release.notify_one();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        assert_eq!(observed_turn_processing.load(Ordering::SeqCst), 0);
        assert_eq!(observed_worker_busy.load(Ordering::SeqCst), 1);
        assert!(!probe.is_processing());
        assert!(!probe.is_turn_processing());
    }

    #[tokio::test]
    async fn message_after_invalidation_runs() {
        let scheduler = DialogScheduler::new("session-b", 8);
        let executed = Arc::new(AtomicUsize::new(0));

        scheduler.invalidate_pending();

        let executed_for_closure = Arc::clone(&executed);
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "queued-after-rewind".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: String::new(),
                org_run_id: None,
                content: "fresh".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        executed_for_closure.fetch_add(1, Ordering::SeqCst);
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue succeeds");

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        assert_eq!(executed.load(Ordering::SeqCst), 1);
        assert_eq!(scheduler.pending_count(), 0);
    }
    #[tokio::test]
    async fn watchdog_timeout_recovers_worker_to_idle() {
        let scheduler = DialogScheduler::new("session-watchdog-timeout", 4);
        let executed = Arc::new(AtomicUsize::new(0));

        let executed_for_closure = Arc::clone(&executed);
        // Enqueue a turn that hangs intentionally
        scheduler
            .enqueue(ScheduledMessage {
                kind: ScheduledKind::Turn,
                message_id: "hanging-turn".to_string(),
                generation: 0,
                client_message_id: None,
                turn_intent_id: "hanging-turn-intent".to_string(),
                org_run_id: None,
                content: "hang".to_string(),
                execute: Box::new(move || {
                    Box::pin(async move {
                        executed_for_closure.fetch_add(1, Ordering::SeqCst);
                        // Simulate hanging future
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            })
            .await
            .expect("enqueue succeeds");

        // Wait for execution to finish
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;

        assert_eq!(executed.load(Ordering::SeqCst), 1);
        assert!(!scheduler.is_turn_processing());
        assert!(!scheduler.is_processing());
        assert_eq!(scheduler.pending_count(), 0);
    }
}
