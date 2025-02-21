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
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use stream::AudioStream;
use tracing::{debug, error, info, warn};

lazy_static! {
    pub static ref LAST_AUDIO_CAPTURE: AtomicU64 = AtomicU64::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );
}

fn is_normal_shutdown(is_running: &Arc<AtomicBool>) -> bool {
    !is_running.load(Ordering::Relaxed)
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
            Ok(_) => break, // Normal shutdown
            Err(e) => {
                if is_normal_shutdown(&is_running) {
                    break;
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

async fn run_record_and_transcribe(
    audio_stream: Arc<AudioStream>,
    duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    let mut receiver = audio_stream.subscribe().await;
    const OVERLAP_SECONDS: usize = 2;
    let sample_rate = audio_stream.device_config.sample_rate().0 as usize;
    let overlap_samples = OVERLAP_SECONDS * sample_rate;

    info!(
        "starting continuous recording for {} ({}s segments)",
        audio_stream.device.to_string(),
        duration.as_secs()
    );

    let mut collected_audio = Vec::new();
    while is_running.load(Ordering::Relaxed) && !audio_stream.is_disconnected() {
        if !collect_audio_segment(&mut receiver, &mut collected_audio, duration, &is_running)
            .await?
        {
            continue;
        }

        if !collected_audio.is_empty() {
            process_audio_segment(
                &mut collected_audio,
                &whisper_sender,
                &audio_stream,
                overlap_samples,
            )
            .await?;
        }
    }

    info!("stopped recording for {}", audio_stream.device.to_string());
    Ok(())
}

async fn collect_audio_segment(
    receiver: &mut tokio::sync::broadcast::Receiver<Vec<f32>>,
    collected_audio: &mut Vec<f32>,
    duration: Duration,
    is_running: &Arc<AtomicBool>,
) -> Result<bool> {
    let start_time = tokio::time::Instant::now();
    while start_time.elapsed() < duration && is_running.load(Ordering::Relaxed) {
        match tokio::time::timeout(Duration::from_millis(100), receiver.recv()).await {
            Ok(Ok(chunk)) => {
                collected_audio.extend(chunk);
                LAST_AUDIO_CAPTURE.store(
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
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
    Ok(true)
}

async fn process_audio_segment(
    collected_audio: &mut Vec<f32>,
    whisper_sender: &crossbeam::channel::Sender<AudioInput>,
    audio_stream: &AudioStream,
    overlap_samples: usize,
) -> Result<()> {
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
                *collected_audio =
                    collected_audio.split_off(collected_audio.len() - overlap_samples);
            }
            Ok(())
        }
        Err(e) => {
            if e.is_disconnected() {
                error!("whisper channel disconnected, restarting recording process");
                Err(anyhow!("Whisper channel disconnected"))
            } else if e.is_full() {
                warn!("whisper channel full, dropping audio segment");
                tokio::time::sleep(Duration::from_millis(100)).await;
                Ok(())
            } else {
                Ok(())
            }
        }
    }
}
