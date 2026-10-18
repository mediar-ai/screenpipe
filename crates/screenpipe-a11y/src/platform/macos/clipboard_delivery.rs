// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Clipboard snapshot consistency and serialized admission. Runs only on
//! clipboard workers, never on the input tap. At most one snapshot per producer
//! is retained while a slow consumer catches up.
use crate::events::UiEvent;
use crossbeam_channel::{SendTimeoutError, Sender};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

pub(super) struct ClipboardDelivery {
    delivered: Mutex<Option<i64>>,
}

impl ClipboardDelivery {
    pub(super) fn new(generation: Option<i64>) -> Self {
        Self {
            delivered: Mutex::new(generation),
        }
    }

    /// Serialize snapshot reads and admission so a newer generation cannot overtake a retained
    /// earlier snapshot. Only successful sends advance the dedup watermark.
    /// Paste gestures are independent and intentionally bypass deduplication.
    pub(super) fn capture_and_deliver(
        &self,
        capture: impl FnOnce() -> Option<(Option<i64>, UiEvent)>,
        tx: &Sender<UiEvent>,
        stop: &AtomicBool,
    ) -> bool {
        // Snapshot ownership begins under the same gate as admission. Reading
        // first would let a newer producer overtake and suppress an older read.
        let mut delivered = self.delivered.lock();
        let Some((generation, mut event)) = capture() else {
            return false;
        };
        if generation.is_some_and(|g| delivered.is_some_and(|last| g <= last)) {
            return true;
        }
        loop {
            // A final nonblocking attempt is allowed during shutdown. Never
            // keep recorder teardown waiting for a consumer that has stopped.
            match tx.try_send(event) {
                Ok(()) => {
                    if generation.is_some() {
                        *delivered = generation;
                    }
                    return true;
                }
                Err(crossbeam_channel::TrySendError::Disconnected(_)) => return false,
                Err(crossbeam_channel::TrySendError::Full(retained)) => event = retained,
            }
            if stop.load(Ordering::Acquire) {
                return false;
            }
            match tx.send_timeout(event, Duration::from_millis(20)) {
                Ok(()) => {
                    if generation.is_some() {
                        *delivered = generation;
                    }
                    return true;
                }
                Err(SendTimeoutError::Timeout(retained)) => event = retained,
                Err(SendTimeoutError::Disconnected(_)) => return false,
            }
        }
    }
    #[cfg(test)]
    fn deliver(
        &self,
        generation: Option<i64>,
        event: UiEvent,
        tx: &Sender<UiEvent>,
        stop: &AtomicBool,
    ) -> bool {
        self.capture_and_deliver(|| Some((generation, event)), tx, stop)
    }
}

