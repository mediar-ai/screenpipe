use crate::embedded_server::{EmbeddedServerConfig, EmbeddedServerHandle, start_embedded_server};
use crate::get_base_dir;
use crate::permissions::do_permissions_check;
use crate::store::SettingsStore;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

/// State holding the embedded server handle
pub struct SidecarState(pub Arc<Mutex<Option<EmbeddedServerHandle>>>);

#[derive(Debug, Serialize, Deserialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MonitorDevice {
    pub id: u32,
    pub name: String,
    pub is_default: bool,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub name: String,
    pub is_default: bool,
}

/// Get all available audio devices
pub async fn get_available_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    debug!("Getting available audio devices");

    let devices = screenpipe_audio::core::device::list_audio_devices()
        .await
        .map_err(|e| format!("Failed to list audio devices: {}", e))?;

    let default_input = screenpipe_audio::core::device::default_input_device()
        .map(|d| d.to_string())
        .ok();
    let default_output = screenpipe_audio::core::device::default_output_device()
        .await
        .map(|d| d.to_string())
        .ok();

    let result: Vec<AudioDeviceInfo> = devices
        .iter()
        .map(|d| {
            let name = d.to_string();
            let is_default = Some(&name) == default_input.as_ref() || Some(&name) == default_output.as_ref();
            AudioDeviceInfo {
                name,
                is_default,
            }
        })
        .collect();

    debug!("Found {} audio devices", result.len());
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    get_available_audio_devices().await
}

/// Get all available monitors connected to the device
pub async fn get_available_monitors() -> Result<Vec<MonitorDevice>, String> {
    debug!("Getting available monitors");

    let monitors = screenpipe_vision::monitor::list_monitors().await;

    if monitors.is_empty() {
        return Err("No monitors found".to_string());
    }

    let result: Vec<MonitorDevice> = monitors
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorDevice {
            id: m.id(),
            name: if m.name().is_empty() { format!("Monitor {}", i + 1) } else { m.name().to_string() },
            is_default: i == 0, // First monitor is default
            width: m.width(),
            height: m.height(),
        })
        .collect();

    debug!("Found {} monitors", result.len());
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn get_monitors() -> Result<Vec<MonitorDevice>, String> {
    get_available_monitors().await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_screenpipe(
    state: State<'_, SidecarState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    info!("Stopping screenpipe server");

    let mut handle_guard = state.0.lock().await;
    if let Some(handle) = handle_guard.take() {
        handle.shutdown();
        info!("Screenpipe server stopped");
        Ok(())
    } else {
        debug!("No server running to stop");
        Ok(())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn spawn_screenpipe(
    state: State<'_, SidecarState>,
    app: tauri::AppHandle,
    _override_args: Option<Vec<String>>,
) -> Result<(), String> {
    info!("Starting screenpipe server");

    // Check if already running
    {
        let handle_guard = state.0.lock().await;
        if handle_guard.is_some() {
            // Verify it's actually running via health check
            let store = SettingsStore::get(&app).ok().flatten().unwrap_or_default();
            let port = store.port;
            let health_url = format!("http://localhost:{}/health", port);

            match reqwest::Client::new()
                .get(&health_url)
                .timeout(std::time::Duration::from_secs(2))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    info!("Screenpipe server already running and healthy");
                    return Ok(());
                }
                _ => {
                    warn!("Server handle exists but not responding, will restart");
                }
            }
        }
    }

    // Stop existing server if any
    {
        let mut handle_guard = state.0.lock().await;
        if let Some(handle) = handle_guard.take() {
            handle.shutdown();
            // Give it a moment to shut down
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
    }

    // Check permissions before starting
    let permissions_check = do_permissions_check(false);
    let store = SettingsStore::get(&app).ok().flatten().unwrap_or_default();
    let disable_audio = store.disable_audio;

    // Screen recording permission is required
    if !permissions_check.screen_recording.permitted() {
        warn!(
            "Screen recording permission not granted: {:?}. Cannot start server.",
            permissions_check.screen_recording
        );
        return Err(
            "Screen recording permission required. Please grant permission and restart the app."
                .to_string(),
        );
    }

    // Microphone permission check (warning only, don't block)
    if !disable_audio && !permissions_check.microphone.permitted() {
        warn!(
            "Microphone permission not granted: {:?}. Audio recording will not work.",
            permissions_check.microphone
        );
    }

    info!(
        "Permissions OK. Starting embedded server. Audio disabled: {}, microphone permission: {:?}",
        disable_audio, permissions_check.microphone
    );

    // Get data directory
    let base_dir = get_base_dir(&app, None)
        .map_err(|e| format!("Failed to get base directory: {}", e))?;

    // Build config from store
    let config = EmbeddedServerConfig::from_store(&store, base_dir);

    // Start the embedded server
    let handle = start_embedded_server(config).await?;

    // Store the handle
    {
        let mut handle_guard = state.0.lock().await;
        *handle_guard = Some(handle);
    }

    info!("Screenpipe server started successfully");
    Ok(())
}
