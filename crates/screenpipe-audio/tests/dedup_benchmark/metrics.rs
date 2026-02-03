//! Metrics calculation for deduplication benchmark evaluation
//!
//! Provides standard information retrieval metrics adapted for
//! transcription deduplication evaluation.

use std::fmt;

// =============================================================================
// CONFUSION MATRIX
// =============================================================================

/// Confusion matrix for deduplication evaluation
#[derive(Debug, Clone, Default)]
pub struct ConfusionMatrix {
    /// True Positives: Duplicates correctly blocked
    pub true_positives: usize,
    /// True Negatives: Unique content correctly inserted
    pub true_negatives: usize,
    /// False Positives: Unique content incorrectly blocked
    pub false_positives: usize,
    /// False Negatives: Duplicates incorrectly inserted
    pub false_negatives: usize,
}

impl ConfusionMatrix {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a deduplication decision
    ///
    /// - `was_blocked`: Whether the dedup logic blocked this transcript
    /// - `is_duplicate`: Ground truth - whether this was actually a duplicate
    pub fn record(&mut self, was_blocked: bool, is_duplicate: bool) {
        match (was_blocked, is_duplicate) {
            (true, true) => self.true_positives += 1,
            (false, false) => self.true_negatives += 1,
            (true, false) => self.false_positives += 1,
            (false, true) => self.false_negatives += 1,
        }
    }

    /// Total number of samples
    pub fn total(&self) -> usize {
        self.true_positives + self.true_negatives + self.false_positives + self.false_negatives
    }

    /// Total actual duplicates (TP + FN)
    pub fn actual_positives(&self) -> usize {
        self.true_positives + self.false_negatives
    }

    /// Total actual unique (TN + FP)
    pub fn actual_negatives(&self) -> usize {
        self.true_negatives + self.false_positives
    }

    /// Total predicted duplicates (TP + FP)
    pub fn predicted_positives(&self) -> usize {
        self.true_positives + self.false_positives
    }

    /// Total predicted unique (TN + FN)
    pub fn predicted_negatives(&self) -> usize {
        self.true_negatives + self.false_negatives
    }
}

impl fmt::Display for ConfusionMatrix {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "Confusion Matrix:")?;
        writeln!(f, "                    Predicted")?;
        writeln!(f, "                 Dup    Unique")?;
        writeln!(
            f,
            "Actual Dup     {:>5}   {:>5}",
            self.true_positives, self.false_negatives
        )?;
        writeln!(
            f,
            "Actual Unique  {:>5}   {:>5}",
            self.false_positives, self.true_negatives
        )
    }
}

// =============================================================================
// METRICS
// =============================================================================

/// Computed metrics from confusion matrix
#[derive(Debug, Clone)]
pub struct DedupMetrics {
    /// Confusion matrix
    pub confusion: ConfusionMatrix,
    /// Precision: TP / (TP + FP)
    /// Of items marked as duplicates, how many were actually duplicates?
    pub precision: f64,
    /// Recall: TP / (TP + FN)
    /// Of all actual duplicates, how many were correctly identified?
    pub recall: f64,
    /// F1 Score: 2 * (precision * recall) / (precision + recall)
    pub f1_score: f64,
    /// Accuracy: (TP + TN) / Total
    pub accuracy: f64,
    /// Specificity: TN / (TN + FP)
    /// Of all unique items, how many were correctly passed through?
    pub specificity: f64,
    /// False Positive Rate: FP / (FP + TN)
    /// Rate at which unique content is incorrectly blocked
    pub false_positive_rate: f64,
    /// False Negative Rate: FN / (FN + TP)
    /// Rate at which duplicates slip through
    pub false_negative_rate: f64,
    /// Dedup Rate: Predicted Positives / Total
    /// Overall rate of blocking
    pub dedup_rate: f64,
}

impl DedupMetrics {
    pub fn from_confusion_matrix(cm: ConfusionMatrix) -> Self {
        let total = cm.total() as f64;
        let actual_pos = cm.actual_positives() as f64;
        let actual_neg = cm.actual_negatives() as f64;
        let pred_pos = cm.predicted_positives() as f64;

        let precision = if pred_pos > 0.0 {
            cm.true_positives as f64 / pred_pos
        } else {
            0.0
        };

        let recall = if actual_pos > 0.0 {
            cm.true_positives as f64 / actual_pos
        } else {
            1.0 // No duplicates to find
        };

        let f1_score = if precision + recall > 0.0 {
            2.0 * (precision * recall) / (precision + recall)
        } else {
            0.0
        };

        let accuracy = if total > 0.0 {
            (cm.true_positives + cm.true_negatives) as f64 / total
        } else {
            0.0
        };

        let specificity = if actual_neg > 0.0 {
            cm.true_negatives as f64 / actual_neg
        } else {
            1.0 // No unique items to pass through
        };

        let false_positive_rate = if actual_neg > 0.0 {
            cm.false_positives as f64 / actual_neg
        } else {
            0.0
        };

        let false_negative_rate = if actual_pos > 0.0 {
            cm.false_negatives as f64 / actual_pos
        } else {
            0.0
        };

        let dedup_rate = if total > 0.0 { pred_pos / total } else { 0.0 };

        Self {
            confusion: cm,
            precision,
            recall,
            f1_score,
            accuracy,
            specificity,
            false_positive_rate,
            false_negative_rate,
            dedup_rate,
        }
    }
}

