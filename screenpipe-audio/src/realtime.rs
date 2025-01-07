use crate::{AudioStream, AudioTranscriptionEngine};
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
) -> Result<String> {
    while is_running.load(Ordering::Relaxed) {
        realtime_transcription_sender.send(RealtimeTranscriptionEvent {
            timestamp: Utc::now(),
            device: stream.device.to_string(),
            transcription: "test".to_string(),
        });
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Ok(String::new())
}

#[derive(Serialize, Clone)]
pub struct RealtimeTranscriptionEvent {
    timestamp: DateTime<Utc>,
    device: String,
    transcription: String,
}
