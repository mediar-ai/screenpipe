use std::sync::Arc;

use crate::{core::engine::AudioTranscriptionEngine, transcription::process_transcription_result};
use screenpipe_db::DatabaseManager;
use tracing::{error, info};

use super::TranscriptionResult;

pub async fn handle_new_transcript(
    db: Arc<DatabaseManager>,
    transcription_receiver: Arc<crossbeam::channel::Receiver<TranscriptionResult>>,
    transcription_engine: Arc<AudioTranscriptionEngine>,
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

        info!(
            "device {} received transcription {:?}",
            transcription.input.device, transcription.transcription
        );

        // Insert the new transcript after fetching
        let mut current_transcript: Option<String> = transcription.transcription.clone();
        let mut processed_previous: Option<String> = None;
        if let Some((previous, current)) =
            transcription.cleanup_overlap(previous_transcript.clone())
        {
            if !previous.is_empty() && !current.is_empty() {
                if previous != previous_transcript {
                    processed_previous = Some(previous);
                }
                if current_transcript.is_some()
                    && current != current_transcript.clone().unwrap_or_default()
                {
                    current_transcript = Some(current);
                }
            }
        }

        transcription.transcription = current_transcript.clone();
        if current_transcript.is_some() {
            previous_transcript = current_transcript.unwrap();
        } else {
            continue;
        }
        // Process the transcription result
        match process_transcription_result(
            &db,
            transcription,
            transcription_engine.clone(),
            processed_previous,
            previous_transcript_id,
        )
        .await
        {
            Err(e) => error!("Error processing audio result: {}", e),
            Ok(id) => previous_transcript_id = id,
        }
    }
}
