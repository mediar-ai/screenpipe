use crate::{get_base_dir, SidecarState};
use serde_json::Value;
use std::env;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::async_runtime::JoinHandle;
use tauri::Emitter;
use tauri::{Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreBuilder;
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{debug, error, info};

#[tauri::command]
pub async fn kill_all_sreenpipes(
    state: State<'_, SidecarState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Killing screenpipe");

    let mut manager = state.0.lock().await;
    if let Some(manager) = manager.as_mut() {
        if let Some(child) = manager.child.take() {
            if let Err(e) = child.kill() {
                error!("Failed to kill child process: {}", e);
            }
        }
    }

    // Hard kill the sidecar
    let kill_result = async {
        #[cfg(not(target_os = "windows"))]
        {
            tokio::process::Command::new("pkill")
                .arg("-f")
                .arg("screenpipe")
                .output()
                .await
        }
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;

            const CREATE_NO_WINDOW: u32 = 0x08000000;
            tokio::process::Command::new("taskkill")
                .args(&["/F", "/IM", "screenpipe.exe"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .await
        }
    }
    .await;

    match kill_result {
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

#[tauri::command]
pub async fn spawn_screenpipe(
    state: tauri::State<'_, SidecarState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut manager = state.0.lock().await;
    if manager.is_none() {
        *manager = Some(SidecarManager::new());
    }
    if let Some(manager) = manager.as_mut() {
        manager.spawn(&app).await
    } else {
        debug!("Sidecar already running");
        Ok(())
    }
}

fn spawn_sidecar(app: &tauri::AppHandle) -> Result<CommandChild, String> {
    let base_dir = get_base_dir(app, None).expect("Failed to ensure local data directory");
    let path = base_dir.join("store.bin");
    let store = StoreBuilder::new(&app.clone(), path).build();

    let audio_transcription_engine = store
        .get("audioTranscriptionEngine")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(String::from("default"));

    let ocr_engine = store
        .get("ocrEngine")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(String::from("default"));

    let monitor_ids = store
        .get("monitorIds")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let audio_devices = store
        .get("audioDevices")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let use_pii_removal = store
        .get("usePiiRemoval")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let port = store.get("port").and_then(|v| v.as_u64()).unwrap_or(3030);

    let disable_audio = store
        .get("disableAudio")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let ignored_windows = store
        .get("ignoredWindows")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let included_windows = store
        .get("includedWindows")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let deepgram_api_key = store
        .get("deepgramApiKey")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(String::from("default"));

    let fps = store.get("fps").and_then(|v| v.as_f64()).unwrap_or(0.2);

    let dev_mode = store
        .get("devMode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let vad_sensitivity = store
        .get("vadSensitivity")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(String::from("high"));

    let audio_chunk_duration = store
        .get("audioChunkDuration")
        .and_then(|v| v.as_u64())
        .unwrap_or(30);

    let telemetry_enabled = store
        .get("analyticsEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let use_chinese_mirror = store
        .get("useChineseMirror")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let languages = store
        .get("languages")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let enable_beta = store
        .get("enableBeta")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let enable_frame_cache = store
        .get("enableFrameCache")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let enable_ui_monitoring = store
        .get("enableUiMonitoring")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    println!("audio_chunk_duration: {}", audio_chunk_duration);

    let port_str = port.to_string();
    let mut args = vec!["--port", port_str.as_str()];
    let fps_str = fps.to_string();
    if fps != 0.2 {
        args.push("--fps");
        args.push(fps_str.as_str());
    }

    if audio_transcription_engine != "default" {
        args.push("--audio-transcription-engine");
        let model = audio_transcription_engine.as_str();
        args.push(model);
    }

    if ocr_engine != "default" {
        args.push("--ocr-engine");
        let model = ocr_engine.as_str();
        args.push(model);
    }

    if !monitor_ids.is_empty() && monitor_ids[0] != Value::String("default".to_string()) {
        for monitor in &monitor_ids {
            args.push("--monitor-id");
            args.push(monitor.as_str().unwrap());
        }
    }

    if !languages.is_empty() && languages[0] != Value::String("default".to_string()) {
        for language in &languages {
            args.push("--language");
            args.push(language.as_str().unwrap());
        }
    }

    if deepgram_api_key != "default" {
        args.push("--deepgram-api-key");
        let key = deepgram_api_key.as_str();
        args.push(key);
    }

    if !audio_devices.is_empty() && audio_devices[0] != Value::String("default".to_string()) {
        for device in &audio_devices {
            args.push("--audio-device");
            args.push(device.as_str().unwrap());
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
            args.push(window.as_str().unwrap());
        }
    }

    if !included_windows.is_empty() {
        for window in &included_windows {
            args.push("--included-windows");
            args.push(window.as_str().unwrap());
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

    if enable_ui_monitoring {
        args.push("--enable-ui-monitoring");
    }

    // Add exe directory path before the Windows-specific block
    let exe_dir = env::current_exe()
        .expect("Failed to get current executable path")
        .parent()
        .expect("Failed to get parent directory of executable")
        .to_path_buf();

    if cfg!(windows) {

        let tessdata_path = exe_dir.join("tessdata");
        let mut c = app
            .shell()
            .sidecar("screenpipe")
            .unwrap()
            .env("TESSDATA_PREFIX", tessdata_path);

        if use_chinese_mirror {
            c = c.env("HF_ENDPOINT", "https://hf-mirror.com");
        }



        let c = c.args(&args);

        let (_, child) = c.spawn().map_err(|e| {
            error!("Failed to spawn sidecar: {}", e);
            e.to_string()
        })?;

        info!("Spawned sidecar with args: {:?}", args);

        return Ok(child);
    }

    let mut command = app.shell().sidecar("screenpipe").unwrap();

    if use_chinese_mirror {
        command = command.env("HF_ENDPOINT", "https://hf-mirror.com");
    }

    let command = command.args(&args);

    let result = command.spawn();
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
    last_restart: Instant,
    restart_interval: Arc<Mutex<Duration>>,
    restart_task: Option<JoinHandle<()>>,
    dev_mode: Arc<Mutex<bool>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: None,
            last_restart: Instant::now(),
            restart_interval: Arc::new(Mutex::new(Duration::from_secs(0))),
            restart_task: None,
            dev_mode: Arc::new(Mutex::new(false)),
        }
    }

    pub async fn spawn(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        // Update settings from store
        self.update_settings(app).await?;

        // Spawn the sidecar
        let child = spawn_sidecar(app)?;
        self.child = Some(child);
        self.last_restart = Instant::now();
        debug!("last_restart: {:?}", self.last_restart);

        // kill previous task if any
        if let Some(task) = self.restart_task.take() {
            task.abort();
        }

        let restart_interval = self.restart_interval.clone();
        // Add this function outside the SidecarManager impl
        async fn check_and_restart_sidecar(app_handle: &tauri::AppHandle) -> Result<(), String> {
            let state = app_handle.state::<SidecarState>();
            let mut manager = state.0.lock().await;
            if let Some(manager) = manager.as_mut() {
                manager.check_and_restart(app_handle).await
            } else {
                Ok(())
            }
        }

        // In the spawn method
        let app_handle = app.app_handle().clone();
        self.restart_task = Some(tauri::async_runtime::spawn(async move {
            loop {
                let interval = *restart_interval.lock().await;
                debug!("interval: {}", interval.as_secs());
                if let Err(e) = check_and_restart_sidecar(&app_handle).await {
                    error!("Failed to check and restart sidecar: {}", e);
                }
                sleep(Duration::from_secs(60)).await;
            }
        }));

        Ok(())
    }

    async fn update_settings(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        let base_dir = get_base_dir(app, None).expect("Failed to ensure local data directory");
        let path = base_dir.join("store.bin");
        let store = StoreBuilder::new(&app.clone(), path).build();

        let restart_interval = store
            .get("restartInterval")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        debug!("restart_interval: {}", restart_interval);

        let dev_mode = store
            .get("devMode")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        debug!("dev_mode: {}", dev_mode);

        *self.restart_interval.lock().await = Duration::from_secs(restart_interval * 60);
        *self.dev_mode.lock().await = dev_mode;

        Ok(())
    }

    pub async fn check_and_restart(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        let interval = *self.restart_interval.lock().await;
        let dev_mode = *self.dev_mode.lock().await;
        debug!("interval: {}", interval.as_secs());
        debug!("last_restart: {:?}", self.last_restart);
        debug!("elapsed: {:?}", self.last_restart.elapsed());
        if interval.as_secs() > 0 && self.last_restart.elapsed() >= interval && !dev_mode {
            debug!("Restarting sidecar due to restart interval");
            if let Some(child) = self.child.take() {
                let _ = child.kill();
            }
            let child = spawn_sidecar(app)?;
            self.child = Some(child);
            self.last_restart = Instant::now();
        }
        Ok(())
    }
}
