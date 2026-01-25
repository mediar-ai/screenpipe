use anyhow::Result;
use screenpipe_core::Language;
use screenpipe_db::DatabaseManager;
use screenpipe_vision::monitor::list_monitors;
use screenpipe_vision::OcrEngine;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

use crate::record_single_monitor;

/// Manages vision recording across multiple monitors with dynamic detection.
///
/// When monitors are connected/disconnected, VisionManager automatically
/// starts/stops recording on them. This ensures continuous recording
/// regardless of monitor configuration changes.
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
    /// Map of monitor_id -> task handle
    monitor_tasks: Arc<RwLock<HashMap<u32, JoinHandle<()>>>>,
    /// Global running state
    is_running: Arc<RwLock<bool>>,
    /// Detection loop handle
    detection_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
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
            monitor_tasks: Arc::new(RwLock::new(HashMap::new())),
            is_running: Arc::new(RwLock::new(false)),
            detection_handle: Arc::new(RwLock::new(None)),
        }
    }

    /// Start recording on a specific monitor
    async fn start_monitor(&self, monitor_id: u32, vision_handle: &Handle) -> Result<()> {
        let mut tasks = self.monitor_tasks.write().await;

        if tasks.contains_key(&monitor_id) {
            debug!("Monitor {} is already recording", monitor_id);
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

        let handle = vision_handle.spawn(async move {
            loop {
                // Check if we should stop
                if !*is_running.read().await {
                    info!("VisionManager stopped, exiting monitor {} task", monitor_id);
                    break;
                }

                // Check if monitor still exists before trying to record
                let monitor_exists = screenpipe_vision::monitor::get_monitor_by_id(monitor_id)
                    .await
                    .is_some();

                if !monitor_exists {
                    info!("Monitor {} no longer exists, stopping task", monitor_id);
                    break;
                }

                debug!("Starting/restarting vision capture for monitor {}", monitor_id);

                match record_single_monitor(
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
                )
                .await
                {
                    Ok(_) => {
                        warn!("Vision capture for monitor {} completed", monitor_id);
                    }
                    Err(e) => {
                        // Check if it's a "monitor not found" error
                        let error_str = e.to_string().to_lowercase();
                        if error_str.contains("monitor not found")
                            || error_str.contains("monitor capture failed")
                            || error_str.contains("not found")
                        {
                            info!("Monitor {} appears to be disconnected: {}", monitor_id, e);
                            break;
                        }
                        error!("Vision capture error for monitor {}: {}", monitor_id, e);
                    }
                }

                // Small delay before restarting
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });

        tasks.insert(monitor_id, handle);
        Ok(())
    }

    /// Stop recording on a specific monitor
    async fn stop_monitor(&self, monitor_id: u32) {
        let mut tasks = self.monitor_tasks.write().await;

        if let Some(handle) = tasks.remove(&monitor_id) {
            info!("Stopping vision recording for monitor {}", monitor_id);
            handle.abort();
        }
    }

    /// Start the VisionManager - begins recording on all available monitors
    /// and starts the monitor detection loop
    pub async fn start(&self, vision_handle: &Handle) -> Result<()> {
        *self.is_running.write().await = true;

        // Get currently available monitors
        let monitors = list_monitors().await;

        if monitors.is_empty() {
            warn!("No monitors found at startup, will wait for monitors to be connected");
        } else {
            info!("Starting vision recording on {} monitor(s)", monitors.len());
            for monitor in &monitors {
                if let Err(e) = self.start_monitor(monitor.id(), vision_handle).await {
                    error!("Failed to start monitor {}: {}", monitor.id(), e);
                }
            }
        }

        // Start the monitor detection loop
        self.start_detection_loop(vision_handle.clone()).await;

        Ok(())
    }

    /// Stop all recording
    pub async fn stop(&self) -> Result<()> {
        info!("Stopping VisionManager");
        *self.is_running.write().await = false;

        // Stop detection loop
        if let Some(handle) = self.detection_handle.write().await.take() {
            handle.abort();
        }

        // Stop all monitor tasks
        let mut tasks = self.monitor_tasks.write().await;
        for (monitor_id, handle) in tasks.drain() {
            info!("Stopping monitor {} task", monitor_id);
            handle.abort();
        }

        Ok(())
    }

    /// Start background task to detect monitor changes
    async fn start_detection_loop(&self, vision_handle: Handle) {
        let monitor_tasks = Arc::clone(&self.monitor_tasks);
        let is_running = Arc::clone(&self.is_running);

        // Clone all config for the spawned task
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

        let handle = tokio::spawn(async move {
            info!("Starting monitor detection loop (polling every 5 seconds)");

            loop {
                if !*is_running.read().await {
                    info!("Monitor detection loop stopped");
                    break;
                }

                // Get current monitors
                let current_monitors: HashSet<u32> = list_monitors()
                    .await
                    .iter()
                    .map(|m| m.id())
                    .collect();

                // Get currently recording monitors
                let recording_monitors: HashSet<u32> = {
                    let tasks = monitor_tasks.read().await;
                    tasks.keys().cloned().collect()
                };

                // Find new monitors (connected)
                let new_monitors: Vec<u32> = current_monitors
                    .difference(&recording_monitors)
                    .cloned()
                    .collect();

                // Find removed monitors (disconnected)
                let removed_monitors: Vec<u32> = recording_monitors
                    .difference(&current_monitors)
                    .cloned()
                    .collect();

                // Start recording on new monitors
                for monitor_id in new_monitors {
                    info!("New monitor detected: {}, starting recording", monitor_id);

                    let db = Arc::clone(&db);
                    let output_path = Arc::clone(&output_path);
                    let ocr_engine = Arc::clone(&ocr_engine);
                    let ignored_windows = ignored_windows.clone();
                    let include_windows = include_windows.clone();
                    let languages = languages.clone();
                    let is_running_clone = Arc::clone(&is_running);

                    let task_handle = vision_handle.spawn(async move {
                        loop {
                            if !*is_running_clone.read().await {
                                break;
                            }

                            // Check if monitor still exists
                            let monitor_exists = screenpipe_vision::monitor::get_monitor_by_id(monitor_id)
                                .await
                                .is_some();

                            if !monitor_exists {
                                info!("Monitor {} no longer exists, stopping task", monitor_id);
                                break;
                            }

                            match record_single_monitor(
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
                            )
                            .await
                            {
                                Ok(_) => {
                                    warn!("Vision capture for monitor {} completed", monitor_id);
                                }
                                Err(e) => {
                                    let error_str = e.to_string().to_lowercase();
                                    if error_str.contains("monitor not found")
                                        || error_str.contains("not found")
                                    {
                                        info!("Monitor {} disconnected: {}", monitor_id, e);
                                        break;
                                    }
                                    error!("Vision capture error for monitor {}: {}", monitor_id, e);
                                }
                            }

                            tokio::time::sleep(Duration::from_secs(2)).await;
                        }
                    });

                    monitor_tasks.write().await.insert(monitor_id, task_handle);
                }

                // Clean up tasks for removed monitors
                for monitor_id in removed_monitors {
                    info!("Monitor {} disconnected, stopping recording", monitor_id);
                    if let Some(handle) = monitor_tasks.write().await.remove(&monitor_id) {
                        handle.abort();
                    }
                }

                // Also clean up any tasks that have finished (monitor disconnected mid-recording)
                {
                    let mut tasks = monitor_tasks.write().await;
                    let finished: Vec<u32> = tasks
                        .iter()
                        .filter(|(_, handle)| handle.is_finished())
                        .map(|(id, _)| *id)
                        .collect();

                    for id in finished {
                        debug!("Cleaning up finished task for monitor {}", id);
                        tasks.remove(&id);
                    }
                }

                // Poll every 5 seconds
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });

        *self.detection_handle.write().await = Some(handle);
    }

    /// Get list of currently recording monitor IDs
    pub async fn get_active_monitors(&self) -> Vec<u32> {
        self.monitor_tasks.read().await.keys().cloned().collect()
    }

    /// Check if the VisionManager is running
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }
}