impl fmt::Display for DedupMetrics {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "{}", self.confusion)?;
        writeln!(f)?;
        writeln!(f, "Metrics:")?;
        writeln!(f, "  Precision:           {:.2}%", self.precision * 100.0)?;
        writeln!(f, "  Recall:              {:.2}%", self.recall * 100.0)?;
        writeln!(f, "  F1 Score:            {:.2}%", self.f1_score * 100.0)?;
        writeln!(f, "  Accuracy:            {:.2}%", self.accuracy * 100.0)?;
        writeln!(f, "  Specificity:         {:.2}%", self.specificity * 100.0)?;
        writeln!(
            f,
            "  False Positive Rate: {:.2}%",
            self.false_positive_rate * 100.0
        )?;
        writeln!(
            f,
            "  False Negative Rate: {:.2}%",
            self.false_negative_rate * 100.0
        )?;
        writeln!(f, "  Dedup Rate:          {:.2}%", self.dedup_rate * 100.0)
    }
}

// =============================================================================
// BENCHMARK RESULT
// =============================================================================

/// Complete benchmark result with metadata
#[derive(Debug)]
pub struct BenchmarkResult {
    /// Name of the benchmark scenario
    pub scenario_name: String,
    /// Description of the scenario
    pub description: String,
    /// Metrics for fixed (new) logic
    pub fixed_metrics: DedupMetrics,
    /// Metrics for buggy (old) logic
    pub buggy_metrics: DedupMetrics,
    /// Total input transcripts
    pub total_inputs: usize,
    /// Expected unique transcripts
    pub expected_unique: usize,
    /// Simulated recording duration in seconds
    pub duration_secs: f64,
    /// Number of devices
    pub num_devices: usize,
    /// Number of speakers
    pub num_speakers: usize,
}

impl BenchmarkResult {
    /// Calculate improvement from buggy to fixed
    pub fn f1_improvement(&self) -> f64 {
        self.fixed_metrics.f1_score - self.buggy_metrics.f1_score
    }

    pub fn recall_improvement(&self) -> f64 {
        self.fixed_metrics.recall - self.buggy_metrics.recall
    }

    pub fn precision_improvement(&self) -> f64 {
        self.fixed_metrics.precision - self.buggy_metrics.precision
    }
}

impl fmt::Display for BenchmarkResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "\n{}", "=".repeat(80))?;
        writeln!(f, " BENCHMARK: {}", self.scenario_name)?;
        writeln!(f, "{}", "=".repeat(80))?;
        writeln!(f)?;
        writeln!(f, "Description: {}", self.description)?;
        writeln!(f)?;
        writeln!(f, "Configuration:")?;
        writeln!(
            f,
            "  Duration:        {:.1}s ({:.1} min)",
            self.duration_secs,
            self.duration_secs / 60.0
        )?;
        writeln!(f, "  Devices:         {}", self.num_devices)?;
        writeln!(f, "  Speakers:        {}", self.num_speakers)?;
        writeln!(f, "  Total inputs:    {}", self.total_inputs)?;
        writeln!(f, "  Expected unique: {}", self.expected_unique)?;
        writeln!(f)?;

        writeln!(f, "{:->15} BUGGY LOGIC {:->15}", "", "")?;
        writeln!(f, "{}", self.buggy_metrics)?;

        writeln!(f, "{:->15} FIXED LOGIC {:->15}", "", "")?;
        writeln!(f, "{}", self.fixed_metrics)?;

        writeln!(f, "{:->15} IMPROVEMENT {:->15}", "", "")?;
        writeln!(f, "  F1 Score:   {:+.2}%", self.f1_improvement() * 100.0)?;
        writeln!(
            f,
            "  Recall:     {:+.2}%",
            self.recall_improvement() * 100.0
        )?;
        writeln!(
            f,
            "  Precision:  {:+.2}%",
            self.precision_improvement() * 100.0
        )?;

        Ok(())
    }
}

// =============================================================================
// AGGREGATE REPORT
// =============================================================================

