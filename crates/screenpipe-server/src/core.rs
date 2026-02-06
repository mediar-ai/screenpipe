use crate::VideoCapture;
use anyhow::Result;
use futures::future::join_all;
use screenpipe_core::pii_removal::{remove_pii, remove_pii_from_text_json};
use screenpipe_core::Language;
use screenpipe_db::{DatabaseManager, FrameWindowData, Speaker};
use screenpipe_events::{poll_meetings_events, send_event};
use screenpipe_vision::core::WindowOcr;
use screenpipe_vision::OcrEngine;
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tracing::{debug, error, info, warn};

#[allow(clippy::too_many_arguments)]
pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    video_chunk_duration: Duration,
    ocr_engine: Arc<OcrEngine>,
    monitor_ids: Vec<u32>,
    use_pii_removal: bool,
    vision_disabled: bool,
    vision_handle: &Handle,
    ignored_windows: &[String],
    include_windows: &[String],
    ignored_urls: &[String],
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_vision: bool,
    activity_feed: screenpipe_vision::ActivityFeedOption,
    video_quality: String,
) -> Result<()> {
    debug!("Starting video recording for monitors {:?}", monitor_ids);
    let video_tasks = if !vision_disabled {
        monitor_ids
            .iter()
            .map(|&monitor_id| {
                let db_manager_video = Arc::clone(&db);
                let output_path_video = Arc::clone(&output_path);
                let ocr_engine = Arc::clone(&ocr_engine);
                let ignored_windows_video = ignored_windows.to_vec();
                let include_windows_video = include_windows.to_vec();
                let ignored_urls_video = ignored_urls.to_vec();

                let languages = languages.clone();
                let activity_feed = activity_feed.clone();
                let video_quality = video_quality.clone();

                debug!("Starting video recording for monitor {}", monitor_id);
                vision_handle.spawn(async move {
                    // Wrap in a loop with recovery logic
                    loop {
                        debug!("Starting/restarting vision capture for monitor {}", monitor_id);
                        match record_video(
                            db_manager_video.clone(),
                            output_path_video.clone(),
                            fps,
                            ocr_engine.clone(),
                            monitor_id,
                            use_pii_removal,
                            &ignored_windows_video,
                            &include_windows_video,
                            &ignored_urls_video,
                            video_chunk_duration,
                            languages.clone(),
                            capture_unfocused_windows,
                            realtime_vision,
                            activity_feed.clone(),
                            video_quality.clone(),
                        )
                        .await
                        {
                            Ok(_) => {
                                warn!("record_video for monitor {} completed unexpectedly but without error", monitor_id);
                                // Short delay before restarting to prevent CPU spinning
                                tokio::time::sleep(Duration::from_secs(5)).await;
                            }
                            Err(e) => {
                                error!("record_video for monitor {} failed with error: {}", monitor_id, e);
                                // Short delay before restarting to prevent CPU spinning
                                tokio::time::sleep(Duration::from_secs(5)).await;
                            }
                        }
                    }
                })
            })
            .collect::<Vec<_>>()
    } else {
        vec![vision_handle.spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            Ok::<(), anyhow::Error>(())
        })]
    };

    if !vision_disabled {
        vision_handle.spawn(async move {
            info!("Starting meeting events polling");
            match poll_meetings_events().await {
                Ok(_) => warn!("Meeting events polling completed unexpectedly"),
                Err(e) => error!("Meeting events polling failed: {}", e),
            }
        });
    }

    // Join all video tasks
    let video_results = join_all(video_tasks);

    // Handle any errors from the tasks
    for (i, result) in video_results.await.into_iter().enumerate() {
        if let Err(e) = result {
            if !e.is_cancelled() {
                error!("Video recording error for monitor {}: {:?}", i, e);
            }
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn record_video(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    ocr_engine: Arc<OcrEngine>,
    monitor_id: u32,
    use_pii_removal: bool,
    ignored_windows: &[String],
    include_windows: &[String],
    ignored_urls: &[String],
    video_chunk_duration: Duration,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_vision: bool,
    activity_feed: screenpipe_vision::ActivityFeedOption,
    video_quality: String,
) -> Result<()> {
    debug!("record_video: Starting for monitor {}", monitor_id);
    let device_name = Arc::new(format!("monitor_{}", monitor_id));

    // Add heartbeat counter
    let mut heartbeat_counter: u64 = 0;
    let heartbeat_interval = 100; // Log every 100 iterations
    let db_health_check_interval = 1000; // Check DB health every 1000 iterations
    let start_time = std::time::Instant::now();

    // Add health check interval
    let health_check_interval = 500; // Check task health every 500 iterations

    // Define a simpler callback that just returns the file path
    let new_chunk_callback = {
        let db_clone = Arc::clone(&db);
        let device_name_clone = Arc::clone(&device_name);
        move |file_path: &str, chunk_fps: f64| {
            let file_path = file_path.to_string();
            let db = Arc::clone(&db_clone);
            let device_name = Arc::clone(&device_name_clone);

            // Just spawn the task directly
            tokio::spawn(async move {
                debug!("Inserting new video chunk: {} (fps={})", file_path, chunk_fps);
                if let Err(e) = db.insert_video_chunk_with_fps(&file_path, &device_name, chunk_fps).await {
                    error!("Failed to insert new video chunk: {}", e);
                } else {
                    debug!("Successfully inserted video chunk: {}", file_path);
                }
            });
        }
    };

    info!("Creating VideoCapture for monitor {}", monitor_id);
    let video_capture = VideoCapture::new(
        &output_path,
        fps,
        video_chunk_duration,
        new_chunk_callback,
        Arc::clone(&ocr_engine),
        monitor_id,
        ignored_windows,
        include_windows,
        ignored_urls,
        languages,
        capture_unfocused_windows,
        activity_feed,
        video_quality,
    );

    info!(
        "Starting main video processing loop for monitor {}",
        monitor_id
    );
    let mut last_frame_time = std::time::Instant::now();
    let mut frames_processed = 0;

    // Keep count of consecutive errors to detect unhealthy state
    let mut consecutive_db_errors = 0;
    const MAX_CONSECUTIVE_DB_ERRORS: u32 = 100; // Threshold before reporting unhealthy state

    loop {
        // Increment and check heartbeat
        heartbeat_counter += 1;
        if heartbeat_counter.is_multiple_of(heartbeat_interval) {
            let uptime = start_time.elapsed().as_secs();
            let frames_per_sec = if uptime > 0 {
                frames_processed as f64 / uptime as f64
            } else {
                0.0
            };
            info!(
                    "record_video: Heartbeat for monitor {} - iteration {}, uptime: {}s, frames processed: {}, frames/sec: {:.2}",
                    monitor_id, heartbeat_counter, uptime, frames_processed, frames_per_sec
                );
        }

        // Periodically check database health
        if heartbeat_counter.is_multiple_of(db_health_check_interval) {
            debug!("Checking database health for monitor {}", monitor_id);
            // Just log that we're checking the DB health
            debug!("Database health check periodic reminder");
            // We'll rely on the actual DB operations during normal processing to detect issues
        }

        // In the try-catch block inside the loop, add health checks
        if heartbeat_counter.is_multiple_of(health_check_interval) {
            debug!(
                "Checking VideoCapture task health for monitor {}",
                monitor_id
            );
            if !video_capture.check_health() {
                error!(
                    "One or more VideoCapture tasks have terminated for monitor {}",
                    monitor_id
                );
                // Instead of immediately failing, log the error and continue
                // This helps us diagnose which task is failing
            }
        }

        if let Some(frame) = video_capture.ocr_frame_queue.pop() {
            let time_since_last_frame = last_frame_time.elapsed();
            last_frame_time = std::time::Instant::now();
            frames_processed += 1;

            debug!(
                "record_video: Processing frame {} (frame_number={}) with {} window results ({}ms since last frame)",
                frames_processed,
                frame.frame_number,
                frame.window_ocr_results.len(),
                time_since_last_frame.as_millis()
            );

            // Check if this frame was actually written to video
            // If not, skip DB insertion to prevent offset mismatch
            let frame_write_info = video_capture
                .frame_write_tracker
                .get_offset(frame.frame_number);
            let video_frame_offset = match frame_write_info {
                Some(info) => info.offset as i64,
                None => {
                    // Frame wasn't written to video (likely dropped from video queue)
                    // Wait a bit and retry - the video encoder might not have processed it yet
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    match video_capture
                        .frame_write_tracker
                        .get_offset(frame.frame_number)
                    {
                        Some(info) => info.offset as i64,
                        None => {
                            debug!(
                                "Skipping frame {} - not found in video write tracker (was dropped)",
                                frame.frame_number
                            );
                            continue;
                        }
                    }
                }
            };

            // Prepare batch data: apply PII removal and collect window data
            let mut batch_windows = Vec::with_capacity(frame.window_ocr_results.len());
            let mut window_metadata = Vec::with_capacity(frame.window_ocr_results.len());

            for window_result in &frame.window_ocr_results {
                let (text, sanitized_text_json) = if use_pii_removal {
                    let sanitized_text = remove_pii(&window_result.text);
                    let sanitized_json = remove_pii_from_text_json(&window_result.text_json);
                    (sanitized_text, sanitized_json)
                } else {
                    (window_result.text.clone(), window_result.text_json.clone())
                };
                let text_json = serde_json::to_string(&sanitized_text_json).unwrap_or_default();

                batch_windows.push(FrameWindowData {
                    app_name: Some(window_result.app_name.clone()),
                    window_name: Some(window_result.window_name.clone()),
                    browser_url: window_result.browser_url.clone(),
                    focused: window_result.focused,
                    text: text.clone(),
                    text_json: text_json.clone(),
                });

                // Store metadata for realtime events (sent after DB insert)
                window_metadata.push((text, sanitized_text_json, text_json, window_result));
            }

            // Batch insert all frames + OCR in a single transaction
            let batch_start = std::time::Instant::now();
            match db
                .insert_frames_with_ocr_batch(
                    &device_name,
                    Some(frame.captured_at),
                    video_frame_offset,
                    &batch_windows,
                    Arc::new((*ocr_engine).clone().into()),
                )
                .await
            {
                Ok(results) => {
                    let batch_duration = batch_start.elapsed();
                    if batch_duration.as_millis() > 200 {
                        warn!(
                            "Slow DB batch insert: {}ms for {} windows",
                            batch_duration.as_millis(),
                            results.len()
                        );
                    }
                    debug!(
                        "Batch inserted {} frames in {}ms",
                        results.len(),
                        batch_duration.as_millis()
                    );
                    consecutive_db_errors = 0;

                    // Send realtime events after successful DB insert
                    if realtime_vision {
                        for (frame_id, idx) in &results {
                            let (ref text, ref sanitized_text_json, _, window_result) =
                                window_metadata[*idx];
                            let send_event_start = std::time::Instant::now();
                            match send_event(
                                "ocr_result",
                                WindowOcr {
                                    image: Some(frame.image.clone()),
                                    text: text.clone(),
                                    text_json: sanitized_text_json.clone(),
                                    app_name: window_result.app_name.clone(),
                                    window_name: window_result.window_name.clone(),
                                    focused: window_result.focused,
                                    confidence: window_result.confidence,
                                    timestamp: frame.timestamp,
                                    browser_url: window_result.browser_url.clone(),
                                },
                            ) {
                                Ok(_) => {
                                    let event_duration = send_event_start.elapsed();
                                    if event_duration.as_millis() > 100 {
                                        warn!(
                                            "Slow event sending: {}ms for frame {}",
                                            event_duration.as_millis(),
                                            frame_id
                                        );
                                    }
                                }
                                Err(e) => error!("Failed to send OCR event: {}", e),
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to batch insert frames: {}", e);
                    consecutive_db_errors += 1;
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        } else {
            // Log when frame queue is empty
            if heartbeat_counter.is_multiple_of(10) {
                debug!(
                    "record_video: No frames in queue for monitor {}",
                    monitor_id
                );
            }
        }

        // Check if we're seeing too many consecutive DB errors
        if consecutive_db_errors > MAX_CONSECUTIVE_DB_ERRORS {
            error!(
                "Excessive consecutive database errors ({}), vision processing may be impaired",
                consecutive_db_errors
            );
            // Instead of failing, we'll continue but log the issue clearly
            consecutive_db_errors = 0; // Reset to prevent continuous error logging
        }

        // Sleep for the frame interval
        tokio::time::sleep(Duration::from_secs_f64(1.0 / fps)).await;
    }
}

pub async fn merge_speakers(
    db: &DatabaseManager,
    speaker_to_keep_id: i64,
    speaker_to_merge_id: i64,
) -> Result<Speaker, anyhow::Error> {
    // make sure both speakers exist
    let _ = db.get_speaker_by_id(speaker_to_keep_id).await?;
    let _ = db.get_speaker_by_id(speaker_to_merge_id).await?;

    // call merge method from db
    match db
        .merge_speakers(speaker_to_keep_id, speaker_to_merge_id)
        .await
    {
        Ok(speaker) => Ok(speaker),
        Err(e) => Err(anyhow::anyhow!("Failed to merge speakers: {}", e)),
    }
}
