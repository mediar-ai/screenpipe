use anyhow::Result;
use futures::StreamExt;
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
use tracing::{debug, info};
use walkdir::WalkDir;

use crate::{video_utils::extract_frames_from_video, DatabaseManager};

pub async fn handle_index_command(
    path: String,
    pattern: Option<String>,
    db: DatabaseManager,
    output_format: crate::cli::OutputFormat,
) -> Result<()> {
    // Get list of video files
    let video_files = find_video_files(&path, pattern.as_deref())?;
    info!("found {} video files to process", video_files.len());

    let mut total_frames = 0;
    let mut total_text = 0;

    // Setup channel for OCR results
    let (tx, mut rx) = mpsc::channel::<(u64, String, f64)>(32);

    for video_path in video_files {
        info!("processing video: {}", video_path.display());

        let mut frames = extract_frames_from_video(&video_path).await?;
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

            // Use platform-specific OCR engine
            #[cfg(target_os = "macos")]
            let engine = OcrEngine::AppleNative;
            #[cfg(target_os = "windows")]
            let engine = OcrEngine::WindowsNative;
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            let engine = OcrEngine::Tesseract;

            let tx = tx.clone();
            tokio::spawn(async move {
                let (text, _, confidence) = match engine {
                    #[cfg(target_os = "macos")]
                    OcrEngine::AppleNative => perform_ocr_apple(&frame, &[]),
                    #[cfg(target_os = "windows")]
                    OcrEngine::WindowsNative => perform_ocr_windows(&frame).await?,
                    _ => perform_ocr_tesseract(&frame, vec![]),
                };

                if let Ok(()) = tx
                    .send((frame_counter, text, confidence.unwrap_or(0.0)))
                    .await
                {
                    debug!("processed frame {}", frame_counter);
                } else {
                    info!("error sending ocr result for frame {}", frame_counter);
                }
            });

            // Handle OCR results
            while let Ok((frame_num, text, confidence)) = rx.try_recv() {
                total_frames += 1;
                total_text += text.len();

                if let Err(e) = db
                    .insert_ocr_text(
                        frame_num as i64,
                        &text,
                        "{}", // empty json since we don't have window-specific data
                        "",   // no app name
                        "",   // no window name
                        Arc::new(engine),
                        true, // always focused since we're processing full screen
                    )
                    .await
                {
                    info!("error inserting ocr text: {}", e);
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
        break;
    }

    // wait few seconds
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

    // Process remaining results at the end
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
