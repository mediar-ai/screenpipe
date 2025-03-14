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
use tracing::{debug, error, warn};

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
    debug!("Starting video recording for monitor {:?}", monitor_ids);
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

                debug!("Starting video recording for monitor {}", monitor_id);
                vision_handle.spawn(async move {
                    record_video(
                        db_manager_video,
                        output_path_video,
                        fps,
                        ocr_engine,
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
                })
            })
            .collect::<Vec<_>>()
    } else {
        vec![vision_handle.spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            Ok(())
        })]
    };

    if !vision_disabled {
        vision_handle.spawn(async move {
            let _ = poll_meetings_events().await;
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
    debug!("record_video: Starting for monitor {}", monitor_id);
    let db_chunk_callback = Arc::clone(&db);
    let rt = Handle::current();
    let device_name = Arc::new(format!("monitor_{}", monitor_id));

    // Add heartbeat counter
    let mut heartbeat_counter: u64 = 0;
    let heartbeat_interval = 100; // Log every 100 iterations

    let new_chunk_callback = {
        let db_chunk_callback = Arc::clone(&db_chunk_callback);
        let device_name = Arc::clone(&device_name);
        move |file_path: &str| {
            let file_path = file_path.to_string();
            let db_chunk_callback = Arc::clone(&db_chunk_callback);
            let device_name = Arc::clone(&device_name);
            rt.spawn(async move {
                if let Err(e) = db_chunk_callback
                    .insert_video_chunk(&file_path, &device_name)
                    .await
                {
                    error!("Failed to insert new video chunk: {}", e);
                }
                debug!("record_video: Inserted new video chunk: {}", file_path);
            });
        }
    };

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

    loop {
        // Increment and check heartbeat
        heartbeat_counter += 1;
        if heartbeat_counter % heartbeat_interval == 0 {
            debug!(
                "record_video: Heartbeat for monitor {} - iteration {}",
                monitor_id, heartbeat_counter
            );
        }

        if let Some(frame) = video_capture.ocr_frame_queue.pop() {
            debug!(
                "record_video: Processing frame with {} window results",
                frame.window_ocr_results.len()
            );
            for window_result in &frame.window_ocr_results {
                match db
                    .insert_frame(
                        &device_name,
                        None,
                        window_result.browser_url.as_deref(),
                        Some(window_result.app_name.as_str()),
                        Some(window_result.window_name.as_str()),
                        window_result.focused,
                    )
                    .await
                {
                    Ok(frame_id) => {
                        let text_json =
                            serde_json::to_string(&window_result.text_json).unwrap_or_default();

                        let text = if use_pii_removal {
                            &remove_pii(&window_result.text)
                        } else {
                            &window_result.text
                        };

                        if realtime_vision {
                            let _ = send_event(
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
                            );
                        }
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
                            continue;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to insert frame: {}", e);
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