/// Aggregate report across multiple benchmark scenarios
#[derive(Debug)]
pub struct AggregateReport {
    pub results: Vec<BenchmarkResult>,
}

impl AggregateReport {
    pub fn new() -> Self {
        Self {
            results: Vec::new(),
        }
    }

    pub fn add(&mut self, result: BenchmarkResult) {
        self.results.push(result);
    }

    /// Average F1 improvement across all scenarios
    pub fn avg_f1_improvement(&self) -> f64 {
        if self.results.is_empty() {
            return 0.0;
        }
        self.results.iter().map(|r| r.f1_improvement()).sum::<f64>() / self.results.len() as f64
    }

    /// Average fixed F1 score
    pub fn avg_fixed_f1(&self) -> f64 {
        if self.results.is_empty() {
            return 0.0;
        }
        self.results
            .iter()
            .map(|r| r.fixed_metrics.f1_score)
            .sum::<f64>()
            / self.results.len() as f64
    }

    /// Average buggy F1 score
    pub fn avg_buggy_f1(&self) -> f64 {
        if self.results.is_empty() {
            return 0.0;
        }
        self.results
            .iter()
            .map(|r| r.buggy_metrics.f1_score)
            .sum::<f64>()
            / self.results.len() as f64
    }
}

impl Default for AggregateReport {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for AggregateReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "\n{}", "#".repeat(80))?;
        writeln!(f, " AGGREGATE BENCHMARK REPORT ")?;
        writeln!(f, "{}", "#".repeat(80))?;
        writeln!(f)?;

        // Individual results
        for result in &self.results {
            writeln!(f, "{}", result)?;
        }

        // Summary table
        writeln!(f, "\n{}", "=".repeat(80))?;
        writeln!(f, " SUMMARY TABLE ")?;
        writeln!(f, "{}", "=".repeat(80))?;
        writeln!(f)?;
        writeln!(
            f,
            "{:<30} {:>10} {:>10} {:>10}",
            "Scenario", "Buggy F1", "Fixed F1", "Improve"
        )?;
        writeln!(f, "{:-<30} {:-<10} {:-<10} {:-<10}", "", "", "", "")?;

        for result in &self.results {
            writeln!(
                f,
                "{:<30} {:>9.1}% {:>9.1}% {:>+9.1}%",
                result.scenario_name,
                result.buggy_metrics.f1_score * 100.0,
                result.fixed_metrics.f1_score * 100.0,
                result.f1_improvement() * 100.0
            )?;
        }

        writeln!(f, "{:-<30} {:-<10} {:-<10} {:-<10}", "", "", "", "")?;
        writeln!(
            f,
            "{:<30} {:>9.1}% {:>9.1}% {:>+9.1}%",
            "AVERAGE",
            self.avg_buggy_f1() * 100.0,
            self.avg_fixed_f1() * 100.0,
            self.avg_f1_improvement() * 100.0
        )?;

        Ok(())
    }
}

// =============================================================================
// TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_confusion_matrix_recording() {
        let mut cm = ConfusionMatrix::new();

        // TP: Duplicate correctly blocked
        cm.record(true, true);
        // TN: Unique correctly inserted
        cm.record(false, false);
        // FP: Unique incorrectly blocked
        cm.record(true, false);
        // FN: Duplicate incorrectly inserted
        cm.record(false, true);

        assert_eq!(cm.true_positives, 1);
        assert_eq!(cm.true_negatives, 1);
        assert_eq!(cm.false_positives, 1);
        assert_eq!(cm.false_negatives, 1);
        assert_eq!(cm.total(), 4);
    }

    #[test]
    fn test_perfect_metrics() {
        let mut cm = ConfusionMatrix::new();

        // All duplicates blocked, all unique inserted
        for _ in 0..10 {
            cm.record(true, true); // TP
        }
        for _ in 0..10 {
            cm.record(false, false); // TN
        }

        let metrics = DedupMetrics::from_confusion_matrix(cm);

        assert!((metrics.precision - 1.0).abs() < 0.001);
        assert!((metrics.recall - 1.0).abs() < 0.001);
        assert!((metrics.f1_score - 1.0).abs() < 0.001);
        assert!((metrics.accuracy - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_zero_recall_metrics() {
        let mut cm = ConfusionMatrix::new();

        // All duplicates slip through (no blocking)
        for _ in 0..10 {
            cm.record(false, true); // FN
        }
        for _ in 0..10 {
            cm.record(false, false); // TN
        }

        let metrics = DedupMetrics::from_confusion_matrix(cm);

        assert!((metrics.recall - 0.0).abs() < 0.001);
        assert!((metrics.false_negative_rate - 1.0).abs() < 0.001);
    }
}
