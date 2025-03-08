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
    whisper_sender: Arc<crossbeam::channel::Sender<AudioInput>>,
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
    let audio_samples_len = sample_rate * duration.as_secs() as usize;
    let overlap_samples = OVERLAP_SECONDS * sample_rate;
    let max_samples = audio_samples_len + overlap_samples;

    while is_running.load(Ordering::Relaxed)
        && !audio_stream.is_disconnected.load(Ordering::Relaxed)
    {
        while collected_audio.len() < max_samples && is_running.load(Ordering::Relaxed) {
            match receiver.recv().await {
                Ok(chunk) => {
                    collected_audio.extend(chunk);
                    LAST_AUDIO_CAPTURE.store(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs(),
                        Ordering::Relaxed,
                    );
                }
                Err(e) => {
                    error!("error receiving audio data: {}", e);
                    return Err(anyhow!("Audio stream error: {}", e));
                }
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
