use crate::embedded_server::{EmbeddedServerConfig, EmbeddedServerHandle, start_embedded_server};
use crate::get_base_dir;
use crate::permissions::do_permissions_check;
use crate::store::SettingsStore;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

/// State holding the embedded server handle
pub struct RecordingState(pub Arc<Mutex<Option<EmbeddedServerHandle>>>);

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
    state: State<'_, RecordingState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    info!("Stopping screenpipe server");

    let mut handle_guard = state.0.lock().await;
    if let Some(handle) = handle_guard.take() {
        handle.shutdown();
        // Wait for the old server to fully release port 3030
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
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
    state: State<'_, RecordingState>,
    app: tauri::AppHandle,
    _override_args: Option<Vec<String>>,
) -> Result<(), String> {
    info!("Starting screenpipe server");

    let store = SettingsStore::get(&app).ok().flatten().unwrap_or_default();
    let port = store.port;
    let health_url = format!("http://localhost:{}/health", port);

    // Check if we already own a running server
    {
        let mut handle_guard = state.0.lock().await;
        if handle_guard.is_some() {
            // We have a handle — check if it's still healthy
            match reqwest::Client::new()
                .get(&health_url)
                .timeout(std::time::Duration::from_secs(2))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    info!("Screenpipe server already running and healthy on port {}", port);
                    return Ok(());
                }
                _ => {
                    warn!("Server handle exists but not responding, will restart");
                }
            }
            // Shut it down — we're restarting intentionally
            if let Some(handle) = handle_guard.take() {
                handle.shutdown();
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    }

    // No handle — either cold start, or stop_screenpipe() already cleared it.
    // Kill orphaned processes (but never our own PID).
    kill_process_on_port(port).await;

    // Wait for port to be fully released (our own server threads may still be
    // shutting down after handle.shutdown() or stop_screenpipe()).
    // The embedded server will fail to bind if the port is still occupied,
    // so this is critical for restart reliability.
    for i in 0..20 {
        match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await {
            Ok(_) => {
                debug!("Port {} is free after {}ms", port, i * 250);
                break;
            }
            Err(_) => {
                if i == 19 {
                    warn!("Port {} still in use after 5s, will attempt start anyway", port);
                } else {
                    tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
                }
            }
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
    let recording_state_inner = state.0.clone();

    // Use a oneshot channel to report success/failure from the dedicated runtime
    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    // Spawn a dedicated thread with its own tokio runtime — same pattern as main.rs initial boot.
    // This prevents the HTTP server from being starved by Tauri's UI runtime.
    std::thread::Builder::new()
        .name("screenpipe-server".to_string())
        .spawn(move || {
            let server_runtime = match tokio::runtime::Builder::new_multi_thread()
                .worker_threads(4)
                .thread_name("screenpipe-worker")
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    let _ = result_tx.send(Err(format!("Failed to create server runtime: {}", e)));
                    return;
                }
            };

            server_runtime.block_on(async move {
                match start_embedded_server(config).await {
                    Ok(handle) => {
                        info!("Embedded screenpipe server started successfully on dedicated runtime");
                        {
                            let mut guard = recording_state_inner.lock().await;
                            *guard = Some(handle);
                        }
                        // Signal success to the caller
                        let _ = result_tx.send(Ok(()));

                        // Keep the runtime alive until the handle is taken (shutdown requested)
                        loop {
                            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                            let guard = recording_state_inner.lock().await;
                            if guard.is_none() {
                                info!("Server handle removed from state, shutting down server thread");
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to start embedded server: {}", e);
                        let _ = result_tx.send(Err(e));
                    }
                }
            });
        })
        .map_err(|e| format!("Failed to spawn server thread: {}", e))?;

    // Wait for the dedicated runtime to report back
    match result_rx.await {
        Ok(Ok(())) => {
            info!("Screenpipe server started successfully");
            Ok(())
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Server startup channel dropped unexpectedly".to_string()),
    }
}

/// Kill any process occupying a given port. Handles orphaned screenpipe processes
/// from previous crashes, CLI runs, etc. Safe because we already verified the port
/// is NOT serving a healthy screenpipe (that case returns early above).
async fn kill_process_on_port(port: u16) {
    #[allow(unused_variables)] // used only on unix
    let my_pid = std::process::id().to_string();

    #[cfg(unix)]
    {
        // lsof -ti:PORT gives PIDs of processes using that port
        match tokio::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
            .await
        {
            Ok(output) if output.status.success() => {
                let pids = String::from_utf8_lossy(&output.stdout);
                let pids: Vec<&str> = pids
                    .trim()
                    .split('\n')
                    .filter(|s| !s.is_empty() && *s != my_pid)
                    .collect();
                if pids.is_empty() {
                    debug!("No orphaned processes on port {} (only our own PID)", port);
                    return;
                }
                warn!(
                    "Found {} orphaned process(es) on port {}: {:?}. Killing to free port (our pid: {}).",
                    pids.len(), port, pids, my_pid
                );
                for pid in &pids {
                    let _ = tokio::process::Command::new("kill")
                        .args(["-9", pid])
                        .output()
                        .await;
                }
                // Wait for port to be released
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                info!("Killed orphaned process(es) on port {}", port);
            }
            _ => {
                // No process on port or lsof not available — fine
            }
        }
    }

    #[cfg(windows)]
    {
        let my_pid_num: u32 = std::process::id();
        // netstat -ano | findstr :PORT
        let mut netstat_cmd = tokio::process::Command::new("cmd");
        netstat_cmd.args(["/C", &format!("netstat -ano | findstr :{}", port)]);
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            netstat_cmd.creation_flags(CREATE_NO_WINDOW);
        }
        match netstat_cmd.output().await
        {
            Ok(output) if output.status.success() => {
                let text = String::from_utf8_lossy(&output.stdout);
                let mut pids = std::collections::HashSet::new();
                for line in text.lines() {
                    // Lines look like: TCP 0.0.0.0:3030 ... LISTENING 12345
                    if let Some(pid) = line.split_whitespace().last() {
                        if let Ok(pid_num) = pid.parse::<u32>() {
                            if pid_num > 0 && pid_num != my_pid_num {
                                pids.insert(pid_num);
                            }
                        }
                    }
                }
                if pids.is_empty() {
                    debug!("No orphaned processes on port {} (only our own PID)", port);
                    return;
                }
                warn!(
                    "Found {} orphaned process(es) on port {}: {:?}. Killing to free port (our pid: {}).",
                    pids.len(), port, pids, my_pid_num
                );
                for pid in &pids {
                    let mut kill_cmd = tokio::process::Command::new("taskkill");
                    kill_cmd.args(["/F", "/PID", &pid.to_string()]);
                    {
                        #[allow(unused_imports)]
                        use std::os::windows::process::CommandExt;
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        kill_cmd.creation_flags(CREATE_NO_WINDOW);
                    }
                    let _ = kill_cmd.output().await;
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                info!("Killed orphaned process(es) on port {}", port);
            }
            _ => {}
        }
    }
}
