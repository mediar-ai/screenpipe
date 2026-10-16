// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

/// Summarize every local resource sample between remote reports. Legacy fields
/// remain point samples; these additive fields expose peaks and averages between reports.
/// This summary does not replace samples or change the reporting cadence.
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
    fn window_retains_short_peaks_and_resets_between_reports() {
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
    fn empty_window_is_finite() {
        let window = ResourceReportWindow::default();
        assert_eq!(window.samples, 0);
        assert_eq!(window.cpu_mean(), 0.0);
        assert_eq!(window.memory_mean(), 0.0);
    }

    #[test]
    fn sample_counts_preserve_weighted_means_across_unequal_windows() {
        let mut short = ResourceReportWindow::default();
        short.observe(100.0, 4.0, 5.0);
        let mut long = ResourceReportWindow::default();
        for _ in 0..3 {
            long.observe(20.0, 2.0, 3.0);
        }
        let count = (short.samples + long.samples) as f64;
        let cpu = (short.cpu_mean() * short.samples as f64 + long.cpu_mean() * long.samples as f64)
            / count;
        let memory = (short.memory_mean() * short.samples as f64
            + long.memory_mean() * long.samples as f64)
            / count;
        assert_eq!(cpu, 40.0);
        assert_eq!(memory, 2.5);
    }
}
