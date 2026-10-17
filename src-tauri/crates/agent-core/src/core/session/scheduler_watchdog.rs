//! Observation-only, per-active-job watchdog for Session execution.
//!
//! A long-running Future is NOT proof that a provider/tool has stalled.
//! We report elapsed wall-clock time; we NEVER cancel, retry, detach, or replay
//! side-effectful work on the basis of elapsed time alone.
//!
//! The timer only exists while a WorkerTask is executing a queued message.
//! No app-lifetime poller or additional worker is started.

use std::future::Future;
use std::time::Duration;

const FIRST_WARNING_AFTER: Duration = Duration::from_secs(180);
const FOLLOWUP_WARNING_EVERY: Duration = Duration::from_secs(300);

/// Return the executor result unchanged, publishing bounded warnings while
/// its Future remains pending. A completion wins ties at the timer boundary.
pub(super) async fn observe_long_running<T>(
    execution: impl Future<Output = T>,
    mut report: impl FnMut(Duration, u64),
) -> T {
    let started = tokio::time::Instant::now();
    let timer = tokio::time::sleep(FIRST_WARNING_AFTER);
    tokio::pin!(timer);
    tokio::pin!(execution);

    let mut warning_count = 0_u64;
    loop {
        tokio::select! {
            biased;
            result = &mut execution => return result,
            _ = &mut timer => {
                warning_count = warning_count.saturating_add(1);
                report(started.elapsed(), warning_count);
                timer.as_mut().reset(tokio::time::Instant::now() + FOLLOWUP_WARNING_EVERY);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test(start_paused = true)]
    async fn completed_future_has_no_false_warning() {
        let mut calls = 0;
        let result = observe_long_running(async { 73 }, |_, _| calls += 1).await;
        assert_eq!(result, 73);
        assert_eq!(calls, 0);
    }

    #[tokio::test(start_paused = true)]
    async fn warning_never_cancels_work_and_repeats_at_bounded_intervals() {
        let (finish_tx, finish_rx) = tokio::sync::oneshot::channel::<()>();
        let reports = Arc::new(Mutex::new(Vec::new()));
        let reports_copy = Arc::clone(&reports);
        let work = tokio::spawn(async move {
            observe_long_running(
                async move {
                    finish_rx.await.expect("work must not be cancelled by observation");
                    42
                },
                move |elapsed, count| reports_copy.lock().unwrap().push((elapsed.as_secs(), count)),
            )
            .await
        });
        tokio::task::yield_now().await;
        tokio::time::advance(FIRST_WARNING_AFTER).await;
        tokio::task::yield_now().await;
        assert_eq!(&*reports.lock().unwrap(), &[(180, 1)]);
        assert!(!work.is_finished());

        tokio::time::advance(FOLLOWUP_WARNING_EVERY).await;
        tokio::task::yield_now().await;
        assert_eq!(&*reports.lock().unwrap(), &[(180, 1), (480, 2)]);

        finish_tx.send(()).unwrap();
        assert_eq!(work.await.unwrap(), 42);
        assert_eq!(reports.lock().unwrap().len(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn completed_work_does_not_leave_delayed_warning() {
        let mut calls = 0;
        let result = observe_long_running(async { 1 }, |_, _| calls += 1).await;
        assert_eq!(result, 1);
        tokio::time::advance(FIRST_WARNING_AFTER).await;
        assert_eq!(calls, 0);
    }

    #[tokio::test]
    async fn preserves_provider_error_without_retry_or_status_mutation() {
        let mut calls = 0;
        let result = observe_long_running(
            async { Err::<(), _>("provider unavailable") },
            |_, _| calls += 1,
        )
        .await;
        assert_eq!(result, Err("provider unavailable"));
        assert_eq!(calls, 0);
    }
}
