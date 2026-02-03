//! # Audio Transcription Deduplication Benchmark Suite
//!
//! Research-grade benchmarks for evaluating transcription deduplication accuracy
//! under realistic conditions including:
//!
//! - 24/7 continuous recording simulation
//! - Intermittent speech patterns with variable silence gaps
//! - Multiple concurrent speakers (up to 6+)
//! - Cross-device capture (input microphone + output speaker)
//! - Whisper transcription variations and noise
//! - VAD (Voice Activity Detection) boundary effects
//! - Long-term state accumulation and memory pressure
//!
//! ## Running Benchmarks
//!
//! ```bash
//! # Run all benchmarks
//! cargo test --package screenpipe-audio --test dedup_benchmark -- --nocapture
//!
//! # Run specific scenario
//! cargo test --package screenpipe-audio --test dedup_benchmark continuous_24h -- --nocapture
//!
//! # Run with release optimizations (for timing accuracy)
//! cargo test --release --package screenpipe-audio --test dedup_benchmark -- --nocapture
//! ```
//!
//! ## Metrics
//!
//! The benchmarks report:
//! - **Precision**: Of transcripts marked as duplicates, how many were actually duplicates?
//! - **Recall**: Of all actual duplicates, how many were correctly identified?
//! - **F1 Score**: Harmonic mean of precision and recall
//! - **Dedup Rate**: Percentage of input blocked as duplicates
//! - **False Positive Rate**: Unique content incorrectly blocked
//! - **False Negative Rate**: Duplicates that slipped through

mod fixtures;
mod integration;
mod metrics;
mod scenarios;
mod simulation;

pub use fixtures::*;
pub use metrics::*;
pub use scenarios::*;
pub use simulation::*;
