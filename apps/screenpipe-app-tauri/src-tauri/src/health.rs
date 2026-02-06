use anyhow::Result;
use dark_light::Mode;
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::sync::RwLock;
use std::time::Instant;
use tauri::{path::BaseDirectory, Manager};
use tokio::time::{interval, Duration};
use tracing::error;

/// How long after startup to treat connection errors as "starting up" instead of "error".
/// The recording server needs time to load whisper models, FFmpeg, etc.
const STARTUP_GRACE_PERIOD: Duration = Duration::from_secs(30);

// Shared recording status that can be read by the tray menu
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum RecordingStatus {
    Starting,
    Recording,
    Stopped,
    Error,
}

static RECORDING_STATUS: Lazy<RwLock<RecordingStatus>> =
    Lazy::new(|| RwLock::new(RecordingStatus::Starting));

pub fn get_recording_status() -> RecordingStatus {
    *RECORDING_STATUS.read().unwrap()
}

fn set_recording_status(status: RecordingStatus) {
    *RECORDING_STATUS.write().unwrap() = status;
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct HealthCheckResponse {
    status: String,
    #[serde(default)]
    status_code: Option<i32>,
    #[serde(rename = "last_frame_timestamp")]
    last_frame_timestamp: Option<String>,
    #[serde(rename = "last_audio_timestamp")]
    last_audio_timestamp: Option<String>,
    #[serde(rename = "last_ui_timestamp", default)]
    last_ui_timestamp: Option<String>,
    #[serde(default)]
    frame_status: Option<String>,
    #[serde(default)]
    audio_status: Option<String>,
    #[serde(default)]
    ui_status: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(rename = "verbose_instructions", default)]
    verbose_instructions: Option<String>,
    #[serde(default)]
    device_status_details: Option<String>,
}

/// Decide recording status based on health check result and time since startup.
///
/// During the grace period, connection errors are treated as "starting up"
/// rather than errors, to avoid false-positive unhealthy indicators while
/// the recording server is still loading.
fn decide_status(
    health_result: &Result<HealthCheckResponse>,
    elapsed_since_start: Duration,
    grace_period: Duration,
    ever_connected: bool,
) -> RecordingStatus {
    match health_result {
        Ok(health) if health.status == "unhealthy" || health.status == "error" => {
            RecordingStatus::Error
        }
        Ok(_) => RecordingStatus::Recording,
        Err(_) => {
            // Connection error — is the server still starting up?
            if !ever_connected && elapsed_since_start < grace_period {
                RecordingStatus::Starting
            } else {
                RecordingStatus::Stopped
            }
        }
    }
}

/// Map RecordingStatus to tray icon status string
fn status_to_icon_key(status: RecordingStatus) -> &'static str {
    match status {
        RecordingStatus::Starting => "starting",
        RecordingStatus::Recording => "healthy",
        RecordingStatus::Stopped => "error",
        RecordingStatus::Error => "unhealthy",
    }
}

/// Whether the tray icon should show the "failed" variant
fn is_unhealthy_icon(icon_key: &str) -> bool {
    icon_key == "unhealthy" || icon_key == "error"
}

