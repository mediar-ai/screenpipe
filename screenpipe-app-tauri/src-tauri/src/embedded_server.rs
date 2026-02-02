// Embedded screenpipe server
// Runs the screenpipe server directly in the Tauri process

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use screenpipe_audio::audio_manager::AudioManagerBuilder;
use screenpipe_audio::core::device::{default_input_device, default_output_device, parse_audio_device};
use screenpipe_db::DatabaseManager;
use screenpipe_server::{PipeManager, ResourceMonitor, SCServer, start_continuous_recording};
use screenpipe_vision::OcrEngine;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::store::SettingsStore;

/// Configuration for embedded server
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
            audio_devices: store.audio_devices.clone(),
            ignored_windows: store.ignored_windows.clone(),
            included_windows: store.included_windows.clone(),
            languages: store
                .languages
                .iter()
                .filter(|s| s != &"default")
                .cloned()
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
pub struct EmbeddedServerHandle {
    shutdown_tx: broadcast::Sender<()>,
}

impl EmbeddedServerHandle {
    pub fn shutdown(&self) {
        info!("Shutting down embedded screenpipe server");
        let _ = self.shutdown_tx.send(());
    }
}

/// Start the embedded screenpipe server
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

    // Set up audio devices
    let mut audio_devices = Vec::new();
    if !config.disable_audio {
        if config.audio_devices.is_empty() {
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

    // Shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    let shutdown_tx_clone = shutdown_tx.clone();

    // Get monitor IDs
    let monitor_ids: Vec<u32> = if config.monitor_ids.is_empty()
        || config.monitor_ids.contains(&"default".to_string())
    {
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
        _ => {
            #[cfg(target_os = "macos")]
            { OcrEngine::AppleNative }
            #[cfg(target_os = "windows")]
            { OcrEngine::WindowsNative }
            #[cfg(target_os = "linux")]
            { OcrEngine::Tesseract }
        }
    };

    // Create a runtime handle for vision tasks
    let vision_handle = tokio::runtime::Handle::current();

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
                    false,
                    &vision_handle,
                    &ignored_windows,
                    &included_windows,
                    &[],
                    languages.clone(),
                    false,
                    false,
                    None,
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

    // Start resource monitor
    let resource_monitor = ResourceMonitor::new(config.analytics_enabled);
    resource_monitor.start_monitoring(Duration::from_secs(30), Some(Duration::from_secs(60)));

    // Create pipe manager (disabled)
    let pipe_manager = Arc::new(PipeManager::new(local_data_dir.clone()));

    // Create and start HTTP server
    let server = SCServer::new(
        db.clone(),
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), config.port),
        local_data_dir,
        pipe_manager,
        config.disable_vision,
        config.disable_audio,
        audio_manager.clone(),
        false, // disable pipes
        config.use_pii_removal,
    );

    // Start server in background
    tokio::spawn(async move {
        if let Err(e) = server.start(config.enable_frame_cache).await {
            error!("Server error: {:?}", e);
        }
    });

    info!("Embedded screenpipe server started successfully");

    Ok(EmbeddedServerHandle { shutdown_tx })
}
