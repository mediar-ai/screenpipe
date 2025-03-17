use crate::VideoCapture;
use anyhow::Result;
use futures::future::join_all;
use screenpipe_core::pii_removal::remove_pii;
use screenpipe_core::Language;
use screenpipe_db::{DatabaseManager, Speaker};
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
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_vision: bool,
) -> Result<()> {
    info!("Starting video recording for monitors {:?}", monitor_ids);
    let video_tasks = if !vision_disabled {
        monitor_ids
            .iter()
            .map(|&monitor_id| {
                let db_manager_video = Arc::clone(&db);
                let output_path_video = Arc::clone(&output_path);
                let ocr_engine = Arc::clone(&ocr_engine);
                let ignored_windows_video = ignored_windows.to_vec();
                let include_windows_video = include_windows.to_vec();

                let languages = languages.clone();

                info!("Starting video recording for monitor {}", monitor_id);
                vision_handle.spawn(async move {
                    // Wrap in a loop with recovery logic
                    loop {
                        info!("Starting/restarting vision capture for monitor {}", monitor_id);
                        match record_video(
                            db_manager_video.clone(),
                            output_path_video.clone(),
                            fps,
                            ocr_engine.clone(),
                            monitor_id,
                            use_pii_removal,
                            &ignored_windows_video,
                            &include_windows_video,
                            video_chunk_duration,
                            languages.clone(),
                            capture_unfocused_windows,
                            realtime_vision,
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
async fn record_video(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    ocr_engine: Arc<OcrEngine>,
    monitor_id: u32,
    use_pii_removal: bool,
    ignored_windows: &[String],
    include_windows: &[String],
    video_chunk_duration: Duration,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_vision: bool,
) -> Result<()> {
    info!("record_video: Starting for monitor {}", monitor_id);
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
        move |file_path: &str| {
            let file_path = file_path.to_string();
            let db = Arc::clone(&db_clone);
            let device_name = Arc::clone(&device_name_clone);

            // Just spawn the task directly
            tokio::spawn(async move {
                debug!("Inserting new video chunk: {}", file_path);
                if let Err(e) = db.insert_video_chunk(&file_path, &device_name).await {
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
        languages,
        capture_unfocused_windows,
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
        if heartbeat_counter % heartbeat_interval == 0 {
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
        if heartbeat_counter % db_health_check_interval == 0 {
            debug!("Checking database health for monitor {}", monitor_id);
            // Just log that we're checking the DB health
            debug!("Database health check periodic reminder");
            // We'll rely on the actual DB operations during normal processing to detect issues
        }

        // In the try-catch block inside the loop, add health checks
        if heartbeat_counter % health_check_interval == 0 {
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
                "record_video: Processing frame {} with {} window results ({}ms since last frame)",
                frames_processed,
                frame.window_ocr_results.len(),
                time_since_last_frame.as_millis()
            );

            for window_result in &frame.window_ocr_results {
                let insert_frame_start = std::time::Instant::now();
                let result = db
                    .insert_frame(
                        &device_name,
                        None,
                        window_result.browser_url.as_deref(),
                        Some(window_result.app_name.as_str()),
                        Some(window_result.window_name.as_str()),
                        window_result.focused,
                    )
                    .await;

                let insert_duration = insert_frame_start.elapsed();
                if insert_duration.as_millis() > 100 {
                    warn!(
                        "Slow DB insert_frame operation: {}ms",
                        insert_duration.as_millis()
                    );
                }

                match result {
                    Ok(frame_id) => {
                        debug!(
                            "Successfully inserted frame {} in {}ms",
                            frame_id,
                            insert_duration.as_millis()
                        );
                        let text_json =
                            serde_json::to_string(&window_result.text_json).unwrap_or_default();

                        let text = if use_pii_removal {
                            &remove_pii(&window_result.text)
                        } else {
                            &window_result.text
                        };

                        if realtime_vision {
                            let send_event_start = std::time::Instant::now();
                            match send_event(
                                "ocr_result",
                                WindowOcr {
                                    image: Some(frame.image.clone()),
                                    text: text.clone(),
                                    text_json: window_result.text_json.clone(),
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
                                            "Slow event sending: {}ms",
                                            event_duration.as_millis()
                                        );
                                    }
                                }
                                Err(e) => error!("Failed to send OCR event: {}", e),
                            }
                        }

                        let insert_ocr_start = std::time::Instant::now();
                        if let Err(e) = db
                            .insert_ocr_text(
                                frame_id,
                                text,
                                &text_json,
                                Arc::new((*ocr_engine).clone().into()),
                            )
                            .await
                        {
                            error!(
                                "Failed to insert OCR text: {}, skipping window {} of frame {}",
                                e, window_result.window_name, frame_id
                            );
                            consecutive_db_errors += 1;
                            continue;
                        } else {
                            let ocr_insert_duration = insert_ocr_start.elapsed();
                            if ocr_insert_duration.as_millis() > 100 {
                                warn!(
                                    "Slow DB insert_ocr_text operation: {}ms",
                                    ocr_insert_duration.as_millis()
                                );
                            }
                            consecutive_db_errors = 0; // Reset on success
                            debug!(
                                "OCR text inserted for frame {} in {}ms",
                                frame_id,
                                ocr_insert_duration.as_millis()
                            );
                        }
                    }
                    Err(e) => {
                        warn!("Failed to insert frame: {}", e);
                        consecutive_db_errors += 1;
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        continue;
                    }
                }
            }
        } else {
            // Log when frame queue is empty
            if heartbeat_counter % 10 == 0 {
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
