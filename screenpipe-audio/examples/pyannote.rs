/*
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/segmentation-3.0.onnx
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/wespeaker_en_voxceleb_CAM++.onnx
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/6_speakers.wav
cargo run --example infinite 6_speakers.wav
*/

use anyhow::{anyhow, Result};
use screenpipe_audio::pyannote::segment::{get_segments, Segment};
use screenpipe_audio::pyannote::{embedding::EmbeddingExtractor, identify::EmbeddingManager};
use screenpipe_audio::resample;
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};

fn process_segment(
    segment: Segment,
    embedding_extractor: &mut EmbeddingExtractor,
    embedding_manager: &mut EmbeddingManager,
    search_threshold: f32,
) -> Result<()> {
    let embedding_result: Vec<f32> = embedding_extractor
        .compute(&segment.samples)
        .unwrap()
        .collect();

    let speaker = embedding_manager
        .search_speaker(embedding_result.clone(), search_threshold)
        .ok_or_else(|| embedding_manager.search_speaker(embedding_result, 0.0)) // Ensure always to return speaker
        .map(|r| r.to_string())
        .unwrap_or("?".into());

    println!(
        "start = {:.2}, end = {:.2}, speaker = {}",
        segment.start, segment.end, speaker
    );

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let project_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    let device = screenpipe_audio::parse_audio_device("MacBook Pro Microphone (input)")
        .map_err(|_| anyhow!("Failed to get default input device"))?;
    let (_, config) = screenpipe_audio::get_device_and_config(&device)
        .await
        .map_err(|_| anyhow!("Failed to get device and config"))?;
    let search_threshold = 0.5;

    let embedding_model_path = project_dir
        .join("models")
        .join("pyannote")
        .join("wespeaker_en_voxceleb_CAM++.onnx");

    let segmentation_model_path = project_dir
        .join("models")
        .join("pyannote")
        .join("segmentation-3.0.onnx");

    println!("Using embedding model: {}", embedding_model_path.display());
    println!(
        "Using segmentation model: {}",
        segmentation_model_path.display()
    );

    let is_running = Arc::new(AtomicBool::new(true));
    let stream = screenpipe_audio::AudioStream::from_device(Arc::new(device), is_running.clone())
        .await
        .map_err(|_| anyhow!("Failed to create audio stream"))?;

    let mut embedding_extractor = EmbeddingExtractor::new(
        embedding_model_path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid embedding model path"))?,
    )?;
    let mut embedding_manager = EmbeddingManager::new(usize::MAX);

    let mut rx = stream.subscribe().await;

    // TODO: process audio stream every ten seconds
    let mut samples = Vec::new();
    let sample_rate = config.sample_rate().0;
    println!("Sample rate: {}", sample_rate);

    while is_running
        .clone()
        .load(std::sync::atomic::Ordering::Relaxed)
    {
        let sample_chunk = rx.recv().await.unwrap();

        samples.extend(sample_chunk);

        if samples.len() >= (sample_rate as usize) * 10 {
            samples = resample(&samples, sample_rate, 16000).map_err(|e| anyhow!(e))?;
            println!("Processing {} samples at {} Hz", samples.len(), 16000);

            let segments = get_segments(
                samples.as_slice(),
                16000,
                &segmentation_model_path,
                &mut embedding_extractor,
                &mut embedding_manager,
            )?;
            let segments_len = segments.len();
            println!("Found {} segments", segments_len);

            for segment in segments {
                process_segment(
                    segment,
                    &mut embedding_extractor,
                    &mut embedding_manager,
                    search_threshold,
                )?;
            }
            samples.clear();
        }
    }

    Ok(())
}
