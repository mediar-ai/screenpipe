// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! VPIO uses process-wide voice-processing resources, even across physical
//! microphones. Never construct a second unit while another is alive or being
//! disposed. A replacement microphone uses HAL while the old native worker
//! owns the lease; timing out an async stop must not release that ownership.

use std::sync::atomic::{AtomicBool, Ordering};

pub(super) static VPIO_OWNER: AtomicBool = AtomicBool::new(false);

pub(super) struct VpioLease<'a>(&'a AtomicBool);

impl<'a> VpioLease<'a> {
    pub(super) fn try_acquire(owner: &'a AtomicBool) -> Option<Self> {
        owner
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| Self(owner))
    }
}

impl Drop for VpioLease<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::time::Duration;

    #[test]
    fn replacement_uses_hal_until_native_teardown_really_finishes() {
        let owner = Arc::new(AtomicBool::new(false));
        let worker_owner = owner.clone();
        let (started_tx, started_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _lease = VpioLease::try_acquire(&worker_owner).unwrap();
            started_tx.send(()).unwrap();
            // Stand in for a native stop/dispose that outlives its async caller.
            finish_rx.recv().unwrap();
        });
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        for _ in 0..100 {
            assert!(VpioLease::try_acquire(&owner).is_none());
        }
        finish_tx.send(()).unwrap();
        worker.join().unwrap();
        assert!(VpioLease::try_acquire(&owner).is_some());
    }

    #[test]
    fn construction_failure_releases_lease_for_a_later_start() {
        let owner = AtomicBool::new(false);
        let attempt = || -> Result<(), ()> {
            let _lease = VpioLease::try_acquire(&owner).unwrap();
            Err(())
        };
        assert!(attempt().is_err());
        assert!(VpioLease::try_acquire(&owner).is_some());
    }

    #[test]
    fn simultaneous_starts_admit_only_one_vpio_worker() {
        let owner = Arc::new(AtomicBool::new(false));
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let winners = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let workers: Vec<_> = (0..8)
            .map(|_| {
                let (owner, barrier, winners) = (owner.clone(), barrier.clone(), winners.clone());
                std::thread::spawn(move || {
                    barrier.wait();
                    let lease = VpioLease::try_acquire(&owner);
                    if lease.is_some() {
                        winners.fetch_add(1, Ordering::Relaxed);
                    }
                    barrier.wait();
                    drop(lease);
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        assert_eq!(winners.load(Ordering::Relaxed), 1);
        assert!(VpioLease::try_acquire(&owner).is_some());
    }
}
