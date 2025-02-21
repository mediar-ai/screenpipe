use crate::audio_processing::{average_noise_spectrum, spectral_subtraction};
use crate::{
    audio_processing::normalize_v2,
    pyannote::{
        embedding::EmbeddingExtractor,
        identify::EmbeddingManager,
        segment::{get_segments, SpeechSegment},
    },
    vad_engine::VadEngine,
};
use anyhow::Result;
use log::{error, info};
use std::{path::PathBuf, sync::Arc, sync::Mutex as StdMutex};
use tokio::sync::Mutex;
use vad_rs::VadStatus;

pub async fn prepare_segments(
    audio_data: &[f32],
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    segmentation_model_path: &PathBuf,
    embedding_manager: EmbeddingManager,
    embedding_extractor: Arc<StdMutex<EmbeddingExtractor>>,
    device: &str,
) -> Result<(tokio::sync::mpsc::Receiver<SpeechSegment>, bool)> {
    let audio_data = normalize_v2(audio_data);

    let frame_size = 1600;
    let vad_engine = vad_engine.clone();

    let mut noise = 0.;
    let mut audio_frames = Vec::new();
    let mut total_frames = 0;
    let mut speech_frame_count = 0;

    for chunk in audio_data.chunks(frame_size) {
        total_frames += 1;

        let mut new_chunk = chunk.to_vec();
        let status = vad_engine.lock().await.audio_type(chunk);
        match status {
            Ok(VadStatus::Speech) => {
                if let Ok(processed_audio) = spectral_subtraction(chunk, noise) {
                    new_chunk = processed_audio;
                    speech_frame_count += 1;
                }
            }
            Ok(VadStatus::Unknown) => {
                noise = average_noise_spectrum(chunk);
            }
            _ => {}
        }
        audio_frames.extend(new_chunk);
    }

    let speech_ratio = speech_frame_count as f32 / total_frames as f32;
    let min_speech_ratio = vad_engine.lock().await.get_min_speech_ratio();

    info!(
        "device: {}, speech ratio: {}, min_speech_ratio: {}, audio_frames: {}, speech_frames: {}",
        device,
        speech_ratio,
        min_speech_ratio,
        audio_frames.len(),
        speech_frame_count
    );
    let (tx, rx) = tokio::sync::mpsc::channel(100);
    let speech_ratio_ok = speech_ratio >= min_speech_ratio;
    if !audio_frames.is_empty() && speech_ratio_ok {
        let segments = get_segments(
            &audio_data,
            16000,
            segmentation_model_path,
            embedding_extractor,
            embedding_manager,
        )?;

        for segment in segments.flatten() {
            if let Err(e) = tx.send(segment).await {
                error!("failed to send segment: {:?}", e);
                break;
            }
        }
    }

    Ok((rx, speech_ratio_ok))
}