/// Starts a background task that periodically checks the health of the sidecar
/// and updates the tray icon accordingly.
pub async fn start_health_check(app: tauri::AppHandle) -> Result<()> {
    let mut interval = interval(Duration::from_secs(1));
    let client = reqwest::Client::new();
    let mut last_status = String::new();
    let mut last_theme = dark_light::detect().unwrap_or(Mode::Dark);
    let start_time = Instant::now();
    let mut ever_connected = false;

    tokio::spawn(async move {
        loop {
            interval.tick().await;

            let theme = dark_light::detect().unwrap_or(Mode::Dark);
            let health_result = check_health(&client).await;

            // Track if we've ever successfully connected
            if health_result.is_ok() {
                ever_connected = true;
            }

            let status = decide_status(
                &health_result,
                start_time.elapsed(),
                STARTUP_GRACE_PERIOD,
                ever_connected,
            );
            set_recording_status(status);

            let current_status = status_to_icon_key(status);

            // Update icon if either health status OR theme changes
            if current_status != last_status || theme != last_theme {
                last_status = current_status.to_string();
                last_theme = theme;

                if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                    let icon_path = if is_unhealthy_icon(current_status) {
                        if theme == Mode::Light {
                            "assets/screenpipe-logo-tray-black-failed.png"
                        } else {
                            "assets/screenpipe-logo-tray-white-failed.png"
                        }
                    } else {
                        if theme == Mode::Light {
                            "assets/screenpipe-logo-tray-black.png"
                        } else {
                            "assets/screenpipe-logo-tray-white.png"
                        }
                    };

                    let icon_path = match app
                        .path()
                        .resolve(icon_path, BaseDirectory::Resource) {
                        Ok(p) => p,
                        Err(e) => {
                            error!("failed to resolve icon path: {}", e);
                            continue;
                        }
                    };

                    match tauri::image::Image::from_path(&icon_path) {
                        Ok(image) => {
                            let _ = main_tray
                                .set_icon(Some(image))
                                .and_then(|_| main_tray.set_icon_as_template(true));
                        }
                        Err(e) => {
                            error!("failed to load tray icon from {:?}: {}", icon_path, e);
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

/// Checks the health of the sidecar by making a request to its health endpoint.
/// Returns an error if the sidecar is not running or not responding.
async fn check_health(client: &reqwest::Client) -> Result<HealthCheckResponse> {
    match client
        .get("http://localhost:3030/health")
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .timeout(Duration::from_secs(5)) // on windows it never times out
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response
            .json::<HealthCheckResponse>()
            .await
            .map_err(|e| anyhow::anyhow!("failed to parse sidecar response: {}", e)),
        Ok(response) => {
            anyhow::bail!("health check failed with status: {}", response.status())
        }
        Err(e) if e.is_timeout() => {
            anyhow::bail!("health check timeout, sidecar may not be running")
        }
        Err(e) if e.is_connect() => {
            anyhow::bail!("sidecar connection refused, it may not be running")
        }
        Err(e) => {
            anyhow::bail!("sidecar health check error: {}", e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_healthy_response() -> Result<HealthCheckResponse> {
        Ok(HealthCheckResponse {
            status: "healthy".to_string(),
            status_code: Some(200),
            last_frame_timestamp: None,
            last_audio_timestamp: None,
            last_ui_timestamp: None,
            frame_status: None,
            audio_status: None,
            ui_status: None,
            message: None,
            verbose_instructions: None,
            device_status_details: None,
        })
    }

    fn make_unhealthy_response() -> Result<HealthCheckResponse> {
        Ok(HealthCheckResponse {
            status: "unhealthy".to_string(),
            status_code: Some(500),
            last_frame_timestamp: None,
            last_audio_timestamp: None,
            last_ui_timestamp: None,
            frame_status: None,
            audio_status: None,
            ui_status: None,
            message: None,
            verbose_instructions: None,
            device_status_details: None,
        })
    }

    fn make_connection_error() -> Result<HealthCheckResponse> {
        Err(anyhow::anyhow!("connection refused"))
    }

    // ==================== decide_status tests ====================

    #[test]
    fn test_healthy_response_always_recording() {
        let result = make_healthy_response();
        // Even at 0s elapsed, a healthy response means recording
        let status = decide_status(&result, Duration::from_secs(0), STARTUP_GRACE_PERIOD, false);
        assert_eq!(status, RecordingStatus::Recording);
    }

    #[test]
    fn test_unhealthy_response_always_error() {
        let result = make_unhealthy_response();
        let status = decide_status(&result, Duration::from_secs(0), STARTUP_GRACE_PERIOD, false);
        assert_eq!(status, RecordingStatus::Error);
    }

    #[test]
    fn test_connection_error_during_grace_period_is_starting() {
        // This is the key fix: during the grace period, connection errors
        // should show "starting" not "error"
        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(0), STARTUP_GRACE_PERIOD, false);
        assert_eq!(status, RecordingStatus::Starting);

        // Still within grace period at 15s
        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(15), STARTUP_GRACE_PERIOD, false);
        assert_eq!(status, RecordingStatus::Starting);

        // Still within grace period at 29s
        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(29), STARTUP_GRACE_PERIOD, false);
        assert_eq!(status, RecordingStatus::Starting);
    }

    #[test]
    fn test_connection_error_after_grace_period_is_stopped() {
        // After grace period, connection errors are real problems
        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(31), STARTUP_GRACE_PERIOD, false);
        assert_eq!(status, RecordingStatus::Stopped);

        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(120), STARTUP_GRACE_PERIOD, false);
        assert_eq!(status, RecordingStatus::Stopped);
    }

    #[test]
    fn test_connection_error_after_previous_connection_is_stopped() {
        // If we connected before and now get errors, it's a real problem
        // even within the grace period
        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(5), STARTUP_GRACE_PERIOD, true);
        assert_eq!(status, RecordingStatus::Stopped);
    }

    #[test]
    fn test_grace_period_boundary() {
        let grace = Duration::from_secs(30);

        // Exactly at boundary = still within grace
        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(29), grace, false);
        assert_eq!(status, RecordingStatus::Starting);

        // One second past = no longer in grace
        let result = make_connection_error();
        let status = decide_status(&result, Duration::from_secs(30), grace, false);
        assert_eq!(status, RecordingStatus::Stopped);
    }

    // ==================== icon mapping tests ====================

    #[test]
    fn test_starting_shows_healthy_icon() {
        // During startup, show the normal icon (not the failed one)
        let key = status_to_icon_key(RecordingStatus::Starting);
        assert_eq!(key, "starting");
        assert!(!is_unhealthy_icon(key));
    }

    #[test]
    fn test_recording_shows_healthy_icon() {
        let key = status_to_icon_key(RecordingStatus::Recording);
        assert_eq!(key, "healthy");
        assert!(!is_unhealthy_icon(key));
    }

    #[test]
    fn test_stopped_shows_failed_icon() {
        let key = status_to_icon_key(RecordingStatus::Stopped);
        assert_eq!(key, "error");
        assert!(is_unhealthy_icon(key));
    }

    #[test]
    fn test_error_shows_failed_icon() {
        let key = status_to_icon_key(RecordingStatus::Error);
        assert_eq!(key, "unhealthy");
        assert!(is_unhealthy_icon(key));
    }

    // ==================== realistic boot sequence simulation ====================

    #[test]
    fn test_boot_sequence_no_false_positive() {
        let grace = Duration::from_secs(30);

        // t=0s: first health check, server not started yet
        let status = decide_status(&make_connection_error(), Duration::from_secs(0), grace, false);
        assert_eq!(status, RecordingStatus::Starting);
        assert!(!is_unhealthy_icon(status_to_icon_key(status)), "should NOT show failed icon at boot");

        // t=1s: still starting
        let status = decide_status(&make_connection_error(), Duration::from_secs(1), grace, false);
        assert_eq!(status, RecordingStatus::Starting);
        assert!(!is_unhealthy_icon(status_to_icon_key(status)));

        // t=5s: server is up, healthy response
        let status = decide_status(&make_healthy_response(), Duration::from_secs(5), grace, false);
        assert_eq!(status, RecordingStatus::Recording);
        assert!(!is_unhealthy_icon(status_to_icon_key(status)));
    }

    #[test]
    fn test_server_crash_after_boot_shows_error() {
        let grace = Duration::from_secs(30);

        // Server was healthy, now crashes
        let status = decide_status(&make_connection_error(), Duration::from_secs(60), grace, true);
        assert_eq!(status, RecordingStatus::Stopped);
        assert!(is_unhealthy_icon(status_to_icon_key(status)), "should show failed icon after crash");
    }

    #[test]
    fn test_server_never_starts_shows_error_after_grace() {
        let grace = Duration::from_secs(30);

        // Server never starts — after grace period, show the error
        let status = decide_status(&make_connection_error(), Duration::from_secs(35), grace, false);
        assert_eq!(status, RecordingStatus::Stopped);
        assert!(is_unhealthy_icon(status_to_icon_key(status)), "should show failed icon if server never started");
    }
}
