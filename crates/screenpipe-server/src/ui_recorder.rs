//! UI Event Recording Integration
//!
//! Integrates screenpipe-accessibility capture with the server's recording loop.

#[cfg(feature = "ui-events")]
use anyhow::Result;
#[cfg(feature = "ui-events")]
use screenpipe_accessibility::{UiCaptureConfig, UiRecorder};
#[cfg(feature = "ui-events")]
use screenpipe_db::{DatabaseManager, InsertUiEvent};
#[cfg(feature = "ui-events")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(feature = "ui-events")]
use std::sync::Arc;
#[cfg(feature = "ui-events")]
use std::time::Duration;
#[cfg(feature = "ui-events")]
use tracing::{debug, error, info, warn};
#[cfg(feature = "ui-events")]
use uuid::Uuid;

/// Configuration for UI event capture
#[cfg(feature = "ui-events")]
#[derive(Debug, Clone)]
pub struct UiRecorderConfig {
    /// Enable UI event capture
    pub enabled: bool,
    /// Capture mouse clicks
    pub capture_clicks: bool,
    /// Capture mouse movements (throttled)
    pub capture_mouse_move: bool,
    /// Capture text input (aggregated)
    pub capture_text: bool,
    /// Capture individual keystrokes (privacy sensitive)
    pub capture_keystrokes: bool,
    /// Capture clipboard operations
    pub capture_clipboard: bool,
    /// Capture clipboard content (privacy sensitive)
    pub capture_clipboard_content: bool,
    /// Capture app switches
    pub capture_app_switch: bool,
    /// Capture window focus changes
    pub capture_window_focus: bool,
    /// Capture element context via accessibility
    pub capture_context: bool,
    /// Additional apps to exclude
    pub excluded_apps: Vec<String>,
    /// Window patterns to exclude
    pub excluded_windows: Vec<String>,
    /// Batch size for database inserts
    pub batch_size: usize,
    /// Batch timeout in milliseconds
    pub batch_timeout_ms: u64,
}

#[cfg(feature = "ui-events")]
impl Default for UiRecorderConfig {
    fn default() -> Self {
        Self {
            enabled: false, // Opt-in by default
            capture_clicks: true,
            capture_mouse_move: false,
            capture_text: true,
            capture_keystrokes: false,
            capture_clipboard: true,
            capture_clipboard_content: false,
            capture_app_switch: true,
            capture_window_focus: true,
            capture_context: true,
            excluded_apps: Vec::new(),
            excluded_windows: Vec::new(),
            batch_size: 100,
            batch_timeout_ms: 1000,
        }
    }
}

#[cfg(feature = "ui-events")]
impl UiRecorderConfig {
    /// Convert to screenpipe-ui config
    pub fn to_ui_config(&self) -> UiCaptureConfig {
        let mut config = UiCaptureConfig::new();
        config.enabled = self.enabled;
        config.capture_clicks = self.capture_clicks;
        config.capture_mouse_move = self.capture_mouse_move;
        config.capture_text = self.capture_text;
        config.capture_keystrokes = self.capture_keystrokes;
        config.capture_clipboard = self.capture_clipboard;
        config.capture_clipboard_content = self.capture_clipboard_content;
        config.capture_app_switch = self.capture_app_switch;
        config.capture_window_focus = self.capture_window_focus;
        config.capture_context = self.capture_context;

        // Add excluded apps
        for app in &self.excluded_apps {
            config.excluded_apps.push(app.to_lowercase());
        }

        // Add excluded window patterns
        for pattern in &self.excluded_windows {
            if let Ok(re) = regex::Regex::new(pattern) {
                config.excluded_window_patterns.push(re);
            }
        }

        config
    }
}

/// Handle for managing the UI recorder
#[cfg(feature = "ui-events")]
pub struct UiRecorderHandle {
    stop_flag: Arc<AtomicBool>,
    task_handle: Option<tokio::task::JoinHandle<()>>,
}

#[cfg(feature = "ui-events")]
impl UiRecorderHandle {
    /// Stop the UI recorder
    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }

    /// Check if still running
    pub fn is_running(&self) -> bool {
        !self.stop_flag.load(Ordering::Relaxed)
    }

    /// Wait for the recorder to stop
    pub async fn join(self) {
        if let Some(handle) = self.task_handle {
            let _ = handle.await;
        }
    }
}

