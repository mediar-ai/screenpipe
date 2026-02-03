use anyhow::Result;
use dark_light::Mode;
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::sync::RwLock;
use tauri::{path::BaseDirectory, Manager};
use tokio::time::{interval, Duration};

// Shared recording status that can be read by the tray menu
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum RecordingStatus {
    Recording,
    Stopped,
    Error,
}

static RECORDING_STATUS: Lazy<RwLock<RecordingStatus>> =
    Lazy::new(|| RwLock::new(RecordingStatus::Stopped));

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

/// Starts a background task that periodically checks the health of the sidecar
/// and updates the tray icon accordingly.
pub async fn start_health_check(app: tauri::AppHandle) -> Result<()> {
    let mut interval = interval(Duration::from_secs(1));
    let client = reqwest::Client::new();
    let mut last_status = String::new();
    let mut last_theme = dark_light::detect().unwrap_or(Mode::Dark); // Track the last known theme

    tokio::spawn(async move {
        loop {
            interval.tick().await;

            let theme = dark_light::detect().unwrap_or(Mode::Dark); // Get current theme
            let health_result = check_health(&client).await;
            let current_status = match health_result {
                Ok(health) if health.status == "unhealthy" || health.status == "error" => {
                    set_recording_status(RecordingStatus::Error);
                    "unhealthy"
                }
                Ok(_) => {
                    set_recording_status(RecordingStatus::Recording);
                    "healthy"
                }
                Err(_) => {
                    set_recording_status(RecordingStatus::Stopped);
                    "error"
                }
            };

            // Update icon if either health status OR theme changes
            if current_status != last_status || theme != last_theme {
                last_status = current_status.to_string();
                last_theme = theme;

                if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                    let icon_path = if current_status == "unhealthy" || current_status == "error" {
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

                    let icon_path = app
                        .path()
                        .resolve(icon_path, BaseDirectory::Resource)
                        .expect("failed to resolve icon path");

                    let _ = main_tray
                        .set_icon(Some(tauri::image::Image::from_path(&icon_path).unwrap()))
                        .and_then(|_| main_tray.set_icon_as_template(true));
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
