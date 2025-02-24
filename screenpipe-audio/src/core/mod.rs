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

    info!(
        "starting continuous recording for {} ({}s segments)",
        audio_stream.device.to_string(),
        duration.as_secs()
    );

    const OVERLAP_SECONDS: usize = 2;
    let overlap_samples = OVERLAP_SECONDS * 16000;
    let duration_samples = (duration.as_secs_f64() * 16000.0).ceil() as usize;
    let max_samples = duration_samples + overlap_samples;

    // Pre-allocate buffer with exact capacity
    let mut collected_audio = Vec::with_capacity(max_samples);
    let mut overlap_buffer = Vec::with_capacity(overlap_samples);

    while is_running.load(Ordering::Relaxed)
        && !audio_stream.is_disconnected.load(Ordering::Relaxed)
    {
        // Collect until we have enough samples for a full segment
        while collected_audio.len() < duration_samples && is_running.load(Ordering::Relaxed) {
            match tokio::time::timeout(Duration::from_millis(100), receiver.recv()).await {
                Ok(Ok(chunk)) => {
                    // Maintain fixed memory usage
                    let available_space = max_samples - collected_audio.len();
                    let take = chunk.len().min(available_space);

                    // Make space if needed by draining oldest samples
                    if collected_audio.len() + take > max_samples {
                        let drain_amount = collected_audio.len() + take - max_samples;
                        collected_audio.drain(0..drain_amount);
                    }

                    collected_audio.extend_from_slice(&chunk[..take]);
                }
                Ok(Err(e)) => {
                    error!("error receiving audio data: {}", e);
                    return Err(anyhow!("Audio stream error: {}", e));
                }
                Err(_) => {} // Timeout, continue loop
            }
        }

        // Only send if we have enough samples (account for possible early exit)
        if collected_audio.len() >= duration_samples {
            // Split into main segment and overlap
            let mut audio_segment = overlap_buffer.to_vec();
            audio_segment.extend_from_slice(&collected_audio);
            // Preserve overlap for next iteration
            let overlap_start = duration_samples.saturating_sub(overlap_samples);
            overlap_buffer.clear();
            let overlap_end = duration_samples.saturating_sub(overlap_buffer.len());
            overlap_buffer.extend_from_slice(&collected_audio[overlap_start..overlap_end]);

            // Reset buffer with overlap
            collected_audio.clear();
            // collected_audio.extend_from_slice(&overlap_buffer);

            // Send the segment
            debug!("sending audio segment to audio model");
            match whisper_sender.try_send(AudioInput {
                data: Arc::new(audio_segment),
                device: audio_stream.device.clone(),
                sample_rate: audio_stream.device_config.sample_rate().0,
                channels: 1,
            }) {
                Ok(_) => {
                    debug!("sent audio segment to audio model");
                    // Overlap already preserved in buffer
                }
                Err(e) => {
                    // Reset buffers on error
                    collected_audio.clear();
                    overlap_buffer.clear();
                    if e.is_disconnected() {
                        error!("whisper channel disconnected, restarting recording process");
                        return Err(anyhow!("Whisper channel disconnected"));
                    } else if e.is_full() {
                        warn!("whisper channel full, dropping audio segment");
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    } else {
                        error!("whisper channel error, restarting recording process: {}", e);
                        return Err(anyhow!("Whisper channel error"));
                    }
                }
            }
        }
    }

    info!("stopped recording for {}", audio_stream.device.to_string());
    Ok(())
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
