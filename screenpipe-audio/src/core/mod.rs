pub mod device;
pub mod engine;
pub mod stream;

use crate::transcription::deepgram::streaming::stream_transcription_deepgram;
use crate::AudioInput;
use anyhow::{anyhow, Result};
use lazy_static::lazy_static;
use screenpipe_core::Language;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use stream::AudioStream;
use tracing::{debug, error, info, warn};

lazy_static! {
    pub static ref LAST_AUDIO_CAPTURE: AtomicU64 = AtomicU64::new(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );
}

pub async fn record_and_transcribe(
    audio_stream: Arc<AudioStream>,
    duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    while is_running.load(Ordering::Relaxed) {
        match run_record_and_transcribe(
            audio_stream.clone(),
            duration,
            whisper_sender.clone(),
            is_running.clone(),
        )
        .await
        {
            Ok(_) => {
                // Normal shutdown
                break;
            }
            Err(e) => {
                if !is_running.load(Ordering::Relaxed) {
                    // Normal shutdown
                    break;
                }

                error!("record_and_transcribe error, restarting: {}", e);
                // Add a small delay before restarting to prevent rapid restart loops
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
            Ok(_) => {
                // Normal shutdown
                break;
            }
            Err(e) => {
                if !is_running.load(Ordering::Relaxed) {
                    // Normal shutdown
                    break;
                }

                error!("realtime_stt error, restarting: {}", e);
                // Add a small delay before restarting to prevent rapid restart loops
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
    Ok(())
}

async fn run_record_and_transcribe(
    audio_stream: Arc<AudioStream>,
    duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    let mut receiver = audio_stream.subscribe().await;

    info!(
        "starting continuous recording for {} ({}s segments)",
        audio_stream.device.to_string(),
        duration.as_secs()
    );

    const OVERLAP_SECONDS: usize = 2;
    let mut collected_audio = Vec::new();
    let sample_rate = audio_stream.device_config.sample_rate().0 as usize;
    let overlap_samples = OVERLAP_SECONDS * sample_rate;

    while is_running.load(Ordering::Relaxed) && !audio_stream.is_disconnected() {
        let start_time = tokio::time::Instant::now();

        while start_time.elapsed() < duration && is_running.load(Ordering::Relaxed) {
            match tokio::time::timeout(Duration::from_millis(100), receiver.recv()).await {
                Ok(Ok(chunk)) => {
                    collected_audio.extend(chunk);
                    LAST_AUDIO_CAPTURE.store(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs(),
                        Ordering::Relaxed,
                    );
                }
                Ok(Err(e)) => {
                    error!("error receiving audio data: {}", e);
                    return Err(anyhow!("Audio stream error: {}", e));
                }
                Err(_) => {} // Timeout, continue loop
            }
        }

        if !collected_audio.is_empty() {
            debug!("sending audio segment to audio model");
            match whisper_sender.try_send(AudioInput {
                data: Arc::new(collected_audio.clone()),
                device: audio_stream.device.clone(),
                sample_rate: audio_stream.device_config.sample_rate().0,
                channels: audio_stream.device_config.channels(),
            }) {
                Ok(_) => {
                    debug!("sent audio segment to audio model");
                    if collected_audio.len() > overlap_samples {
                        collected_audio =
                            collected_audio.split_off(collected_audio.len() - overlap_samples);
                    }
                }
                Err(e) => {
                    if e.is_disconnected() {
                        error!("whisper channel disconnected, restarting recording process");
                        return Err(anyhow!("Whisper channel disconnected"));
                    } else if e.is_full() {
                        warn!("whisper channel full, dropping audio segment");
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
            }
        }
    }

    info!("stopped recording for {}", audio_stream.device.to_string());
    Ok(())
}
