use crate::get_store;
use crate::store::SettingsStore;
use crate::permissions::do_permissions_check;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::Emitter;
use tauri::{Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

pub struct SidecarState(pub Arc<tokio::sync::Mutex<Option<SidecarManager>>>);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserCredits {
    #[serde(rename = "user.credits.amount")]
    pub amount: i64,
    #[serde(rename = "user.credits.created_at", default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    #[serde(rename = "user.id", default)]
    pub id: Option<String>,
    #[serde(rename = "user.email", default)]
    pub email: Option<String>,
    #[serde(rename = "user.name", default)]
    pub name: Option<String>,
    #[serde(rename = "user.image", default)]
    pub image: Option<String>,
    #[serde(rename = "user.token", default)]
    pub token: Option<String>,
    #[serde(rename = "user.clerk_id", default)]
    pub clerk_id: Option<String>,
    #[serde(default)]
    pub credits: Option<UserCredits>,
    #[serde(rename = "user.cloud_subscribed", default)]
    pub cloud_subscribed: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorDevice {
    pub id: u32,
    pub name: String,
    pub is_default: bool,
    pub width: u32,
    pub height: u32,
}

impl User {
    pub fn from_store(store: &SettingsStore) -> Self {
        Self {
            id: store.user.id.clone(),
            email: store.user.email.clone(),
            name: store.user.name.clone(),
            image: store.user.image.clone(),
            token: store.user.token.clone(),
            clerk_id: store.user.clerk_id.clone(),
            credits: store.user.credits.clone().map(|c| UserCredits {
                amount: c.amount as i64,
                created_at: None,
            }),
            cloud_subscribed: store.user.cloud_subscribed.clone(),
        }
    }
}

/// Get all available monitors connected to the device
pub async fn get_available_monitors(app: &tauri::AppHandle) -> Result<Vec<MonitorDevice>, String> {
    debug!("Getting available monitors");
    
    let sidecar = app.shell().sidecar("screenpipe")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;
    
    let output = sidecar
        .args(&["vision", "list", "-o", "json"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute monitor listing command: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("Failed to get monitors: {}", stderr);
        return Err(format!("Failed to get monitors: {}", stderr));
    }
    
    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Failed to parse monitor output as UTF-8: {}", e))?;
    
    debug!("Monitor command output: {}", stdout);
    
    // Parse the JSON response which might be in {data: [...], success: true} format
    let json_value: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse monitor JSON: {}", e))?;
    
    let monitors_array = if let Some(data) = json_value.get("data") {
        data.as_array()
    } else {
        json_value.as_array()
    }.ok_or("Monitor response is not an array")?;

    
    let monitors: Vec<MonitorDevice> = monitors_array
        .iter()
        .filter_map(|monitor| {
            serde_json::from_value(monitor.clone()).ok()
        })
        .collect();
    
    if monitors.is_empty() {
        return Err("No monitors found".to_string());
    }
    
    debug!("Found {} monitors", monitors.len());
    Ok(monitors)
}

#[tauri::command]
#[specta::specta]
pub async fn get_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorDevice>, String> {
    get_available_monitors(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_screenpipe(
    state: State<'_, SidecarState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Killing screenpipe");

    #[cfg(target_os = "macos")]
    {
        let mut manager = state.0.lock().await;
        if let Some(manager) = manager.as_mut() {
            if let Some(child) = manager.child.take() {
                if let Err(e) = child.kill() {
                    error!("Failed to kill child process: {}", e);
                }
            }
        }
        // Use pgrep + kill instead of pkill -f to avoid killing screenpipe-app
        // -x matches exact process name, so "screenpipe" won't match "screenpipe-app"
        let command = "pgrep -x screenpipe | xargs -r kill -9 2>/dev/null || true";
        match tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .output()
            .await
        {
            Ok(_) => {
                debug!("Successfully killed screenpipe sidecar processes");
                Ok(())
            }
            Err(e) => {
                error!("Failed to kill screenpipe processes: {}", e);
                Err(format!("Failed to kill screenpipe processes: {}", e))
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

        // Try taskkill directly first (most reliable, doesn't depend on PowerShell)
        let taskkill_result = tokio::process::Command::new("taskkill")
            .args(["/F", "/T", "/IM", "screenpipe.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await;

        match taskkill_result {
            Ok(output) => {
                // taskkill returns success even if process wasn't found, check stderr for real errors
                let stderr = String::from_utf8_lossy(&output.stderr);
                if output.status.success() || stderr.contains("not found") || stderr.contains("ERROR: The process") {
                    debug!("Successfully killed screenpipe processes (or none were running)");
                    return Ok(());
                }
                debug!("taskkill completed with output: {:?}", stderr);
                Ok(())
            }
            Err(e) => {
                warn!("taskkill failed: {}, trying cmd.exe fallback", e);

                // Fallback: try via cmd.exe
                match tokio::process::Command::new("cmd")
                    .args(["/C", "taskkill", "/F", "/T", "/IM", "screenpipe.exe"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                    .await
                {
                    Ok(_) => {
                        debug!("Successfully killed screenpipe processes via cmd.exe fallback");
                        Ok(())
                    }
                    Err(e2) => {
                        error!("All methods to kill screenpipe processes failed. taskkill: {}, cmd: {}", e, e2);
                        // Don't fail hard - the process might not be running anyway
                        warn!("Continuing despite kill failure - process may not be running");
                        Ok(())
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // -15 from gnu man page
        // ref: https://www.gnu.org/software/coreutils/manual/html_node/kill-invocation.html
        let command = format!(
            "pgrep -x screenpipe | xargs -I {{}} kill -15 {{}}",
        );
        match tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .output()
            .await
        {
            Ok(_) => {
                debug!("Successfully killed screenpipe processes");
                Ok(())
            }
            Err(e) => {
                error!("Failed to kill screenpipe processes: {}", e);
                Err(format!("Failed to kill screenpipe processes: {}", e))
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn spawn_screenpipe(
    state: tauri::State<'_, SidecarState>,
    app: tauri::AppHandle,
    override_args: Option<Vec<String>>,
) -> Result<(), String> {
    // Check permissions before spawning
    let permissions_check = do_permissions_check(false);
    let store = app.state::<SettingsStore>();
    let disable_audio = store.disable_audio;
    
    // Always check screen recording permission - this is required and needs restart
    if !permissions_check.screen_recording.permitted() {
        warn!("Screen recording permission not granted: {:?}. Cannot spawn screenpipe.", permissions_check.screen_recording);
        return Err("Screen recording permission required. Please grant permission through settings and restart the app.".to_string());
    }
    
    // Check microphone permission if audio recording is enabled - but don't block startup
    if !disable_audio && !permissions_check.microphone.permitted() {
        warn!("Microphone permission not granted and audio recording is enabled: {:?}. Audio recording will not work until permission is granted.", permissions_check.microphone);
        // Continue with spawn - microphone permission can be granted at runtime
    }
    
    info!("Screen recording permission granted for manual spawn. Audio disabled: {}, microphone permission: {:?}", disable_audio, permissions_check.microphone);
    
    let mut manager = state.0.lock().await;
    if manager.is_none() {
        *manager = Some(SidecarManager::new());
    }
    if let Some(manager) = manager.as_mut() {
        manager.spawn(&app, override_args).await
    } else {
        debug!("Sidecar already running");
        Ok(())
    }
}

async fn spawn_sidecar(app: &tauri::AppHandle, override_args: Option<Vec<String>>) -> Result<CommandChild, String> {
    let store = app.state::<SettingsStore>();

    let audio_transcription_engine = store.audio_transcription_engine.clone();

    let ocr_engine = store.ocr_engine.clone();

    let monitor_ids = store.monitor_ids.clone();



    let audio_devices = store.audio_devices.clone();

    let use_pii_removal = store.use_pii_removal;

    let port = store.port;

    let disable_audio = store.disable_audio;

    let ignored_windows = store.ignored_windows.clone();

    let included_windows = store.included_windows.clone();

    let ignored_urls = store.ignored_urls.clone();

    let deepgram_api_key = store.deepgram_api_key.clone();

    let fps = store.fps;

    let dev_mode = store
        .dev_mode;

    let vad_sensitivity = store.vad_sensitivity.clone();

    let audio_chunk_duration = store.audio_chunk_duration;

    let telemetry_enabled = store
        .analytics_enabled;

    let use_chinese_mirror = store
        .use_chinese_mirror;

    let languages = store.languages.clone();

    let enable_beta = store
        .enable_beta;

    let enable_frame_cache = store
        .enable_frame_cache;


    let data_dir = store.data_dir.clone();

    let enable_realtime_audio_transcription = store
        .enable_realtime_audio_transcription;

    let enable_realtime_vision = store
        .enable_realtime_vision;

    let _use_all_monitors = store
        .use_all_monitors;

    let analytics_id = store.analytics_id.clone();

    let user = User::from_store(&store);

    println!("user: {:?}", user);
    println!("audio_chunk_duration: {}", audio_chunk_duration);

    let port_str = port.to_string();
    let mut args = vec!["--port", port_str.as_str()];
    let fps_str = fps.to_string();
    // Needs to be declared here for lifetime (used by args.push below)
    #[allow(unused_assignments)]
    let mut monitor_id_str = String::new();
    if fps != 0.2 {
        args.push("--fps");
        args.push(fps_str.as_str());
    }

    if audio_transcription_engine != "default" {
        args.push("--audio-transcription-engine");
        let model = if audio_transcription_engine == "screenpipe-cloud" {
            "deepgram"
        } else {
            audio_transcription_engine.as_str()
        };
        args.push(model);
    }

    if ocr_engine != "default" {
        args.push("--ocr-engine");
        let model = ocr_engine.as_str();
        args.push(model);
    }
    if !monitor_ids.is_empty() {
        if monitor_ids.contains(&"default".to_string()) {
            // Get the default monitor and use its ID
            match get_available_monitors(app).await {
                Ok(monitors) => {
                    if let Some(default_monitor) = monitors.iter().find(|m| m.is_default) {
                        monitor_id_str = default_monitor.id.to_string();
                        args.push("--monitor-id");
                        args.push(&monitor_id_str);
                    } else if let Some(first_monitor) = monitors.first() {
                        // Fallback to first monitor if no default is found
                        monitor_id_str = first_monitor.id.to_string();
                        args.push("--monitor-id");
                        args.push(&monitor_id_str);
                    }
                }
                Err(e) => {
                    error!("Failed to get default monitor: {}", e);
                    // Continue without monitor specification
                }
            }
        } else {
            // Use specific monitor IDs
            for monitor in &monitor_ids {
                args.push("--monitor-id");
                args.push(monitor.as_str());
            }
        }
    }

    if !languages.is_empty() && languages[0] != Value::String("default".to_string()) {
        for language in &languages {
            args.push("--language");
            args.push(language.as_str());
        }
    }

    if deepgram_api_key != "default" && deepgram_api_key != "" {
        args.push("--deepgram-api-key");
        let key = deepgram_api_key.as_str();
        args.push(key);
    }

    if !audio_devices.is_empty() && audio_devices[0] != Value::String("default".to_string()) {
        for device in &audio_devices {
            args.push("--audio-device");
            args.push(device.as_str());
        }
    }

    if use_pii_removal {
        args.push("--use-pii-removal");
    }

    if disable_audio {
        args.push("--disable-audio");
    }

    if !ignored_windows.is_empty() {
        for window in &ignored_windows {
            args.push("--ignored-windows");
            args.push(window.as_str());
        }
    }

    if !included_windows.is_empty() {
        for window in &included_windows {
            args.push("--included-windows");
            args.push(window.as_str());
        }
    }

    if !ignored_urls.is_empty() {
        for url in &ignored_urls {
            args.push("--ignored-urls");
            args.push(url.as_str());
        }
    }

    let current_pid = std::process::id();
    let current_pid_str = current_pid.to_string();
    // Set auto-destruct PID if not in dev mode
    if !dev_mode {
        args.push("--auto-destruct-pid");
        args.push(current_pid_str.as_str());
    }

    if vad_sensitivity != "high" {
        args.push("--vad-sensitivity");
        args.push(vad_sensitivity.as_str());
    }

    let audio_chunk_duration_str = audio_chunk_duration.to_string();
    if audio_chunk_duration != 30 {
        args.push("--audio-chunk-duration");
        args.push(audio_chunk_duration_str.as_str());
    }

    if !telemetry_enabled {
        args.push("--disable-telemetry");
    }

    if enable_beta {
        args.push("--enable-beta");
    }

    if enable_frame_cache {
        args.push("--enable-frame-cache");
    }

    if data_dir != "default" && !data_dir.is_empty() {
        args.push("--data-dir");
        args.push(data_dir.as_str());
    }

    if enable_realtime_audio_transcription {
        args.push("--enable-realtime-audio-transcription");
    }

    if enable_realtime_vision {
        args.push("--enable-realtime-vision");
    }

    // if use_all_monitors {
    //     args.push("--use-all-monitors");
    // }

    let disable_vision = store
        .disable_vision;

    if disable_vision {
        args.push("--disable-vision");
    }

    // args.push("--debug");

    let override_args_as_vec = override_args.unwrap_or_default();

    if cfg!(windows) {
        let mut c = app.shell().sidecar("screenpipe").unwrap();

        // Set file descriptor limit to prevent "Too many open files" errors
        c = c.env("SCREENPIPE_FD_LIMIT", "8192");

        if use_chinese_mirror {
            c = c.env("HF_ENDPOINT", "https://hf-mirror.com");
        }

        // Use screenpipe cloud proxy when screenpipe-cloud engine is selected
        if audio_transcription_engine == "screenpipe-cloud" && user.id.is_some() {
            c = c.env(
                "DEEPGRAM_API_URL",
                "https://api.screenpi.pe/v1/listen",
            );
            c = c.env("DEEPGRAM_WEBSOCKET_URL", "wss://api.screenpi.pe");
            c = c.env("CUSTOM_DEEPGRAM_API_TOKEN", user.id.as_ref().unwrap());
            args.push("--deepgram-api-key");
            args.push(user.id.as_ref().unwrap());
        }

        c = c.env("SENTRY_RELEASE_NAME_APPEND", "tauri");
        c = c.env("SCREENPIPE_ANALYTICS_ID", &analytics_id);

        // only supports --enable-realtime-vision for now, avoid adding if already present
        if !args.contains(&"--enable-realtime-vision") && override_args_as_vec.contains(&"--enable-realtime-vision".to_string()) {
            args.extend(override_args_as_vec.iter().map(|s| s.as_str()));
        }
        let c = c.args(&args);

        let (_, child) = c.spawn().map_err(|e| {
            error!("Failed to spawn sidecar: {}", e);
            e.to_string()
        })?;

        info!("Spawned sidecar with args: {:?}", args);

        return Ok(child);
    }

    let mut c = app.shell().sidecar("screenpipe").unwrap();

    // Set file descriptor limit to prevent "Too many open files" errors
    // This is especially important for WebSocket connections and video processing
    c = c.env("SCREENPIPE_FD_LIMIT", "8192");

    if use_chinese_mirror {
        c = c.env("HF_ENDPOINT", "https://hf-mirror.com");
    }

    // Use screenpipe cloud proxy when screenpipe-cloud engine is selected
    if audio_transcription_engine == "screenpipe-cloud" && user.id.is_some() {
        info!(
            "Using screenpipe cloud with user id: {:?}",
            user.id.as_ref().unwrap()
        );
        c = c.env(
            "DEEPGRAM_API_URL",
            "https://api.screenpi.pe/v1/listen",
        );
        c = c.env("DEEPGRAM_WEBSOCKET_URL", "wss://api.screenpi.pe");
        c = c.env("CUSTOM_DEEPGRAM_API_TOKEN", user.id.as_ref().unwrap());
        args.push("--deepgram-api-key");
        args.push(user.id.as_ref().unwrap());
    }

    c = c.env("SENTRY_RELEASE_NAME_APPEND", "tauri");
    c = c.env("SCREENPIPE_ANALYTICS_ID", &analytics_id);

    // only supports --enable-realtime-vision for now, avoid adding if already present
    if !args.contains(&"--enable-realtime-vision") && override_args_as_vec.contains(&"--enable-realtime-vision".to_string()) {
        args.extend(override_args_as_vec.iter().map(|s| s.as_str()));
    }
    let c = c.args(&args);

    let result = c.spawn();
    if let Err(e) = result {
        error!("Failed to spawn sidecar: {}", e);
        return Err(e.to_string());
    }

    let (mut rx, child) = result.unwrap();
    let app_handle = app.app_handle().clone();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let log_line = String::from_utf8(line).unwrap();
                    print!("{}", log_line);
                    app_handle.emit("sidecar_log", log_line).unwrap();
                }
                CommandEvent::Stderr(line) => {
                    let log_line = String::from_utf8(line).unwrap();
                    error!("Sidecar stderr: {}", log_line);
                    app_handle
                        .emit("sidecar_log", format!("ERROR: {}", log_line))
                        .unwrap();
                }
                _ => {}
            }
        }
    });

    info!("Spawned sidecar with args: {:?}", args);

    Ok(child)
}
pub struct SidecarManager {
    child: Option<CommandChild>,
    dev_mode: Arc<Mutex<bool>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: None,
            dev_mode: Arc::new(Mutex::new(false)),
        }
    }

    pub async fn spawn(&mut self, app: &tauri::AppHandle, override_args: Option<Vec<String>>) -> Result<(), String> {
        info!("Spawning sidecar with override args: {:?}", override_args);

        // Check if sidecar is already running
        if self.child.is_some() {
            info!("Sidecar already running, skipping spawn");
            return Ok(());
        }

        // Update settings from store first to get audio settings
        self.update_settings(app).await?;
        
        // Check permissions before spawning
        let permissions_check = do_permissions_check(false);
        let store = app.state::<SettingsStore>();
        let disable_audio = store.disable_audio;
        
        // Always check screen recording permission - this is required and needs restart
        if !permissions_check.screen_recording.permitted() {
            warn!("Screen recording permission not granted: {:?}. Cannot spawn sidecar.", permissions_check.screen_recording);
            return Err("Screen recording permission required. Please grant permission through settings and restart the app.".to_string());
        }
        
        // Check microphone permission if audio recording is enabled - but don't block startup
        if !disable_audio && !permissions_check.microphone.permitted() {
            warn!("Microphone permission not granted and audio recording is enabled: {:?}. Audio recording will not work until permission is granted.", permissions_check.microphone);
            // Continue with spawn - microphone permission can be granted at runtime
        }
        
        info!("Screen recording permission granted, proceeding with sidecar spawn. Audio disabled: {}, microphone permission: {:?}", disable_audio, permissions_check.microphone);

        // Spawn the sidecar
        let child = spawn_sidecar(app, override_args).await?;
        self.child = Some(child);

        Ok(())
    }

    async fn update_settings(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        let store = get_store(app, None).unwrap();

        let dev_mode = store
            .get("devMode")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        debug!("dev_mode: {}", dev_mode);

        *self.dev_mode.lock().await = dev_mode;

        Ok(())
    }
}
