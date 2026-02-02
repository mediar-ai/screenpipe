// Embedded screenpipe server for macOS 26+
// This runs the screenpipe server directly in the Tauri process,
// bypassing the TCC permission inheritance issues with sidecar processes.

#[cfg(target_os = "macos")]
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::sync::Arc;
#[cfg(target_os = "macos")]
use std::time::Duration;

#[cfg(target_os = "macos")]
use screenpipe_audio::audio_manager::AudioManagerBuilder;
#[cfg(target_os = "macos")]
use screenpipe_audio::core::device::{default_input_device, default_output_device, parse_audio_device};
#[cfg(target_os = "macos")]
use screenpipe_db::DatabaseManager;
#[cfg(target_os = "macos")]
use screenpipe_server::{PipeManager, ResourceMonitor, SCServer, start_continuous_recording};
#[cfg(target_os = "macos")]
use screenpipe_vision::OcrEngine;
#[cfg(target_os = "macos")]
use tokio::runtime::Runtime;
#[cfg(target_os = "macos")]
use tokio::sync::broadcast;
#[cfg(target_os = "macos")]
use tracing::{debug, error, info, warn};

#[cfg(target_os = "macos")]
use crate::store::SettingsStore;

/// Configuration for embedded server
#[cfg(target_os = "macos")]
#[derive(Clone)]
pub struct EmbeddedServerConfig {
    pub port: u16,
    pub data_dir: PathBuf,
    pub fps: f64,
    pub audio_chunk_duration: u64,
    pub video_chunk_duration: u64,
    pub disable_audio: bool,
    pub disable_vision: bool,
    pub use_pii_removal: bool,
    pub ocr_engine: String,
    pub audio_transcription_engine: String,
    pub monitor_ids: Vec<String>,
    pub audio_devices: Vec<String>,
    pub ignored_windows: Vec<String>,
    pub included_windows: Vec<String>,
    pub languages: Vec<String>,
    pub vad_sensitivity: String,
    pub deepgram_api_key: Option<String>,
    pub enable_frame_cache: bool,
    pub analytics_enabled: bool,
}

#[cfg(target_os = "macos")]
impl EmbeddedServerConfig {
    pub fn from_store(store: &SettingsStore, data_dir: PathBuf) -> Self {
        Self {
            port: store.port,
            data_dir,
            fps: if store.fps > 0.0 { store.fps } else { 1.0 },
            audio_chunk_duration: store.audio_chunk_duration as u64,
            video_chunk_duration: 30,
            disable_audio: store.disable_audio,
            disable_vision: store.disable_vision,
            use_pii_removal: store.use_pii_removal,
            ocr_engine: store.ocr_engine.clone(),
            audio_transcription_engine: store.audio_transcription_engine.clone(),
            monitor_ids: store.monitor_ids.clone(),
            audio_devices: store
                .audio_devices
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect(),
            ignored_windows: store.ignored_windows.clone(),
            included_windows: store.included_windows.clone(),
            languages: store
                .languages
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .filter(|s| s != "default")
                .collect(),
            vad_sensitivity: store.vad_sensitivity.clone(),
            deepgram_api_key: if store.deepgram_api_key.is_empty()
                || store.deepgram_api_key == "default"
            {
                None
            } else {
                Some(store.deepgram_api_key.clone())
            },
            enable_frame_cache: store.enable_frame_cache,
            analytics_enabled: store.analytics_enabled,
        }
    }
}

/// Handle for controlling the embedded server
#[cfg(target_os = "macos")]
pub struct EmbeddedServerHandle {
    shutdown_tx: broadcast::Sender<()>,
    vision_runtime: Option<Runtime>,
    pipes_runtime: Option<Runtime>,
}

#[cfg(target_os = "macos")]
impl EmbeddedServerHandle {
    pub fn shutdown(&mut self) {
        info!("Shutting down embedded screenpipe server");
        let _ = self.shutdown_tx.send(());

        // Drop runtimes to stop all tasks
        if let Some(rt) = self.vision_runtime.take() {
            drop(rt);
        }
        if let Some(rt) = self.pipes_runtime.take() {
            drop(rt);
        }
    }
}

