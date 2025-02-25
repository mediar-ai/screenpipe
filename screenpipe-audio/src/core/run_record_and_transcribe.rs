use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use anyhow::{anyhow, Result};
use tracing::{debug, error, info, warn};

use crate::{core::LAST_AUDIO_CAPTURE, AudioInput};

use super::AudioStream;

pub async fn run_record_and_transcribe(
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
                    LAST_AUDIO_CAPTURE.store(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs(),
                        Ordering::Relaxed,
                    );

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
