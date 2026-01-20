use anyhow::Result;
use screenpipe_core::Language;
use screenpipe_db::DatabaseManager;
use screenpipe_vision::monitor::list_monitors;
use screenpipe_vision::OcrEngine;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

use crate::VideoCapture;

/// Manages vision recording across multiple monitors with dynamic detection
pub struct VisionManager {
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    video_chunk_duration: Duration,
    ocr_engine: Arc<OcrEngine>,
    use_pii_removal: bool,
    ignored_windows: Vec<String>,
    include_windows: Vec<String>,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_vision: bool,
    /// Currently recording monitor IDs
    active_monitors: Arc<RwLock<HashSet<u32>>>,
    /// Whether to automatically detect new monitors
    use_all_monitors: bool,
    /// Tasks per monitor
    monitor_tasks: Arc<RwLock<Vec<(u32, JoinHandle<()>)>>>,
    /// Global running state
    is_running: Arc<RwLock<bool>>,
}

impl VisionManager {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        db: Arc<DatabaseManager>,
        output_path: Arc<String>,
        fps: f64,
        video_chunk_duration: Duration,
        ocr_engine: Arc<OcrEngine>,
        use_pii_removal: bool,
        ignored_windows: Vec<String>,
        include_windows: Vec<String>,
        languages: Vec<Language>,
        capture_unfocused_windows: bool,
        realtime_vision: bool,
        use_all_monitors: bool,
    ) -> Self {
        Self {
            db,
            output_path,
            fps,
            video_chunk_duration,
            ocr_engine,
            use_pii_removal,
            ignored_windows,
            include_windows,
            languages,
            capture_unfocused_windows,
            realtime_vision,
            active_monitors: Arc::new(RwLock::new(HashSet::new())),
            use_all_monitors,
            monitor_tasks: Arc::new(RwLock::new(Vec::new())),
            is_running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start recording on a specific monitor
    pub async fn start_monitor(&self, monitor_id: u32, vision_handle: &Handle) -> Result<()> {
        let mut active = self.active_monitors.write().await;
        if active.contains(&monitor_id) {
            info!("Monitor {} is already recording", monitor_id);
            return Ok(());
        }

        info!("Starting vision recording for monitor {}", monitor_id);

        let db = Arc::clone(&self.db);
        let output_path = Arc::clone(&self.output_path);
        let fps = self.fps;
        let video_chunk_duration = self.video_chunk_duration;
        let ocr_engine = Arc::clone(&self.ocr_engine);
        let use_pii_removal = self.use_pii_removal;
        let ignored_windows = self.ignored_windows.clone();
        let include_windows = self.include_windows.clone();
        let languages = self.languages.clone();
        let capture_unfocused_windows = self.capture_unfocused_windows;
        let realtime_vision = self.realtime_vision;
        let is_running = Arc::clone(&self.is_running);
        let active_monitors = Arc::clone(&self.active_monitors);

        let handle = vision_handle.spawn(async move {
            loop {
                // Check if we should stop
                if !*is_running.read().await {
                    info!("Vision manager stopped, exiting monitor {} task", monitor_id);
                    break;
                }

                // Check if this monitor is still active
                if !active_monitors.read().await.contains(&monitor_id) {
                    info!("Monitor {} removed from active list, stopping", monitor_id);
                    break;
                }

                info!("Starting vision capture for monitor {}", monitor_id);
                match record_monitor(
                    Arc::clone(&db),
                    Arc::clone(&output_path),
                    fps,
                    video_chunk_duration,
                    Arc::clone(&ocr_engine),
                    monitor_id,
                    use_pii_removal,
                    &ignored_windows,
                    &include_windows,
                    languages.clone(),
                    capture_unfocused_windows,
                    realtime_vision,
                    Arc::clone(&is_running),
                )
                .await
                {
                    Ok(_) => {
                        warn!("Vision capture for monitor {} completed", monitor_id);
                    }
                    Err(e) => {
                        error!("Vision capture error for monitor {}: {}", monitor_id, e);
                    }
                }

                // Small delay before restarting
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });

        active.insert(monitor_id);
        self.monitor_tasks.write().await.push((monitor_id, handle));
        Ok(())
    }

    /// Stop recording on a specific monitor
    pub async fn stop_monitor(&self, monitor_id: u32) -> Result<()> {
        let mut active = self.active_monitors.write().await;
        if !active.remove(&monitor_id) {
            info!("Monitor {} was not recording", monitor_id);
            return Ok(());
        }

        info!("Stopping vision recording for monitor {}", monitor_id);

        // The task will stop on next iteration when it checks active_monitors
        // We can also abort it directly
        let mut tasks = self.monitor_tasks.write().await;
        tasks.retain(|(id, handle)| {
            if *id == monitor_id {
                handle.abort();
                false
            } else {
                true
            }
        });

        Ok(())
    }

    /// Start recording on all available monitors
    pub async fn start(&self, vision_handle: &Handle) -> Result<()> {
        *self.is_running.write().await = true;

        let monitors = list_monitors().await;
        info!("Starting vision recording on {} monitors", monitors.len());

        for monitor in monitors {
            if let Err(e) = self.start_monitor(monitor.id(), vision_handle).await {
                error!("Failed to start monitor {}: {}", monitor.id(), e);
            }
        }

        // If use_all_monitors is enabled, start the detection loop
        if self.use_all_monitors {
            self.start_monitor_detection(vision_handle.clone()).await;
        }

        Ok(())
    }

    /// Stop all recording
    pub async fn stop(&self) -> Result<()> {
        info!("Stopping all vision recording");
        *self.is_running.write().await = false;

        let monitor_ids: Vec<u32> = self.active_monitors.read().await.iter().cloned().collect();
        for monitor_id in monitor_ids {
            let _ = self.stop_monitor(monitor_id).await;
        }

        Ok(())
    }

    /// Start background task to detect monitor changes
    async fn start_monitor_detection(&self, vision_handle: Handle) {
        let active_monitors = Arc::clone(&self.active_monitors);
        let is_running = Arc::clone(&self.is_running);
        let db = Arc::clone(&self.db);
        let output_path = Arc::clone(&self.output_path);
        let fps = self.fps;
        let video_chunk_duration = self.video_chunk_duration;
        let ocr_engine = Arc::clone(&self.ocr_engine);
        let use_pii_removal = self.use_pii_removal;
        let ignored_windows = self.ignored_windows.clone();
        let include_windows = self.include_windows.clone();
        let languages = self.languages.clone();
        let capture_unfocused_windows = self.capture_unfocused_windows;
        let realtime_vision = self.realtime_vision;
        let monitor_tasks = Arc::clone(&self.monitor_tasks);

        tokio::spawn(async move {
            info!("Starting monitor detection loop");
            let mut last_monitors: HashSet<u32> = HashSet::new();

            loop {
                if !*is_running.read().await {
                    info!("Monitor detection stopped");
                    break;
                }

                let current_monitors: HashSet<u32> =
                    list_monitors().await.iter().map(|m| m.id()).collect();

                // Find new monitors
                let new_monitors: Vec<u32> = current_monitors
                    .difference(&last_monitors)
                    .cloned()
                    .collect();

                // Find removed monitors
                let removed_monitors: Vec<u32> = last_monitors
                    .difference(&current_monitors)
                    .cloned()
                    .collect();

                // Start recording on new monitors
                for monitor_id in new_monitors {
                    if !active_monitors.read().await.contains(&monitor_id) {
                        info!("New monitor detected: {}, starting recording", monitor_id);

                        let db = Arc::clone(&db);
                        let output_path = Arc::clone(&output_path);
                        let ocr_engine = Arc::clone(&ocr_engine);
                        let ignored_windows = ignored_windows.clone();
                        let include_windows = include_windows.clone();
                        let languages = languages.clone();
                        let is_running = Arc::clone(&is_running);
                        let active_monitors_clone = Arc::clone(&active_monitors);

                        active_monitors.write().await.insert(monitor_id);

                        let handle = vision_handle.spawn(async move {
                            loop {
                                if !*is_running.read().await {
                                    break;
                                }
                                if !active_monitors_clone.read().await.contains(&monitor_id) {
                                    break;
                                }

                                match record_monitor(
                                    Arc::clone(&db),
                                    Arc::clone(&output_path),
                                    fps,
                                    video_chunk_duration,
                                    Arc::clone(&ocr_engine),
                                    monitor_id,
                                    use_pii_removal,
                                    &ignored_windows,
                                    &include_windows,
                                    languages.clone(),
                                    capture_unfocused_windows,
                                    realtime_vision,
                                    Arc::clone(&is_running),
                                )
                                .await
                                {
                                    Ok(_) => {
                                        warn!(
                                            "Vision capture for monitor {} completed",
                                            monitor_id
                                        );
                                    }
                                    Err(e) => {
                                        error!(
                                            "Vision capture error for monitor {}: {}",
                                            monitor_id, e
                                        );
                                    }
                                }
                                tokio::time::sleep(Duration::from_secs(2)).await;
                            }
                        });

                        monitor_tasks.write().await.push((monitor_id, handle));
                    }
                }

                // Stop recording on removed monitors
                for monitor_id in removed_monitors {
                    info!(
                        "Monitor {} disconnected, stopping recording",
                        monitor_id
                    );
                    active_monitors.write().await.remove(&monitor_id);

                    let mut tasks = monitor_tasks.write().await;
                    tasks.retain(|(id, handle)| {
                        if *id == monitor_id {
                            handle.abort();
                            false
                        } else {
                            true
                        }
                    });
                }

                last_monitors = current_monitors;

                // Check every 2 seconds for monitor changes
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });
    }

    /// Get list of currently active monitor IDs
    pub async fn get_active_monitors(&self) -> Vec<u32> {
        self.active_monitors.read().await.iter().cloned().collect()
    }

    /// Check if recording is running
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }
}

/// Record video from a single monitor
#[allow(clippy::too_many_arguments)]
async fn record_monitor(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    video_chunk_duration: Duration,
    ocr_engine: Arc<OcrEngine>,
    monitor_id: u32,
    use_pii_removal: bool,
    ignored_windows: &[String],
    include_windows: &[String],
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_vision: bool,
    is_running: Arc<RwLock<bool>>,
) -> Result<()> {
    use screenpipe_core::pii_removal::remove_pii;
    use screenpipe_events::send_event;
    use screenpipe_vision::core::WindowOcr;

    let device_name = Arc::new(format!("monitor_{}", monitor_id));

    let new_chunk_callback = {
        let db_clone = Arc::clone(&db);
        let device_name_clone = Arc::clone(&device_name);
        move |file_path: &str| {
            let file_path = file_path.to_string();
            let db = Arc::clone(&db_clone);
            let device_name = Arc::clone(&device_name_clone);

            tokio::spawn(async move {
                debug!("Inserting new video chunk: {}", file_path);
                if let Err(e) = db.insert_video_chunk(&file_path, &device_name).await {
                    error!("Failed to insert new video chunk: {}", e);
                }
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
        // Check if we should stop
        if !*is_running.read().await {
            info!("Recording stopped for monitor {}", monitor_id);
            break;
        }

        if let Some(frame) = video_capture.ocr_frame_queue.pop() {
            for window_result in &frame.window_ocr_results {
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

                match result {
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
                            error!("Failed to insert OCR text: {}", e);
                        }
                    }
                    Err(e) => {
                        warn!("Failed to insert frame: {}", e);
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
            }
        }

        tokio::time::sleep(Duration::from_secs_f64(1.0 / fps)).await;
    }

    Ok(())
}