/// Start the embedded screenpipe server
/// This runs the full screenpipe server within the Tauri process
#[cfg(target_os = "macos")]
pub async fn start_embedded_server(
    config: EmbeddedServerConfig,
) -> Result<EmbeddedServerHandle, String> {
    info!("Starting embedded screenpipe server on port {}", config.port);

    let local_data_dir = config.data_dir.clone();

    // Create data directory
    let data_path = local_data_dir.join("data");
    std::fs::create_dir_all(&data_path).map_err(|e| format!("Failed to create data dir: {}", e))?;

    // Initialize database
    let db_path = format!("{}/db.sqlite", local_data_dir.to_string_lossy());
    let db = Arc::new(
        DatabaseManager::new(&db_path)
            .await
            .map_err(|e| format!("Failed to initialize database: {}", e))?,
    );
    info!("Database initialized at {}", db_path);

    // Initialize pipe manager
    let pipe_manager = Arc::new(PipeManager::new(local_data_dir.clone()));

    // Set up audio devices
    let mut audio_devices = Vec::new();
    if !config.disable_audio {
        if config.audio_devices.is_empty() {
            // Use default devices
            if let Ok(input) = default_input_device() {
                audio_devices.push(input.to_string());
            }
            if let Ok(output) = default_output_device().await {
                audio_devices.push(output.to_string());
            }
        } else {
            for d in &config.audio_devices {
                if let Ok(device) = parse_audio_device(d) {
                    audio_devices.push(device.to_string());
                }
            }
        }
        if audio_devices.is_empty() {
            warn!("No audio devices available");
        }
    }

    // Build audio manager
    let audio_manager = AudioManagerBuilder::new()
        .audio_chunk_duration(Duration::from_secs(config.audio_chunk_duration))
        .vad_engine(screenpipe_audio::vad_engine::VadEngineEnum::Silero)
        .vad_sensitivity(match config.vad_sensitivity.as_str() {
            "low" => screenpipe_audio::vad_engine::VadSensitivity::Low,
            "medium" => screenpipe_audio::vad_engine::VadSensitivity::Medium,
            _ => screenpipe_audio::vad_engine::VadSensitivity::High,
        })
        .languages(config.languages.clone())
        .transcription_engine(match config.audio_transcription_engine.as_str() {
            "deepgram" | "screenpipe-cloud" => {
                screenpipe_audio::transcription::AudioTranscriptionEngine::Deepgram
            }
            _ => screenpipe_audio::transcription::AudioTranscriptionEngine::WhisperLargeV3Turbo,
        })
        .enabled_devices(audio_devices.clone())
        .deepgram_api_key(config.deepgram_api_key.clone())
        .output_path(data_path.clone())
        .build(db.clone())
        .await
        .map_err(|e| format!("Failed to build audio manager: {}", e))?;

    let audio_manager = Arc::new(audio_manager);

    // Create runtimes for vision and pipes
    let vision_runtime =
        Runtime::new().map_err(|e| format!("Failed to create vision runtime: {}", e))?;
    let pipes_runtime =
        Runtime::new().map_err(|e| format!("Failed to create pipes runtime: {}", e))?;

    let vision_handle = vision_runtime.handle().clone();
    let pipes_handle = pipes_runtime.handle().clone();

    // Shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    let shutdown_tx_clone = shutdown_tx.clone();

    // Get monitor IDs
    let monitor_ids: Vec<u32> = if config.monitor_ids.is_empty()
        || config.monitor_ids.contains(&"default".to_string())
    {
        // Use all monitors
        let monitors = screenpipe_vision::monitor::list_monitors().await;
        monitors.iter().map(|m| m.id()).collect()
    } else {
        config
            .monitor_ids
            .iter()
            .filter_map(|s| s.parse().ok())
            .collect()
    };

    // Parse OCR engine
    let ocr_engine: OcrEngine = match config.ocr_engine.as_str() {
        "tesseract" => OcrEngine::Tesseract,
        "windows-native" => OcrEngine::WindowsNative,
        "unstructured" => OcrEngine::Unstructured,
        _ => OcrEngine::AppleNative, // Default for macOS
    };

    // Start continuous recording
    if !config.disable_vision {
        let db_clone = db.clone();
        let output_path = Arc::new(data_path.to_string_lossy().into_owned());
        let fps = config.fps;
        let video_chunk_duration = Duration::from_secs(config.video_chunk_duration);
        let ocr_engine = Arc::new(ocr_engine);
        let use_pii_removal = config.use_pii_removal;
        let ignored_windows = config.ignored_windows.clone();
        let included_windows = config.included_windows.clone();
        let languages = config.languages.clone();

        let shutdown_rx = shutdown_tx_clone.subscribe();
        let vision_handle_clone = vision_handle.clone();

        tokio::spawn(async move {
            let mut shutdown_rx = shutdown_rx;
            loop {
                let recording_future = start_continuous_recording(
                    db_clone.clone(),
                    output_path.clone(),
                    fps,
                    video_chunk_duration,
                    ocr_engine.clone(),
                    monitor_ids.clone(),
                    use_pii_removal,
                    false, // disable_vision = false (we're in !disable_vision block)
                    &vision_handle_clone,
                    &ignored_windows,
                    &included_windows,
                    &[], // ignored_urls
                    languages.clone(),
                    false, // capture_unfocused_windows
                    false, // realtime_vision
                    None,  // activity_feed
                );

                tokio::select! {
                    result = recording_future => {
                        if let Err(e) = result {
                            error!("Continuous recording error: {:?}", e);
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        info!("Received shutdown signal for vision recording");
                        break;
                    }
                }
            }
        });
    }

    // Start audio recording
    if !config.disable_audio {
        let audio_manager_clone = audio_manager.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if let Err(e) = audio_manager_clone.start().await {
                error!("Failed to start audio manager: {}", e);
            }
        });
    }

    // Start pipes
    let pipes = pipe_manager.list_pipes().await;
    for pipe in pipes {
        if !pipe.enabled {
            continue;
        }
        match pipe_manager.start_pipe_task(pipe.id.clone()).await {
            Ok(future) => {
                pipes_handle.spawn(future);
            }
            Err(e) => {
                error!("Failed to start pipe {}: {}", pipe.id, e);
            }
        }
    }

    // Start resource monitor
    let resource_monitor = ResourceMonitor::new(config.analytics_enabled);
    resource_monitor.start_monitoring(Duration::from_secs(30), Some(Duration::from_secs(60)));

    // Create and start HTTP server
    let server = SCServer::new(
        db.clone(),
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), config.port),
        local_data_dir,
        pipe_manager,
        config.disable_vision,
        config.disable_audio,
        audio_manager.clone(),
        true,  // enable_pipe_manager
        config.use_pii_removal,
    );

    // Start server in background
    tokio::spawn(async move {
        if let Err(e) = server.start(config.enable_frame_cache).await {
            error!("Server error: {:?}", e);
        }
    });

    info!("Embedded screenpipe server started successfully");

    Ok(EmbeddedServerHandle {
        shutdown_tx,
        vision_runtime: Some(vision_runtime),
        pipes_runtime: Some(pipes_runtime),
    })
}

/// Check if we should use embedded server (macOS 26+)
#[cfg(target_os = "macos")]
pub fn should_use_embedded_server() -> bool {
    // Check macOS version - 26.0 (Tahoe) or later
    let version = macos_version();
    if let Some((major, _, _)) = version {
        return major >= 26;
    }
    false
}

#[cfg(target_os = "macos")]
fn macos_version() -> Option<(u32, u32, u32)> {
    use std::process::Command;

    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;

    let version_str = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = version_str.trim().split('.').collect();

    let major = parts.first()?.parse().ok()?;
    let minor = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);

    Some((major, minor, patch))
}

// Stub implementations for non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub fn should_use_embedded_server() -> bool {
    false
}
