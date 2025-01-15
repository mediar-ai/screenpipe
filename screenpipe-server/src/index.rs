use anyhow::Result;
use image::DynamicImage;
use regex::Regex;
use screenpipe_vision::{
    perform_ocr_apple, perform_ocr_tesseract,
    utils::{compare_with_previous_image, OcrEngine},
};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::info;
use walkdir::WalkDir;

use crate::{
    video_utils::{extract_frames_from_video, get_video_metadata},
    DatabaseManager,
};

pub async fn handle_index_command(
    path: String,
    pattern: Option<String>,
    db: Arc<DatabaseManager>,
    output_format: crate::cli::OutputFormat,
) -> Result<()> {
    // Get list of video files
    let video_files = find_video_files(&path, pattern.as_deref())?;
    info!("found {} video files to process", video_files.len());

    let mut total_frames = 0;
    let mut total_text = 0;

    // Setup channel for OCR results
    let (tx, mut rx) = mpsc::channel::<(i64, String, f64)>(100);

    for video_path in video_files {
        info!("processing video: {}", video_path.display());

        let video_path = &video_path;
        let metadata = get_video_metadata(video_path.to_str().unwrap()).await?;
        let frames = extract_frames_from_video(&video_path, None).await?;

        // Create video chunk and frames first
        db.process_video_frames(
            "arbitrary_device_name",
            video_path.to_str().unwrap(),
            frames.clone(),
            metadata.clone(),
        )
        .await?;

        let mut previous_image: Option<DynamicImage> = None;
        let mut frame_counter: i64 = 0;
        let mut ocr_batch = Vec::new();

        for (_, frame) in frames.iter().enumerate() {
            // Compare with previous frame to skip similar ones
            let current_average = if let Some(prev) = &previous_image {
                compare_with_previous_image(
                    Some(prev),
                    &frame,
                    &mut None,
                    frame_counter as u64,
                    &mut 0.0,
                )
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

            // Use platform-specific OCR engine
            #[cfg(target_os = "macos")]
            let engine = OcrEngine::AppleNative;
            #[cfg(target_os = "windows")]
            let engine = OcrEngine::WindowsNative;
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            let engine = OcrEngine::Tesseract;

            let tx = tx.clone();
            let frame_num = frame_counter;
            let frame = frame.clone();
            tokio::spawn(async move {
                let (text, _, confidence) = match engine {
                    #[cfg(target_os = "macos")]
                    OcrEngine::AppleNative => perform_ocr_apple(&frame, &[]),
                    #[cfg(target_os = "windows")]
                    OcrEngine::WindowsNative => perform_ocr_windows(&frame).await?,
                    _ => perform_ocr_tesseract(&frame, vec![]),
                };

                if let Ok(()) = tx.send((frame_num, text, confidence.unwrap_or(0.0))).await {
                    info!("processed frame {}", frame_num);
                } else {
                    info!("error sending ocr result for frame {}", frame_num);
                }
            });

            // Handle OCR results
            while let Ok((frame_num, text, confidence)) = rx.try_recv() {
                total_frames += 1;
                total_text += text.len();

                ocr_batch.push((
                    frame_num as i64,
                    text.clone(),
                    "{}".to_string(), // empty json
                    "".to_string(),   // no app name
                    "".to_string(),   // no window name
                    Arc::new(engine),
                    true, // focused
                ));

                // Process OCR batch when it reaches size 100
                if ocr_batch.len() >= 100 {
                    if let Err(e) = db.batch_insert_ocr(ocr_batch).await {
                        info!("error batch inserting ocr text: {}", e);
                    }
                    ocr_batch = Vec::new();
                }

                match output_format {
                    crate::cli::OutputFormat::Json => {
                        println!(
                            "{}",
                            serde_json::to_string(&json!({
                                "frame": frame_num,
                                "text": text,
                                "confidence": confidence
                            }))?
                        );
                    }
                    crate::cli::OutputFormat::Text => {
                        if !text.is_empty() {
                            info!("frame {}: {}", frame_num, text);
                        }
                    }
                }
            }

            frame_counter += 1;
        }

        // Process remaining OCR batch
        if !ocr_batch.is_empty() {
            if let Err(e) = db.batch_insert_ocr(ocr_batch).await {
                info!("error batch inserting remaining ocr text: {}", e);
            }
        }
    }

    // wait few seconds for remaining OCR tasks
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

    // Process remaining results
    while let Ok((_, text, _)) = rx.try_recv() {
        total_frames += 1;
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
