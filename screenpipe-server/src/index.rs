use anyhow::Result;
use futures::StreamExt;
use image::DynamicImage;
use regex::Regex;
use screenpipe_vision::{
    core::{process_ocr_task, OcrTaskData},
    utils::{compare_with_previous_image, OcrEngine},
};
use serde_json::json;
use std::{path::PathBuf, time::Instant};
use tokio::sync::mpsc;
use tracing::info;
use walkdir::WalkDir;

use crate::video_utils::extract_frames_from_video;

pub struct IndexOptions {
    pub path: String,
    pub fps: f64,
}

pub async fn handle_index_command(
    path: String,
    fps: f64,
    pattern: Option<String>,
    output_format: crate::cli::OutputFormat,
) -> Result<()> {
    let options = IndexOptions { path, fps };

    // Get list of video files
    let video_files = find_video_files(&options.path, pattern.as_deref())?;
    info!("found {} video files to process", video_files.len());

    let mut total_frames = 0;
    let mut total_text = 0;

    // Setup channel for OCR results
    let (tx, mut rx) = mpsc::channel(32);

    for video_path in video_files {
        info!("processing video: {}", video_path.display());

        let mut frames = extract_frames_from_video(&video_path, options.fps).await?;
        let mut previous_image: Option<DynamicImage> = None;
        let mut frame_counter: u64 = 0;

        while let Some(frame) = frames.next().await {
            let frame = frame?;

            // Compare with previous frame to skip similar ones
            let current_average = if let Some(prev) = &previous_image {
                compare_with_previous_image(Some(prev), &frame, &mut None, frame_counter, &mut 0.0)
                    .await?
            } else {
                1.0
            };

            // Skip if frames are too similar (threshold from core.rs)
            if current_average < 0.006 && previous_image.is_some() {
                info!(
                    "skipping frame {} due to low average difference: {:.3}",
                    frame_counter, current_average
                );
                frame_counter += 1;
                continue;
            }

            previous_image = Some(frame.clone());

            // Create OCR task
            let ocr_task = OcrTaskData {
                image: frame.clone(),
                window_images: vec![], // Empty for video files
                frame_number: frame_counter,
                timestamp: Instant::now(),
                result_tx: tx.clone(),
            };

            // Use platform-specific OCR engine
            #[cfg(target_os = "macos")]
            let engine = OcrEngine::AppleNative;
            #[cfg(target_os = "windows")]
            let engine = OcrEngine::WindowsNative;
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            let engine = OcrEngine::Tesseract;

            // Process OCR in background
            tokio::spawn(async move {
                if let Err(e) = process_ocr_task(ocr_task, &engine, vec![]).await {
                    info!("error processing frame {}: {}", frame_counter, e);
                }
            });

            // Handle OCR results
            while let Ok(result) = rx.try_recv() {
                total_frames += 1;

                // Aggregate text from all windows
                let text = result
                    .window_ocr_results
                    .iter()
                    .map(|w| w.text.clone())
                    .collect::<Vec<_>>()
                    .join(" ");

                total_text += text.len();

                match output_format {
                    crate::cli::OutputFormat::Json => {
                        println!(
                            "{}",
                            serde_json::to_string(&json!({
                                "frame": result.frame_number,
                                "timestamp": result.timestamp.elapsed().as_secs_f64(),
                                "text": text,
                                "confidence": result.window_ocr_results.iter()
                                    .map(|w| w.confidence)
                                    .sum::<f64>() / result.window_ocr_results.len() as f64
                            }))?
                        );
                    }
                    crate::cli::OutputFormat::Text => {
                        if !text.is_empty() {
                            println!("frame {}: {}", result.frame_number, text);
                        }
                    }
                }
            }

            frame_counter += 1;
        }
    }

    // Process remaining results
    while let Ok(result) = rx.try_recv() {
        total_frames += 1;
        let text = result
            .window_ocr_results
            .iter()
            .map(|w| w.text.clone())
            .collect::<Vec<_>>()
            .join(" ");
        total_text += text.len();
    }

    info!(
        "processed {} frames, extracted {} characters of text",
        total_frames, total_text
    );

    Ok(())
}

fn find_video_files(root: &str, pattern: Option<&str>) -> Result<Vec<PathBuf>> {
    let mut video_files = Vec::new();
    let regex = pattern.map(|p| Regex::new(p)).transpose()?;

    for entry in WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "mp4" || ext == "mov" || ext == "avi" {
                    if let Some(ref regex) = regex {
                        if regex.is_match(&path.to_string_lossy()) {
                            video_files.push(path.to_path_buf());
                        }
                    } else {
                        video_files.push(path.to_path_buf());
                    }
                }
            }
        }
    }

    Ok(video_files)
}
