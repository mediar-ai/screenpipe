pub mod device;
pub mod engine;
mod run_record_and_transcribe;
pub mod stream;
use crate::transcription::deepgram::streaming::stream_transcription_deepgram;
use crate::AudioInput;
use anyhow::Result;
use dashmap::DashMap;
use lazy_static::lazy_static;
use screenpipe_core::Language;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use stream::AudioStream;
use tracing::error;

lazy_static! {
    // Global fallback timestamp for backward compatibility
    pub static ref LAST_AUDIO_CAPTURE: AtomicU64 = AtomicU64::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );

    // Per-device tracking of last audio capture
    pub static ref DEVICE_AUDIO_CAPTURES: DashMap<String, AtomicU64> = DashMap::new();
}

/// Updates the last capture time for a specific device
pub fn update_device_capture_time(device_name: &str) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Update the global timestamp for backward compatibility
    LAST_AUDIO_CAPTURE.store(now, Ordering::Relaxed);

    // Update or insert the device-specific timestamp
    DEVICE_AUDIO_CAPTURES
        .entry(device_name.to_string())
        .or_insert_with(|| AtomicU64::new(now))
        .store(now, Ordering::Relaxed);
}

/// Gets the last capture time for a specific device
pub fn get_device_capture_time(device_name: &str) -> u64 {
    DEVICE_AUDIO_CAPTURES
        .get(device_name)
        .map(|atomic| atomic.load(Ordering::Relaxed))
        .unwrap_or_else(|| LAST_AUDIO_CAPTURE.load(Ordering::Relaxed))
}

fn is_normal_shutdown(is_running: &Arc<AtomicBool>) -> bool {
    !is_running.load(Ordering::Relaxed)
}

pub async fn record_and_transcribe(
    audio_stream: Arc<AudioStream>,
    duration: Duration,
    whisper_sender: Arc<crossbeam::channel::Sender<AudioInput>>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    while is_running.load(Ordering::Relaxed) {
        match run_record_and_transcribe::run_record_and_transcribe(
            audio_stream.clone(),
            duration,
            whisper_sender.clone(),
            is_running.clone(),
        )
        .await
        {
            Ok(_) => break, // Normal shutdown
            Err(e) => {
                if is_normal_shutdown(&is_running) {
                    return Err(e);
                }
                error!("record_and_transcribe error, restarting: {}", e);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
    Ok(())
}

pub async fn start_realtime_recording(
    audio_stream: Arc<AudioStream>,
    languages: Vec<Language>,
    is_running: Arc<AtomicBool>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    while is_running.load(Ordering::Relaxed) {
        match stream_transcription_deepgram(
            audio_stream.clone(),
            languages.clone(),
            is_running.clone(),
            deepgram_api_key.clone(),
        )
        .await
        {
            Ok(_) => break, // Normal shutdown
            Err(e) => {
                if is_normal_shutdown(&is_running) {
                    break;
                }
                error!("realtime_stt error, restarting: {}", e);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
    Ok(())
}
