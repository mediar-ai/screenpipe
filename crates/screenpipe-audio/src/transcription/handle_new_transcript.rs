use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use crate::{core::engine::AudioTranscriptionEngine, transcription::process_transcription_result};
use screenpipe_db::DatabaseManager;
use tracing::{error, info};

use super::TranscriptionResult;

// =============================================================================
// AUDIO DEDUP METRICS
// =============================================================================
// These counters track transcription deduplication performance.
// Call get_dedup_stats() periodically to read and send to analytics.

static TRANSCRIPTS_TOTAL: AtomicU64 = AtomicU64::new(0);
static TRANSCRIPTS_INSERTED: AtomicU64 = AtomicU64::new(0);
static TRANSCRIPTS_DUPLICATE_BLOCKED: AtomicU64 = AtomicU64::new(0);
static TRANSCRIPTS_OVERLAP_TRIMMED: AtomicU64 = AtomicU64::new(0);
static TRANSCRIPTS_WORD_COUNT_TOTAL: AtomicU64 = AtomicU64::new(0);

/// Audio transcription dedup statistics
#[derive(Debug, Clone, Default)]
pub struct AudioDedupStats {
    /// Total transcriptions received
    pub total: u64,
    /// Transcriptions inserted into database
    pub inserted: u64,
    /// Exact duplicates blocked
    pub duplicate_blocked: u64,
    /// Partial overlaps that were trimmed
    pub overlap_trimmed: u64,
    /// Total word count (for average calculation)
    pub word_count_total: u64,
}

impl AudioDedupStats {
    /// Calculate duplicate block rate (0.0 - 1.0)
    pub fn duplicate_rate(&self) -> f64 {
        if self.total == 0 {
            0.0
        } else {
            self.duplicate_blocked as f64 / self.total as f64
        }
    }

    /// Calculate average words per transcript
    pub fn avg_word_count(&self) -> f64 {
        if self.inserted == 0 {
            0.0
        } else {
            self.word_count_total as f64 / self.inserted as f64
        }
    }
}

/// Get current dedup stats and optionally reset counters
/// Call this periodically (e.g., every 5 minutes) to send to PostHog
pub fn get_dedup_stats(reset: bool) -> AudioDedupStats {
    if reset {
        AudioDedupStats {
            total: TRANSCRIPTS_TOTAL.swap(0, Ordering::SeqCst),
            inserted: TRANSCRIPTS_INSERTED.swap(0, Ordering::SeqCst),
            duplicate_blocked: TRANSCRIPTS_DUPLICATE_BLOCKED.swap(0, Ordering::SeqCst),
            overlap_trimmed: TRANSCRIPTS_OVERLAP_TRIMMED.swap(0, Ordering::SeqCst),
            word_count_total: TRANSCRIPTS_WORD_COUNT_TOTAL.swap(0, Ordering::SeqCst),
        }
    } else {
        AudioDedupStats {
            total: TRANSCRIPTS_TOTAL.load(Ordering::SeqCst),
            inserted: TRANSCRIPTS_INSERTED.load(Ordering::SeqCst),
            duplicate_blocked: TRANSCRIPTS_DUPLICATE_BLOCKED.load(Ordering::SeqCst),
            overlap_trimmed: TRANSCRIPTS_OVERLAP_TRIMMED.load(Ordering::SeqCst),
            word_count_total: TRANSCRIPTS_WORD_COUNT_TOTAL.load(Ordering::SeqCst),
        }
    }
}

pub async fn handle_new_transcript(
    db: Arc<DatabaseManager>,
    transcription_receiver: Arc<crossbeam::channel::Receiver<TranscriptionResult>>,
    transcription_engine: Arc<AudioTranscriptionEngine>,
    use_pii_removal: bool,
) {
    let mut previous_transcript = "".to_string();
    let mut previous_transcript_id: Option<i64> = None;
    while let Ok(mut transcription) = transcription_receiver.recv() {
        if transcription
            .transcription
            .clone()
            .is_some_and(|t| t.is_empty())
        {
            continue;
        }

        TRANSCRIPTS_TOTAL.fetch_add(1, Ordering::SeqCst);

        info!(
            "device {} received transcription ({} chars)",
            transcription.input.device,
            transcription
                .transcription
                .as_ref()
                .map(|t| t.len())
                .unwrap_or(0)
        );

        // Insert the new transcript after fetching
        let mut current_transcript: Option<String> = transcription.transcription.clone();
        let mut processed_previous: Option<String> = None;
        let mut was_trimmed = false;

        if let Some((previous, current)) =
            transcription.cleanup_overlap(previous_transcript.clone())
        {
            // If current is empty after cleanup, the entire transcript was a duplicate - skip it
            if current.is_empty() {
                TRANSCRIPTS_DUPLICATE_BLOCKED.fetch_add(1, Ordering::SeqCst);
                info!(
                    "device {} skipping duplicate transcript (entire content overlaps with previous)",
                    transcription.input.device
                );
                continue;
            }

            // Update previous transcript if it was trimmed
            if !previous.is_empty() && previous != previous_transcript {
                processed_previous = Some(previous);
            }

            // Use the cleaned current transcript (with overlap removed)
            if current != current_transcript.clone().unwrap_or_default() {
                current_transcript = Some(current);
                was_trimmed = true;
                TRANSCRIPTS_OVERLAP_TRIMMED.fetch_add(1, Ordering::SeqCst);
            }
        }

        transcription.transcription = current_transcript.clone();
        if current_transcript.is_some() {
            previous_transcript = current_transcript.clone().unwrap();
        } else {
            continue;
        }

        let word_count = current_transcript
            .as_ref()
            .map(|t| t.split_whitespace().count())
            .unwrap_or(0);

        // Save device name before moving transcription
        let device_name = transcription.input.device.to_string();

        // Process the transcription result
        match process_transcription_result(
            &db,
            transcription,
            transcription_engine.clone(),
            processed_previous,
            previous_transcript_id,
            use_pii_removal,
        )
        .await
        {
            Err(e) => error!("Error processing audio result: {}", e),
            Ok(id) => {
                previous_transcript_id = id;
                TRANSCRIPTS_INSERTED.fetch_add(1, Ordering::SeqCst);
                TRANSCRIPTS_WORD_COUNT_TOTAL.fetch_add(word_count as u64, Ordering::SeqCst);

                if was_trimmed {
                    info!(
                        "device {} inserted trimmed transcript ({} words)",
                        device_name, word_count
                    );
                }
            }
        }
    }
}
