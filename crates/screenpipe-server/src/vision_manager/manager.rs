//! VisionManager - Core manager for per-monitor recording tasks

use anyhow::Result;
use dashmap::DashMap;
use screenpipe_core::Language;
use screenpipe_db::DatabaseManager;
use screenpipe_vision::monitor::{get_monitor_by_id, list_monitors};
use screenpipe_vision::OcrEngine;
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

use crate::core::record_video;

/// Configuration for VisionManager
#[derive(Clone)]
pub struct VisionManagerConfig {
    pub output_path: String,
    pub fps: f64,
    pub video_chunk_duration: Duration,
    pub ocr_engine: Arc<OcrEngine>,
    pub use_pii_removal: bool,
    pub ignored_windows: Vec<String>,
    pub included_windows: Vec<String>,
    pub ignored_urls: Vec<String>,
    pub languages: Vec<Language>,
    pub capture_unfocused_windows: bool,
    pub realtime_vision: bool,
    pub activity_feed: screenpipe_vision::ActivityFeedOption,
    pub video_quality: String,
}

/// Status of the VisionManager
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VisionManagerStatus {
    Stopped,
    Running,
    ShuttingDown,
}

/// Manages vision recording across multiple monitors with dynamic detection
pub struct VisionManager {
    config: VisionManagerConfig,
    db: Arc<DatabaseManager>,
    vision_handle: Handle,
    status: Arc<RwLock<VisionManagerStatus>>,
    /// Map of monitor_id -> JoinHandle
    recording_tasks: Arc<DashMap<u32, JoinHandle<()>>>,
}

impl VisionManager {
    /// Create a new VisionManager
    pub fn new(
        config: VisionManagerConfig,
        db: Arc<DatabaseManager>,
        vision_handle: Handle,
    ) -> Self {
        Self {
            config,
            db,
            vision_handle,
            status: Arc::new(RwLock::new(VisionManagerStatus::Stopped)),
            recording_tasks: Arc::new(DashMap::new()),
        }
    }

    /// Get current status
    pub async fn status(&self) -> VisionManagerStatus {
        *self.status.read().await
    }

    /// Start recording on all currently connected monitors
    pub async fn start(&self) -> Result<()> {
        let mut status = self.status.write().await;
        if *status == VisionManagerStatus::Running {
            debug!("VisionManager already running");
            return Ok(());
        }

        info!("Starting VisionManager");
        *status = VisionManagerStatus::Running;
        drop(status);

        // Get all monitors and start recording on each
        let monitors = list_monitors().await;
        for monitor in monitors {
            let monitor_id = monitor.id();
            if let Err(e) = self.start_monitor(monitor_id).await {
                warn!(
                    "Failed to start recording on monitor {}: {:?}",
                    monitor_id, e
                );
            }
        }

        Ok(())
    }

    /// Stop all recording
    pub async fn stop(&self) -> Result<()> {
        let mut status = self.status.write().await;
        if *status == VisionManagerStatus::Stopped {
            debug!("VisionManager already stopped");
            return Ok(());
        }

        info!("Stopping VisionManager");
        *status = VisionManagerStatus::ShuttingDown;
        drop(status);

        // Stop all monitors
        let monitor_ids: Vec<u32> = self
            .recording_tasks
            .iter()
            .map(|entry| *entry.key())
            .collect();
        for monitor_id in monitor_ids {
            if let Err(e) = self.stop_monitor(monitor_id).await {
                warn!(
                    "Failed to stop recording on monitor {}: {:?}",
                    monitor_id, e
                );
            }
        }

        let mut status = self.status.write().await;
        *status = VisionManagerStatus::Stopped;

        Ok(())
    }

    /// Start recording on a specific monitor
    pub async fn start_monitor(&self, monitor_id: u32) -> Result<()> {
        // Check if already recording
        if self.recording_tasks.contains_key(&monitor_id) {
            debug!("Monitor {} is already recording", monitor_id);
            return Ok(());
        }

        // Verify monitor exists
        let monitor = get_monitor_by_id(monitor_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("Monitor {} not found", monitor_id))?;

        info!(
            "Starting vision recording for monitor {} ({}x{})",
            monitor_id,
            monitor.width(),
            monitor.height()
        );

        // Clone config values for the spawned task
        let db = self.db.clone();
        let output_path = Arc::new(self.config.output_path.clone());
        let fps = self.config.fps;
        let video_chunk_duration = self.config.video_chunk_duration;
        let ocr_engine = self.config.ocr_engine.clone();
        let use_pii_removal = self.config.use_pii_removal;
        let ignored_windows = self.config.ignored_windows.clone();
        let included_windows = self.config.included_windows.clone();
        let ignored_urls = self.config.ignored_urls.clone();
        let languages = self.config.languages.clone();
        let capture_unfocused_windows = self.config.capture_unfocused_windows;
        let realtime_vision = self.config.realtime_vision;
        let activity_feed = self.config.activity_feed.clone();
        let video_quality = self.config.video_quality.clone();

        // Spawn the recording task using the existing record_video function
        let handle = self.vision_handle.spawn(async move {
            loop {
                match record_video(
                    db.clone(),
                    output_path.clone(),
                    fps,
                    ocr_engine.clone(),
                    monitor_id,
                    use_pii_removal,
                    &ignored_windows,
                    &included_windows,
                    &ignored_urls,
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
                        info!("Monitor {} recording completed normally", monitor_id);
                        break;
                    }
                    Err(e) => {
                        error!(
                            "Monitor {} recording error: {:?}, restarting in 1s...",
                            monitor_id, e
                        );
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });

        self.recording_tasks.insert(monitor_id, handle);

        Ok(())
    }

    /// Stop recording on a specific monitor
    pub async fn stop_monitor(&self, monitor_id: u32) -> Result<()> {
        if let Some((_, handle)) = self.recording_tasks.remove(&monitor_id) {
            info!("Stopping vision recording for monitor {}", monitor_id);

            // Abort the task
            handle.abort();

            // Wait for it to finish
            let _ = handle.await;

            Ok(())
        } else {
            debug!("Monitor {} was not recording", monitor_id);
            Ok(())
        }
    }

    /// Get list of currently recording monitor IDs
    pub async fn active_monitors(&self) -> Vec<u32> {
        self.recording_tasks
            .iter()
            .map(|entry| *entry.key())
            .collect()
    }

    /// Shutdown the VisionManager
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down VisionManager");
        self.stop().await
    }
}
