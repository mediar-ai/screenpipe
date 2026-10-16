// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

pub(crate) const HEALTH_REPORT_INTERVAL: Duration = Duration::from_secs(3600);
pub(crate) const API_SEARCH_VALUES_PER_MINUTE: u64 = 5;

/// Fixed storage and an atomic claim bound concurrent, unattributed API floods.
/// The caller supplies monotonically ordered windows, including day boundaries.
pub(crate) struct ApiValueBudget(AtomicU64);

impl ApiValueBudget {
    pub(crate) const fn new() -> Self {
        Self(AtomicU64::new(0))
    }

    pub(crate) fn claim(&self, window: u64) -> bool {
        // Three low bits store the 0..=5 claims; the remaining bits store the window.
        self.0
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |state| {
                let previous_window = state >> 3;
                let used = state & 7;
                if window > previous_window {
                    Some((window << 3) | 1)
                } else if window == previous_window && used < API_SEARCH_VALUES_PER_MINUTE {
                    Some(state + 1)
                } else {
                    None
                }
            })
            .is_ok()
    }
}

/// Report the first observed state, transitions, and an hourly heartbeat.
/// Sampling/recording continues independently at its original local cadence.
pub(crate) struct HealthReportGate<T = bool> {
    last: Option<(Duration, T)>,
    interval: Duration,
}

impl<T: Copy + Eq> HealthReportGate<T> {
    pub(crate) fn new(interval: Duration) -> Self {
        Self {
            last: None,
            interval,
        }
    }

    pub(crate) fn should_report(&mut self, now: Duration, state: T) -> bool {
        let due = self.last.is_none_or(|(last, previous)| {
            previous != state || now.saturating_sub(last) >= self.interval
        });
        if due {
            self.last = Some((now, state));
        }
        due
    }
}

/// Cumulative counters remain in the emitted snapshot. A counter reset or new
/// error is a fault observation; a following quiet interval clears that
/// observation without claiming that capture itself has recovered.
pub(crate) struct PipelineReportGate<const N: usize> {
    previous: [u64; N],
    report: HealthReportGate<[bool; N]>,
}

impl<const N: usize> PipelineReportGate<N> {
    pub(crate) fn new() -> Self {
        Self {
            previous: [0; N],
            report: HealthReportGate::new(HEALTH_REPORT_INTERVAL),
        }
    }

    /// Changed counter classes in the latest emitted observation. These are
    /// recent error activity, not a claim that the capture pipeline is healthy.
    pub(crate) fn reported_faults(&self) -> [bool; N] {
        self.report
            .last
            .map(|(_, faults)| faults)
            .unwrap_or([false; N])
    }

    pub(crate) fn should_report(&mut self, now: Duration, counters: [u64; N]) -> bool {
        let faults = std::array::from_fn(|i| counters[i] != self.previous[i]);
        self.previous = counters;
        self.report.should_report(now, faults)
    }
}

/// Summarize every local resource sample between remote reports. Legacy fields
/// remain point samples; these separate fields retain short peaks and averages.
#[derive(Default)]
pub(crate) struct ResourceReportWindow {
    pub(crate) samples: u64,
    cpu_sum: f64,
    memory_sum: f64,
    pub(crate) cpu_max: f64,
    pub(crate) memory_max: f64,
    pub(crate) footprint_max: f64,
}

impl ResourceReportWindow {
    pub(crate) fn observe(&mut self, cpu: f64, memory: f64, footprint: f64) {
        self.samples += 1;
        self.cpu_sum += cpu;
        self.memory_sum += memory;
        self.cpu_max = self.cpu_max.max(cpu);
        self.memory_max = self.memory_max.max(memory);
        self.footprint_max = self.footprint_max.max(footprint);
    }

    pub(crate) fn cpu_mean(&self) -> f64 {
        self.cpu_sum / self.samples.max(1) as f64
    }

