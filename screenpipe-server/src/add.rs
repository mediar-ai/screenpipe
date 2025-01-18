use anyhow::Result;
use image::DynamicImage;
use regex::Regex;
use screenpipe_vision::utils::{compare_with_previous_image, OcrEngine};

#[cfg(target_os = "macos")]
use screenpipe_vision::perform_ocr_apple;

#[cfg(target_os = "windows")]
use screenpipe_vision::perform_ocr_windows;

use screenpipe_vision::perform_ocr_tesseract;

use serde_json::json;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::mpsc;
use tracing::{debug, error, info};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    cli::CliOcrEngine,
    video_utils::{extract_frames_from_video, get_video_metadata, VideoMetadataOverrides},
    DatabaseManager,
    text_embeds::generate_embedding,
};

pub async fn handle_index_command(
    screenpipe_dir: PathBuf,
    path: String,
    pattern: Option<String>,
    db: Arc<DatabaseManager>,
    output_format: crate::cli::OutputFormat,
    ocr_engine: Option<CliOcrEngine>,
    metadata_override: Option<PathBuf>,
    copy_videos: bool,
    use_embedding: bool,
) -> Result<()> {
    // Load metadata override if provided
    let metadata_overrides = if let Some(path) = metadata_override {
        let content = tokio::fs::read_to_string(path).await?;
        Some(serde_json::from_str::<VideoMetadataOverrides>(&content)?)
    } else {
        None
    };

    // Get list of video files
    let video_files = find_video_files(&path, pattern.as_deref())?;
    info!("found {} video files to process", video_files.len());

    // Validate that we have metadata for all files if overrides are provided
    if let Some(ref overrides) = metadata_overrides {
        let mut unmatched_files = Vec::new();

        for video_path in &video_files {
            let file_str = video_path.to_string_lossy();
            let matched = overrides
                .overrides
                .iter()
                .any(|override_item| override_item.file_path == file_str);

            if !matched {
                unmatched_files.push(video_path.clone());
            }
        }

        if !unmatched_files.is_empty() {
            return Err(anyhow::anyhow!(
                "Missing metadata overrides for files: {:?}",
                unmatched_files
            ));
        }
    }

    let mut total_frames = 0;
    let mut total_text = 0;

    // Setup channel for OCR results
    let (tx, mut rx) = mpsc::channel::<(i64, String, f64)>(100);

    for video_path in video_files {
        info!("processing video: {}", video_path.display());

        let video_path_for_processing = if copy_videos {
            // Generate unique filename using UUID
            let ext = video_path.extension().unwrap_or_default();
            let new_filename = format!("{}.{}", Uuid::new_v4(), ext.to_string_lossy());

            // Construct path in screenpipe data directory
            let target_path = Path::new(&screenpipe_dir).join("data").join(new_filename);

            // Copy the file
            info!("copying video to: {}", target_path.display());
            fs::copy(&video_path, &target_path).await?;

            target_path
        } else {
            video_path.clone()
        };

        let video_path = &video_path_for_processing;
        let mut metadata = get_video_metadata(video_path.to_str().unwrap()).await?;

        // Apply metadata override if provided and matches the file
        if let Some(ref overrides) = metadata_overrides {
            let file_str = video_path.to_string_lossy();

            if let Some(override_item) = overrides
                .overrides
                .iter()
                .find(|item| item.file_path == file_str)
            {
                override_item.metadata.apply_to(&mut metadata);
            }
        }

        let frames = extract_frames_from_video(&video_path, None).await?;

        // Create video chunk and frames first
        db.process_video_frames(
            video_path.to_str().unwrap(),
            frames.clone(),
            metadata.clone(),
        )
        .await?;

        let mut previous_image: Option<DynamicImage> = None;
        let mut frame_counter: i64 = 0;
        let mut ocr_batch = Vec::new();
        let mut embed_batch = Vec::new();

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

            // Use specified OCR engine or fall back to platform default
            let engine = match ocr_engine {
                Some(ref cli_engine) => cli_engine.clone().into(),
                None => {
                    #[cfg(target_os = "macos")]
                    let engine = OcrEngine::AppleNative;
                    #[cfg(target_os = "windows")]
                    let engine = OcrEngine::WindowsNative;
                    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
                    let engine = OcrEngine::Tesseract;
                    engine
                }
            };

            let tx = tx.clone();
            let frame_num = frame_counter;
            let frame = frame.clone();
            let engine_clone = engine.clone();

            let engine_arc = Arc::new(engine_clone);
            tokio::spawn(async move {
                let engine_clone = engine.clone();

                let (text, _, confidence) = match engine_clone.clone() {
                    #[cfg(target_os = "macos")]
                    OcrEngine::AppleNative => perform_ocr_apple(&frame, &[]),
                    #[cfg(target_os = "windows")]
                    OcrEngine::WindowsNative => perform_ocr_windows(&frame).await.unwrap(),
                    _ => {
                        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
                        return perform_ocr_tesseract(&frame, vec![]);

                        panic!("unsupported ocr engine");
                    }
                };

                if let Ok(()) = tx.send((frame_num, text, confidence.unwrap_or(0.0))).await {
                    debug!("processed frame {}", frame_num);
                } else {
                    error!("error sending ocr result for frame {}", frame_num);
                }
            });

            // Handle OCR results
            while let Ok((frame_num, text, confidence)) = rx.try_recv() {
                total_frames += 1;
                total_text += text.len();

                // Only generate embeddings if flag is enabled
                if use_embedding && !text.is_empty() {
                    match generate_embedding(&text, frame_num).await {
                        Ok(emb) => {
                            debug!("generated embedding for frame {}", frame_num);
                            embed_batch.push((
                                frame_num as i64,
                                serde_json::to_string(&emb)?,
                            ));
                        }
                        Err(e) => {
                            error!("failed to generate embedding for frame {}: {}", frame_num, e);
                        }
                    }
                }

                ocr_batch.push((
                    frame_num as i64,
                    text.clone(),
                    "{}".to_string(), // empty json
                    "".to_string(),   // no app name
                    "".to_string(),   // no window name
                    engine_arc.clone(),
                    true, // focused
                ));

                // Process OCR batch when it reaches size 100
                if ocr_batch.len() >= 100 {
                    if let Err(e) = db.batch_insert_ocr(ocr_batch).await {
                        error!("error batch inserting ocr text: {}", e);
                    }
                    ocr_batch = Vec::new();
                }

                // Process embeddings batch when it reaches size 100
                if embed_batch.len() >= 100 {
                    // TODO: We'll implement db.batch_insert_embeddings next
                    if let Err(e) = db.batch_insert_embeddings(embed_batch).await {
                        error!("error batch inserting embeddings: {}", e);
                    }
                    embed_batch = Vec::new();
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
                            debug!("frame {}: {}", frame_num, text);
                        }
                    }
                }
            }

            frame_counter += 1;
        }

        // Process remaining batches
        if !ocr_batch.is_empty() {
            if let Err(e) = db.batch_insert_ocr(ocr_batch).await {
                error!("error batch inserting remaining ocr text: {}", e);
            }
        }

        if !embed_batch.is_empty() {
            if let Err(e) = db.batch_insert_embeddings(embed_batch).await {
                error!("error batch inserting remaining embeddings: {}", e);
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
