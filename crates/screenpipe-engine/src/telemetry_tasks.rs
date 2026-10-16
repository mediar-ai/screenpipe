// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use std::future::Future;
use tokio::task::JoinHandle;
use tokio_util::task::AbortOnDropHandle;

/// Own periodic reporters with their router generation. Dropping a bare
/// JoinHandle detaches its task; these handles cancel it instead. Reporters must
/// not capture their own owner, which would create a lifetime cycle.
#[derive(Default)]
pub(crate) struct TelemetryTasks {
    tasks: Vec<AbortOnDropHandle<()>>,
}

impl TelemetryTasks {
    pub(crate) fn spawn(&mut self, future: impl Future<Output = ()> + Send + 'static) {
        self.track(tokio::spawn(future));
    }

    fn track(&mut self, task: JoinHandle<()>) {
        self.tasks.push(AbortOnDropHandle::new(task));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::get, Extension, Router};
    use std::{sync::Arc, time::Duration};
    use tokio::sync::mpsc;

    fn reporter(tasks: &mut TelemetryTasks, id: usize, tx: mpsc::UnboundedSender<usize>) {
        tasks.spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                if tx.send(id).is_err() {
                    return;
                }
            }
        });
    }

    async fn minute() {
        tokio::time::advance(Duration::from_secs(60)).await;
        tokio::task::yield_now().await;
    }

    #[tokio::test(start_paused = true)]
    async fn router_clones_keep_reporters_alive_until_last_drop() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut tasks = TelemetryTasks::default();
        for id in 0..2 {
            reporter(&mut tasks, id, tx.clone());
        }
        drop(tx);
        let router = Router::<()>::new()
            .route("/", get(|| async { "ok" }))
            .layer(Extension(Arc::new(tasks)));
        let connection = router.clone();
        tokio::task::yield_now().await;
        for _ in 0..2 {
            assert!(rx.try_recv().is_ok());
        }
        drop(router);
        minute().await;
        for _ in 0..2 {
            assert!(rx.try_recv().is_ok());
        }
        drop(connection);
        tokio::task::yield_now().await;
        minute().await;
        assert_eq!(rx.try_recv(), Err(mpsc::error::TryRecvError::Disconnected));
    }

    #[tokio::test(start_paused = true)]
    async fn failed_router_construction_cancels_reporters_before_ownership_transfer() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut tasks = TelemetryTasks::default();
        reporter(&mut tasks, 1, tx);
        tokio::task::yield_now().await;
        assert_eq!(rx.try_recv(), Ok(1));
        // A router-build error drops the local guard before any Extension owns it.
        drop(tasks);
        tokio::task::yield_now().await;
        minute().await;
        assert_eq!(rx.try_recv(), Err(mpsc::error::TryRecvError::Disconnected));
    }
}