    pub(crate) fn memory_mean(&self) -> f64 {
        self.memory_sum / self.samples.max(1) as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steady_health_has_initial_presence_and_hourly_reports() {
        let mut gate = PipelineReportGate::<2>::new();
        let reports = (0..86400)
            .step_by(60)
            .filter(|seconds| gate.should_report(Duration::from_secs(*seconds), [0, 0]))
            .count();
        assert_eq!(reports, 24); // 1440 minute reports -> 24 hourly reports.
    }

    #[test]
    fn faults_recovery_and_counter_reset_bypass_the_heartbeat() {
        let mut gate = PipelineReportGate::new();
        for (seconds, counters, expected) in [
            (0, [0, 0], true),
            (60, [0, 0], false),
            (120, [1, 0], true),
            (180, [2, 0], false),
            (240, [2, 0], true),
            (300, [2, 0], false),
            (360, [2, 1], true),
            (420, [2, 1], true),
            (480, [0, 0], true),
            (540, [0, 0], true),
        ] {
            assert_eq!(
                gate.should_report(Duration::from_secs(seconds), counters),
                expected
            );
        }
    }

    #[test]
    fn a_continuing_fault_does_not_hide_another_fault_class() {
        let mut gate = PipelineReportGate::new();
        assert!(gate.should_report(Duration::ZERO, [1, 0]));
        assert!(!gate.should_report(Duration::from_secs(60), [2, 0]));
        assert!(gate.should_report(Duration::from_secs(120), [3, 1]));
        assert_eq!(gate.reported_faults(), [true, true]);
        assert!(gate.should_report(Duration::from_secs(180), [4, 1]));
        assert_eq!(gate.reported_faults(), [true, false]);
        assert!(gate.should_report(Duration::from_secs(240), [4, 1]));
        assert_eq!(gate.reported_faults(), [false, false]);
    }

    #[test]
    fn sustained_faults_still_report_hourly() {
        let mut gate = PipelineReportGate::new();
        assert!(gate.should_report(Duration::ZERO, [1]));
        for i in 1..60 {
            assert!(!gate.should_report(Duration::from_secs(i * 60), [i + 1]));
        }
        assert!(gate.should_report(Duration::from_secs(3600), [61]));
    }

    #[test]
    fn api_flood_preserves_first_five_then_resets_without_reopening_old_windows() {
        let budget = ApiValueBudget::new();
        for window in [1, 2, 100] {
            let emitted = (0..100_000).filter(|_| budget.claim(window)).count();
            assert_eq!(emitted, 5);
            assert!(!budget.claim(window - 1));
        }
    }

    #[test]
    fn concurrent_api_requests_share_the_same_budget() {
        let budget = ApiValueBudget::new();
        let emitted = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..16)
                .map(|_| scope.spawn(|| (0..1000).filter(|_| budget.claim(1)).count()))
                .collect();
            handles
                .into_iter()
                .map(|h| h.join().unwrap())
                .sum::<usize>()
        });
        assert_eq!(emitted, 5);
    }

    #[test]
    fn resource_window_retains_short_peaks_and_resets_between_reports() {
        let mut window = ResourceReportWindow::default();
        for (cpu, memory, footprint) in [(10.0, 1.0, 2.0), (100.0, 4.0, 5.0), (10.0, 1.0, 2.0)] {
            window.observe(cpu, memory, footprint);
        }
        let report = std::mem::take(&mut window);
        assert_eq!(report.samples, 3);
        assert_eq!(report.cpu_mean(), 40.0);
        assert_eq!(report.memory_mean(), 2.0);
        assert_eq!(report.cpu_max, 100.0);
        assert_eq!(report.memory_max, 4.0);
        assert_eq!(report.footprint_max, 5.0);
        window.observe(5.0, 0.5, 1.0);
        assert_eq!(window.samples, 1);
        assert_eq!(window.cpu_mean(), 5.0);
        assert_eq!(window.memory_max, 0.5);
    }

    #[test]
    fn health_clock_rollback_does_not_force_a_report() {
        let mut gate = HealthReportGate::new(HEALTH_REPORT_INTERVAL);
        assert!(gate.should_report(Duration::from_secs(100), false));
        assert!(!gate.should_report(Duration::from_secs(50), false));
        assert!(gate.should_report(Duration::from_secs(50), true));
    }
}