/// Start UI event recording
#[cfg(feature = "ui-events")]
pub async fn start_ui_recording(
    db: Arc<DatabaseManager>,
    config: UiRecorderConfig,
) -> Result<UiRecorderHandle> {
    if !config.enabled {
        info!("UI event capture is disabled");
        return Ok(UiRecorderHandle {
            stop_flag: Arc::new(AtomicBool::new(true)),
            task_handle: None,
        });
    }

    let ui_config = config.to_ui_config();
    let recorder = UiRecorder::new(ui_config);

    // Check permissions
    let perms = recorder.check_permissions();
    if !perms.all_granted() {
        warn!(
            "UI capture permissions not granted - accessibility: {}, input_monitoring: {}",
            perms.accessibility, perms.input_monitoring
        );
        warn!("Requesting permissions...");
        let perms = recorder.request_permissions();
        if !perms.all_granted() {
            error!("UI capture permissions denied. UI event recording will be disabled.");
            return Ok(UiRecorderHandle {
                stop_flag: Arc::new(AtomicBool::new(true)),
                task_handle: None,
            });
        }
    }

    info!("Starting UI event capture");

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();
    let batch_size = config.batch_size;
    let batch_timeout = Duration::from_millis(config.batch_timeout_ms);

    // Start the recording
    let handle = match recorder.start() {
        Ok(h) => h,
        Err(e) => {
            error!("Failed to start UI recorder: {}", e);
            return Err(e);
        }
    };

    // Spawn the event processing task
    let task_handle = tokio::spawn(async move {
        let session_id = Uuid::new_v4().to_string();
        info!("UI recording session started: {}", session_id);

        let mut batch: Vec<InsertUiEvent> = Vec::with_capacity(batch_size);
        let mut last_flush = std::time::Instant::now();
        let mut consecutive_failures: u32 = 0;
        let max_batch_age = Duration::from_secs(30); // Drop events older than 30s during storms

        loop {
            if stop_flag_clone.load(Ordering::Relaxed) {
                break;
            }

            // Try to receive events with timeout
            match handle.recv_timeout(Duration::from_millis(100)) {
                Some(event) => {
                    let db_event = event.to_db_insert(Some(session_id.clone()));
                    batch.push(db_event);

                    // Flush if batch is full
                    if batch.len() >= batch_size {
                        flush_batch(&db, &mut batch, &mut consecutive_failures).await;
                        last_flush = std::time::Instant::now();
                    }
                }
                None => {
                    // Timeout - check if we should flush
                    if !batch.is_empty() && last_flush.elapsed() >= batch_timeout {
                        // During contention storms, drop old events to prevent unbounded growth
                        if consecutive_failures > 3 && batch.len() > batch_size * 2 {
                            let old_len = batch.len();
                            // Keep only the most recent batch_size events
                            let drain_count = old_len.saturating_sub(batch_size);
                            batch.drain(..drain_count);
                            warn!(
                                "UI recorder: dropped {} old events during DB contention (kept {})",
                                drain_count, batch.len()
                            );
                        }

                        flush_batch(&db, &mut batch, &mut consecutive_failures).await;
                        last_flush = std::time::Instant::now();

                        // Exponential backoff on consecutive failures
                        if consecutive_failures > 0 {
                            let backoff = Duration::from_millis(
                                (500 * (1u64 << consecutive_failures.min(5))).min(30_000)
                            );
                            debug!(
                                "UI recorder: backing off {}ms after {} failures",
                                backoff.as_millis(), consecutive_failures
                            );
                            tokio::time::sleep(backoff).await;
                        }
                    }
                }
            }

            // Safety: drop entire batch if it's too old (>30s without successful flush)
            if !batch.is_empty() && last_flush.elapsed() > max_batch_age && consecutive_failures > 5 {
                warn!(
                    "UI recorder: dropping {} stale events (last flush {}s ago, {} consecutive failures)",
                    batch.len(), last_flush.elapsed().as_secs(), consecutive_failures
                );
                batch.clear();
                last_flush = std::time::Instant::now();
            }
        }

        // Final flush
        if !batch.is_empty() {
            flush_batch(&db, &mut batch, &mut consecutive_failures).await;
        }

        handle.stop();
        info!("UI recording session ended: {}", session_id);
    });

    Ok(UiRecorderHandle {
        stop_flag,
        task_handle: Some(task_handle),
    })
}

#[cfg(feature = "ui-events")]
async fn flush_batch(
    db: &Arc<DatabaseManager>,
    batch: &mut Vec<InsertUiEvent>,
    consecutive_failures: &mut u32,
) {
    if batch.is_empty() {
        return;
    }

    match db.insert_ui_events_batch(batch).await {
        Ok(inserted) => {
            debug!("Flushed {} UI events to database", inserted);
            *consecutive_failures = 0;
        }
        Err(e) => {
            *consecutive_failures += 1;
            if *consecutive_failures <= 3 {
                error!("Failed to insert UI events batch: {}", e);
            } else {
                // Reduce log spam during contention storms
                debug!("Failed to insert UI events batch (failure #{}): {}", consecutive_failures, e);
            }
        }
    }
    batch.clear();
}

// Stub implementations when ui-events feature is disabled
#[cfg(not(feature = "ui-events"))]
pub struct UiRecorderConfig {
    pub enabled: bool,
}

#[cfg(not(feature = "ui-events"))]
impl Default for UiRecorderConfig {
    fn default() -> Self {
        Self { enabled: false }
    }
}

#[cfg(not(feature = "ui-events"))]
pub struct UiRecorderHandle;

#[cfg(not(feature = "ui-events"))]
impl UiRecorderHandle {
    pub fn stop(&self) {}
    pub fn is_running(&self) -> bool {
        false
    }
    pub async fn join(self) {}
}

#[cfg(not(feature = "ui-events"))]
pub async fn start_ui_recording(
    _db: std::sync::Arc<screenpipe_db::DatabaseManager>,
    _config: UiRecorderConfig,
) -> anyhow::Result<UiRecorderHandle> {
    Ok(UiRecorderHandle)
}
