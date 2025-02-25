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

    let sample_rate = audio_stream.device_config.sample_rate().0 as usize;
    const OVERLAP_SECONDS: usize = 2;
    let overlap_len = OVERLAP_SECONDS * sample_rate;
    let duration_len = (duration.as_secs_f64() * sample_rate as f64).ceil() as usize;
    let max_len = duration_len + overlap_len;
    let mut first = true;

    // Pre-allocate fixed-size buffer with exact capacity
    let mut collected_audio = vec![0.0; max_len]; // Fixed size, never resized
    let mut overflow_buffer = vec![0.0; duration_len]; // LOL
    let mut current_samples_len = overlap_len;
    let mut current_overlap_len = 0;

    while is_running.load(Ordering::Relaxed)
        && !audio_stream.is_disconnected.load(Ordering::Relaxed)
    {
        // Collect audio for the duration period
        while current_samples_len < max_len && is_running.load(Ordering::Relaxed) {
            match receiver.recv().await {
                Ok(chunk) => {
                    let chunk_len = chunk.len();
                    let available_space = duration_len
                        .saturating_sub(current_samples_len)
                        .saturating_sub(overlap_len);

                    // Ensure we do not exceed the buffer size
                    if available_space < chunk_len {
                        if available_space > 0 {
                            collected_audio
                                [current_samples_len..current_samples_len + available_space]
                                .copy_from_slice(&chunk[..available_space]);
                        }

                        let overflow_len = chunk_len - available_space;
                        if overflow_len > 0 {
                            let len_to_copy = overflow_len.min(overflow_buffer.len());
                            overflow_buffer[..len_to_copy].copy_from_slice(
                                &chunk[available_space..available_space + len_to_copy],
                            );
                            current_overlap_len += len_to_copy;
                        }
                    } else {
                        collected_audio[current_samples_len..current_samples_len + chunk_len]
                            .copy_from_slice(&chunk);
                    }

                    current_samples_len += chunk_len;
                }
                Err(e) => {
                    error!("error receiving audio data: {}", e);
                    return Err(anyhow!("Audio stream error: {}", e));
                }
            }
        }

        let mut segment = {
            let mut segment = collected_audio.to_vec();
            segment.extend_from_slice(&overflow_buffer);
            segment
        };

        debug!("sending audio segment to audio model");
        match whisper_sender.try_send(AudioInput {
            data: Arc::new(segment.clone()),
            device: audio_stream.device.clone(),
            sample_rate: audio_stream.device_config.sample_rate().0,
            channels: 1,
        }) {
            Ok(_) => {
                debug!("sent audio segment to audio model");
                // Maintain overlap by keeping last overlap_samples
                let segment_start = current_overlap_len + overlap_len;
                let segment_len = segment.len();
                let collected_audio_start = if first { overlap_len } else { 0 };
                collected_audio[collected_audio_start..collected_audio_start + overlap_len]
                    .swap_with_slice(
                        &mut segment[segment_start..segment_len.min(segment_start + overlap_len)],
                    );
            }
            Err(e) => {
                // Maintain buffer size even when send fails
                collected_audio.resize(max_len, 0.0);
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

        // this is the duration length at this point. not including overlap
        current_samples_len = overlap_len;
        overflow_buffer.clear();
        first = false;
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
