use std::sync::Arc;

use screenpipe_core::pii_removal::remove_pii;
use screenpipe_db::{DatabaseManager, Speaker};
use tracing::{debug, error, info};

use crate::core::engine::AudioTranscriptionEngine;

use super::{text_utils::longest_common_word_substring, AudioInput};

#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    pub path: String,
    pub input: AudioInput,
    pub speaker_embedding: Vec<f32>,
    pub transcription: Option<String>,
    pub timestamp: u64,
    pub error: Option<String>,
    pub start_time: f64,
    pub end_time: f64,
}

impl TranscriptionResult {
    // TODO --optimize
    pub fn cleanup_overlap(&mut self, previous_transcript: String) -> Option<(String, String)> {
        if let Some(transcription) = &self.transcription {
            let transcription = transcription.to_string();
            if let Some((prev_idx, cur_idx, match_len)) =
                longest_common_word_substring(previous_transcript.as_str(), transcription.as_str())
            {
                // strip old transcript from prev_idx word pos (keep words before the overlap)
                let prev_words: Vec<&str> = previous_transcript.split_whitespace().collect();
                let new_prev = prev_words[..prev_idx].join(" ");

                // strip new transcript AFTER the overlap ends (skip the overlapped portion)
                let curr_words: Vec<&str> = transcription.split_whitespace().collect();
                let skip_until = cur_idx + match_len;
                let new_cur = if skip_until < curr_words.len() {
                    curr_words[skip_until..].join(" ")
                } else {
                    String::new() // Entire current transcript was overlap
                };

                return Some((new_prev, new_cur));
            }
        }

        None
    }
}

pub async fn process_transcription_result(
    db: &DatabaseManager,
    result: TranscriptionResult,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    previous_transcript: Option<String>,
    previous_transcript_id: Option<i64>,
    use_pii_removal: bool,
) -> Result<Option<i64>, anyhow::Error> {
    if result.error.is_some() || result.transcription.is_none() {
        error!(
            "Error in audio recording: {}. Not inserting audio result",
            result.error.unwrap_or_default()
        );
        return Ok(None);
    }

    let speaker = get_or_create_speaker_from_embedding(db, &result.speaker_embedding).await?;

    info!("Detected speaker: {:?}", speaker);

    let raw_transcription = result.transcription.unwrap();
    // Apply PII removal if enabled
    let transcription = if use_pii_removal {
        remove_pii(&raw_transcription)
    } else {
        raw_transcription
    };
    let transcription_engine = audio_transcription_engine.to_string();
    let mut chunk_id: Option<i64> = None;

    info!(
        "device {} inserting audio chunk: {:?}",
        result.input.device, result.path
    );
    if let Some(id) = previous_transcript_id {
        if let Some(prev_transcript) = previous_transcript {
            // Apply PII removal to previous transcript update as well
            let sanitized_prev = if use_pii_removal {
                remove_pii(&prev_transcript)
            } else {
                prev_transcript
            };
            match db
                .update_audio_transcription(id, sanitized_prev.as_str())
                .await
            {
                Ok(_) => {}
                Err(e) => error!(
                    "Failed to update transcription for {}: audio_chunk_id {}",
                    result.input.device, e
                ),
            }
        }
    }
    match db.get_or_insert_audio_chunk(&result.path).await {
        Ok(audio_chunk_id) => {
            if transcription.is_empty() {
                return Ok(Some(audio_chunk_id));
            }

            if let Err(e) = db
                .insert_audio_transcription(
                    audio_chunk_id,
                    &transcription,
                    0,
                    &transcription_engine,
                    &screenpipe_db::AudioDevice {
                        name: result.input.device.name.clone(),
                        device_type: match result.input.device.device_type {
                            crate::core::device::DeviceType::Input => {
                                screenpipe_db::DeviceType::Input
                            }
                            crate::core::device::DeviceType::Output => {
                                screenpipe_db::DeviceType::Output
                            }
                        },
                    },
                    Some(speaker.id),
                    Some(result.start_time),
                    Some(result.end_time),
                )
                .await
            {
                error!(
                    "Failed to insert audio transcription for device {}: {}",
                    result.input.device, e
                );
                return Ok(Some(audio_chunk_id));
            } else {
                debug!(
                    "Inserted audio transcription for chunk {} from device {} using {}",
                    audio_chunk_id, result.input.device, transcription_engine
                );
                chunk_id = Some(audio_chunk_id);
            }
        }
        Err(e) => error!(
            "Failed to insert audio chunk for device {}: {}",
            result.input.device, e
        ),
    }
    Ok(chunk_id)
}

async fn get_or_create_speaker_from_embedding(
    db: &DatabaseManager,
    embedding: &[f32],
) -> Result<Speaker, anyhow::Error> {
    let speaker = db.get_speaker_from_embedding(embedding).await?;
    if let Some(speaker) = speaker {
        Ok(speaker)
    } else {
        let speaker = db.insert_speaker(embedding).await?;
        Ok(speaker)
    }
}
