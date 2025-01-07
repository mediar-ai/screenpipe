use crate::{deepgram::stream_transcription_deepgram, AudioStream, AudioTranscriptionEngine};
use anyhow::Result;
use chrono::{DateTime, Utc};
use screenpipe_core::Language;
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

pub async fn realtime_stt(
    stream: Arc<AudioStream>,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    languages: Vec<Language>,
    realtime_transcription_sender: Arc<tokio::sync::broadcast::Sender<RealtimeTranscriptionEvent>>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    // while is_running.load(Ordering::Relaxed) {
    //     realtime_transcription_sender.send(RealtimeTranscriptionEvent {
    //         timestamp: Utc::now(),
    //         device: stream.device.to_string(),
    //         transcription: "test".to_string(),
    //     });
    //     tokio::time::sleep(Duration::from_secs(1)).await;
    // }
    match *audio_transcription_engine {
        AudioTranscriptionEngine::Deepgram => {
            stream_transcription_deepgram(
                stream,
                realtime_transcription_sender,
                languages,
                is_running,
            )
            .await?;
        }
        _ => {
            return Err(anyhow::anyhow!("Unsupported audio transcription engine"));
        }
    }
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct RealtimeTranscriptionEvent {
    pub timestamp: DateTime<Utc>,
    pub device: String,
    pub transcription: String,
}
