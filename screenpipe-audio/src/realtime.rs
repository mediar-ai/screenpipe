use crate::{deepgram::stream_transcription_deepgram, AudioStream};
use anyhow::Result;
use chrono::{DateTime, Utc};
use screenpipe_core::Language;
use serde::{Deserialize, Serialize};
use std::sync::{atomic::AtomicBool, Arc};

pub async fn realtime_stt(
    stream: Arc<AudioStream>,
    languages: Arc<Vec<Language>>,
    is_running: Arc<AtomicBool>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    stream_transcription_deepgram(stream, languages, is_running, deepgram_api_key).await?;

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeTranscriptionEvent {
    pub timestamp: DateTime<Utc>,
    pub device: String,
    pub transcription: String,
    pub is_final: bool,
    pub is_input: bool,
}
