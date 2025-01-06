use crate::{AudioStream, AudioTranscriptionEngine};
use anyhow::Result;
use screenpipe_core::Language;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub async fn realtime_stt(
    stream: Arc<AudioStream>,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    languages: Vec<Language>,
) -> Result<String> {
    Ok(String::new())
}