/// Never label content from generation N+1 with generation N. Retry unstable
/// snapshots a bounded number of times; the poller will revisit the latest one.
pub(super) fn stable_snapshot<T>(
    mut generation: impl FnMut() -> Option<i64>,
    mut content: impl FnMut() -> T,
) -> Option<(i64, T)> {
    for _ in 0..3 {
        let before = generation()?;
        let value = content();
        if generation() == Some(before) {
            return Some((before, value));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use crossbeam_channel::bounded;
    use std::sync::{Arc, Barrier};
    fn event(text: &str) -> UiEvent {
        UiEvent::text(Utc::now(), 1, text.to_owned())
    }

    #[test]
    fn clipboard_full_channel_preserves_snapshot_and_commits_after_delivery() {
        let gate = Arc::new(ClipboardDelivery::new(Some(40)));
        let (tx, rx) = bounded(1);
        tx.send(event("occupied")).unwrap();
        let worker_gate = gate.clone();
        let worker_tx = tx.clone();
        let worker = std::thread::spawn(move || {
            worker_gate.deliver(
                Some(41),
                event("original"),
                &worker_tx,
                &AtomicBool::new(false),
            )
        });
        // Do not free the slot until the producer holds admission. This proves
        // the full-channel path ran instead of racing a successful first send.
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while gate.delivered.try_lock().is_some() {
            assert!(
                std::time::Instant::now() < deadline,
                "producer did not start"
            );
            std::thread::yield_now();
        }
        assert!(!worker.is_finished());
        rx.recv().unwrap();
        let delivered = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(
            matches!(delivered.data, crate::events::EventData::Text {content,..} if content == "original")
        );
        assert!(worker.join().unwrap());
        assert_eq!(*gate.delivered.lock(), Some(41));
        assert!(gate.deliver(Some(41), event("duplicate"), &tx, &AtomicBool::new(false)));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn clipboard_stop_or_disconnect_does_not_claim_undelivered_generation() {
        let gate = ClipboardDelivery::new(Some(40));
        let (tx, rx) = bounded(1);
        tx.send(event("occupied")).unwrap();
        assert!(!gate.deliver(Some(41), event("copy"), &tx, &AtomicBool::new(true)));
        assert_eq!(*gate.delivered.lock(), Some(40));
        rx.recv().unwrap();
        assert!(gate.deliver(Some(41), event("retry"), &tx, &AtomicBool::new(false)));
        drop(rx);
        assert!(!gate.deliver(
            Some(42),
            event("disconnected"),
            &tx,
            &AtomicBool::new(false)
        ));
        assert_eq!(*gate.delivered.lock(), Some(41));
    }

    #[test]
    fn clipboard_racing_producers_deliver_once_and_paste_remains_independent() {
        for _ in 0..100 {
            let gate = Arc::new(ClipboardDelivery::new(Some(40)));
            let barrier = Arc::new(Barrier::new(2));
            let (tx, rx) = bounded(4);
            let g = gate.clone();
            let b = barrier.clone();
            let t = tx.clone();
            let worker = std::thread::spawn(move || {
                b.wait();
                g.deliver(Some(41), event("copy"), &t, &AtomicBool::new(false))
            });
            barrier.wait();
            assert!(gate.deliver(Some(41), event("copy"), &tx, &AtomicBool::new(false)));
            assert!(worker.join().unwrap());
            assert_eq!(rx.len(), 1);
            rx.recv().unwrap();
            assert!(gate.deliver(None, event("paste"), &tx, &AtomicBool::new(false)));
            assert!(gate.deliver(None, event("paste"), &tx, &AtomicBool::new(false)));
            assert_eq!(rx.len(), 2);
        }
    }

    #[test]
    fn clipboard_newer_snapshot_cannot_overtake_an_inflight_read() {
        let gate = Arc::new(ClipboardDelivery::new(Some(40)));
        let (tx, rx) = bounded(2);
        let (started_tx, started_rx) = bounded(1);
        let (release_tx, release_rx) = bounded(1);
        let g = gate.clone();
        let t = tx.clone();
        let older = std::thread::spawn(move || {
            g.capture_and_deliver(
                || {
                    started_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(2)).unwrap();
                    Some((Some(41), event("older")))
                },
                &t,
                &AtomicBool::new(false),
            )
        });
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let g = gate.clone();
        let (entered_tx, entered_rx) = bounded(1);
        let newer = std::thread::spawn(move || {
            g.capture_and_deliver(
                || {
                    entered_tx.send(()).unwrap();
                    Some((Some(42), event("newer")))
                },
                &tx,
                &AtomicBool::new(false),
            )
        });
        assert!(entered_rx.recv_timeout(Duration::from_millis(50)).is_err());
        release_tx.send(()).unwrap();
        assert!(older.join().unwrap());
        assert!(newer.join().unwrap());
        for expected in ["older", "newer"] {
            assert!(
                matches!(rx.recv().unwrap().data, crate::events::EventData::Text { content, .. } if content == expected)
            );
        }
        assert_eq!(*gate.delivered.lock(), Some(42));
    }

    #[test]
    fn clipboard_waiting_producer_rechecks_exclusion_after_admission_wait() {
        use super::super::input_focus::{with_allowed_focus, InputFocus};
        let config = crate::config::UiCaptureConfig::new();
        let focus = Arc::new(arc_swap::ArcSwap::from_pointee(InputFocus::resolved(
            1,
            "TextEdit".into(),
            None,
            &config,
        )));
        let gate = Arc::new(ClipboardDelivery::new(Some(40)));
        let (tx, rx) = bounded(2);
        let (entered_tx, entered_rx) = bounded(1);
        let (release_tx, release_rx) = bounded(1);
        let g = gate.clone();
        let t = tx.clone();
        let older = std::thread::spawn(move || {
            g.capture_and_deliver(
                || {
                    entered_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(2)).unwrap();
                    Some((Some(41), event("allowed-before-switch")))
                },
                &t,
                &AtomicBool::new(false),
            )
        });
        entered_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let f = focus.clone();
        let newer = std::thread::spawn(move || {
            gate.capture_and_deliver(
                || {
                    with_allowed_focus(&f, |_| {
                        panic!("excluded clipboard content must never be read");
                    })
                },
                &tx,
                &AtomicBool::new(false),
            )
        });
        focus.store(Arc::new(InputFocus::default()));
        release_tx.send(()).unwrap();
        assert!(older.join().unwrap());
        assert!(!newer.join().unwrap());
        assert_eq!(
            rx.len(),
            1,
            "only the pre-switch allowed snapshot is admitted"
        );
    }

    #[test]
    fn clipboard_snapshot_rejects_torn_reads_and_bounds_retries() {
        let mut generations = [40, 41, 41, 41].into_iter();
        let mut content = ["old", "new"].into_iter();
        assert_eq!(
            stable_snapshot(|| generations.next(), || content.next().unwrap()),
            Some((41, "new"))
        );
        let mut n = 0;
        assert_eq!(
            stable_snapshot(
                || {
                    n += 1;
                    Some(n)
                },
                || "unstable"
            ),
            None
        );
        assert_eq!(n, 6);
        assert_eq!(stable_snapshot(|| None, || "unknown"), None);
    }
}
