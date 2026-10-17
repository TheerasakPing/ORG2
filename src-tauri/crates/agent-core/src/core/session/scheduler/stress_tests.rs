//! Synthetic, offline stress tests of the actual DialogScheduler.
 //!
 //! No real LLM/network/tool calls, account credentials, or interactive UI.
 //! All tests are bounded: use 1/5/20/50 session profiles and finite deadlines.
 //! These checks prove FIFO and cross-session isolation at the Scheduler
 //! boundary, NOT end-to-end provider liveness, crash recovery, or production
 //! capacity under 50 real concurrent API/tool workloads.

use super::{DialogScheduler, ExecutionCompletion, ScheduledKind, ScheduledMessage};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{watch, Barrier};

const TEST_DEADLINE: Duration = Duration::from_secs(20);

fn synthetic_message(
    message_id: String,
    kind: ScheduledKind,
    execute: super::ExecuteFn,
) -> ScheduledMessage {
    ScheduledMessage {
        kind,
        message_id,
        generation: 0,
        client_message_id: None,
        // Empty as in the existing scheduler unit tests. This is an in-memory
        // concurrency test, not the persistent Turn-intent identity contract.
        turn_intent_id: String::new(),
        org_run_id: None,
        content: String::new(),
        execute,
    }
}

/// Concurrent native session workers must not serialize across sessions.
/// The first Turn in each FIFO reaches a barrier before any can finish.
/// Then, a second Turn per session must not start before its first one ends.
async fn exercise_profile(session_count: usize) {
    let barrier = Arc::new(Barrier::new(session_count + 1));
    let (release, hold) = watch::channel(false);
    let active = Arc::new(AtomicUsize::new(0));
    let first_started = Arc::new(AtomicUsize::new(0));
    let first_completed = Arc::new(AtomicUsize::new(0));
    let second_completed = Arc::new(AtomicUsize::new(0));
    let ordering_errors = Arc::new(AtomicUsize::new(0));
    let mut schedulers = Vec::with_capacity(session_count);
    let mut states = Vec::with_capacity(session_count);

    for index in 0..session_count {
        let scheduler = DialogScheduler::new(
            format!("stress-lab-{session_count}-{index}"),
            4, // 1 queued follow-up + generous per-session queue headroom
        );
        let state = Arc::new(AtomicUsize::new(0));
        states.push(Arc::clone(&state));
        let initial_state = Arc::clone(&state);
        let first_barrier = Arc::clone(&barrier);
        let mut hold_rx = hold.clone();
        let active_in_job = Arc::clone(&active);
        let started_in_job = Arc::clone(&first_started);
        let completed_in_job = Arc::clone(&first_completed);
        let errors_in_job = Arc::clone(&ordering_errors);

        scheduler
            .enqueue(synthetic_message(
                format!("first-{index}"),
                ScheduledKind::Turn,
                Box::new(move || {
                    Box::pin(async move {
                        active_in_job.fetch_add(1, Ordering::SeqCst);
                        started_in_job.fetch_add(1, Ordering::SeqCst);
                        // Once all N first jobs have reached the barrier,
                        // cross-session scheduling has demonstrably overlapped.
                        first_barrier.wait().await;
                        while !*hold_rx.borrow() {
                            if hold_rx.changed().await.is_err() {
                                return Err("stress-lab release channel was dropped".into());
                            }
                        }
                        if initial_state.swap(1, Ordering::SeqCst) != 0 {
                            errors_in_job.fetch_add(1, Ordering::SeqCst);
                        }
                        active_in_job.fetch_sub(1, Ordering::SeqCst);
                        completed_in_job.fetch_add(1, Ordering::SeqCst);
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            ))
            .await
            .expect("first Turn must enqueue");

        let second_state = Arc::clone(&state);
        let second_done = Arc::clone(&second_completed);
        let second_errors = Arc::clone(&ordering_errors);
        scheduler
            .enqueue(synthetic_message(
                format!("second-{index}"),
                ScheduledKind::Turn,
                Box::new(move || {
                    Box::pin(async move {
                        // A violation is counted even if scheduler catches a
                        // panic and otherwise masks it as a Turn error.
                        if second_state.swap(2, Ordering::SeqCst) != 1 {
                            second_errors.fetch_add(1, Ordering::SeqCst);
                        }
                        second_done.fetch_add(1, Ordering::SeqCst);
                        Ok(ExecutionCompletion::Finished)
                    })
                }),
            ))
            .await
            .expect("second FIFO Turn must enqueue");
        // Keep the real session-owned scheduler alive until all work drains.
        schedulers.push(scheduler);
    }

    tokio::time::timeout(TEST_DEADLINE, barrier.wait())
        .await
        .expect("all first Turns must reach the cross-session barrier");
    assert_eq!(first_started.load(Ordering::SeqCst), session_count);
    assert_eq!(active.load(Ordering::SeqCst), session_count);
    assert_eq!(second_completed.load(Ordering::SeqCst), 0,
        "no FIFO follow-up may start while its first Turn is blocked");

    release.send(true).expect("there must still be live Turn receivers");
    tokio::time::timeout(TEST_DEADLINE, async {
        while second_completed.load(Ordering::SeqCst) != session_count {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("all second FIFO Turns must eventually complete");
    assert_eq!(first_completed.load(Ordering::SeqCst), session_count);
    assert_eq!(ordering_errors.load(Ordering::SeqCst), 0);
    assert_eq!(active.load(Ordering::SeqCst), 0);
    for (index, state) in states.iter().enumerate() {
        assert_eq!(state.load(Ordering::SeqCst), 2,
            "both FIFO turns must have executed exactly once for session {index}");
    }
    for scheduler in &schedulers {
        assert_eq!(scheduler.pending_count(), 0);
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn one_session_preserves_fifo() {
    exercise_profile(1).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn five_sessions_run_in_parallel_and_keep_fifo() {
    exercise_profile(5).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn twenty_sessions_run_in_parallel_and_keep_fifo() {
    exercise_profile(20).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn fifty_sessions_run_in_parallel_and_keep_fifo() {
    exercise_profile(50).await;
}

/// A failure/targeted Stop in one session cannot cancel a neighbor's queued
/// Turn, even if all sessions are actively processing first Turns.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn targeted_stop_is_session_local_across_five_busy_workers() {
    const COUNT: usize = 5;
    const STOP_INDEX: usize = 2;
    let barrier = Arc::new(Barrier::new(COUNT + 1));
    let (release, hold) = watch::channel(false);
    let followup_count = Arc::new(AtomicUsize::new(0));
    let cancelled_ran = Arc::new(AtomicUsize::new(0));
    let mut schedulers = Vec::new();

    for index in 0..COUNT {
        let scheduler = DialogScheduler::new(
            format!("stop-isolation-{index}"),
            4,
        );
        let b = Arc::clone(&barrier);
        let mut rx = hold.clone();
        scheduler.enqueue(synthetic_message(
            format!("first-{index}"),
            ScheduledKind::Turn,
            Box::new(move || Box::pin(async move {
                b.wait().await;
                while !*rx.borrow() {
                    if rx.changed().await.is_err() {
                        return Err("release was dropped".into());
                    }
                }
                Ok(ExecutionCompletion::Finished)
            })),
        )).await.expect("first Turn enqueued");

        // Unlike the empty intent of the first fixture, targeted cancellation
        // must have a uniquely owned exact intent key.
        let second_id = format!("cancel-target-{index}");
        let finished = Arc::clone(&followup_count);
        let cancelled = Arc::clone(&cancelled_ran);
        scheduler.enqueue(ScheduledMessage {
            kind: ScheduledKind::Turn,
            message_id: format!("followup-{index}"),
            generation: 0,
            client_message_id: None,
            turn_intent_id: second_id.clone(),
            org_run_id: None,
            content: String::new(),
            execute: Box::new(move || Box::pin(async move {
                if index == STOP_INDEX {
                    cancelled.fetch_add(1, Ordering::SeqCst);
                } else {
                    finished.fetch_add(1, Ordering::SeqCst);
                }
                Ok(ExecutionCompletion::Finished)
            })),
        }).await.expect("second Turn enqueued");
        if index == STOP_INDEX {
            assert!(!scheduler.invalidate_turn(&second_id),
                "second Turn is still pending while first is blocked");
        }
        schedulers.push(scheduler);
    }
    tokio::time::timeout(TEST_DEADLINE, barrier.wait())
        .await.expect("all five initial Turns should start");
    release.send(true).expect("receivers alive");
    tokio::time::timeout(TEST_DEADLINE, async {
        while followup_count.load(Ordering::SeqCst) != COUNT - 1 {
            tokio::task::yield_now().await;
        }
    }).await.expect("unaffected sessions must finish");
    // The cancelled job can still be waiting for its scheduler's receiver
    // while other sessions complete. Wait for its dequeue without sleeping.
    tokio::time::timeout(TEST_DEADLINE, async {
        while schedulers.iter().any(|worker| worker.pending_count() != 0) {
            tokio::task::yield_now().await;
        }
    }).await.expect("targeted cancelled job must drain its queue slot");
    assert_eq!(cancelled_ran.load(Ordering::SeqCst), 0);
}
