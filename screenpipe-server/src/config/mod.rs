use screenpipe_core::Language;
use screenpipe_vision::OcrEngine;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

/// Configuration for video/vision recording
#[derive(Clone)]
pub struct RecordingConfig {
    pub fps: f64,
    pub video_chunk_duration: Duration,
    pub output_path: PathBuf,
    pub use_pii_removal: bool,
    pub languages: Vec<Language>,
}

impl RecordingConfig {
    pub fn new(
        fps: f64,
        video_chunk_duration: Duration,
        output_path: PathBuf,
        use_pii_removal: bool,
        languages: Vec<Language>,
    ) -> Self {
        let fps = if fps.is_finite() && fps > 0.0 {
            fps
        } else {
            1.0
        };

        Self {
            fps,
            video_chunk_duration,
            output_path,
            use_pii_removal,
            languages,
        }
    }

    pub fn output_path_str(&self) -> String {
        self.output_path.to_string_lossy().into_owned()
    }
}

/// Configuration for vision/screen capture
#[derive(Clone)]
pub struct VisionConfig {
    pub enabled: bool,
    pub monitor_ids: Vec<u32>,
    pub ocr_engine: Arc<OcrEngine>,
    pub ignored_windows: Vec<String>,
    pub included_windows: Vec<String>,
    pub capture_unfocused_windows: bool,
    pub enable_realtime: bool,
}

impl VisionConfig {
    pub fn new(
        enabled: bool,
        monitor_ids: Vec<u32>,
        ocr_engine: Arc<OcrEngine>,
        ignored_windows: Vec<String>,
        included_windows: Vec<String>,
        capture_unfocused_windows: bool,
        enable_realtime: bool,
    ) -> Self {
        Self {
            enabled,
            monitor_ids,
            ocr_engine,
            ignored_windows,
            included_windows,
            capture_unfocused_windows,
            enable_realtime,
        }
    }
}

/// Configuration for server settings
#[derive(Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub enable_telemetry: bool,
    pub enable_frame_cache: bool,
    pub enable_pipe_manager: bool,
    pub auto_destruct_pid: Option<u32>,
}

impl ServerConfig {
    pub fn new(
        port: u16,
        enable_telemetry: bool,
        enable_frame_cache: bool,
        enable_pipe_manager: bool,
        auto_destruct_pid: Option<u32>,
    ) -> Self {
        Self {
            port,
            enable_telemetry,
            enable_frame_cache,
            enable_pipe_manager,
            auto_destruct_pid,
        }
    }
}

/// Captures configuration for vision-related options used in VideoCapture
#[derive(Clone)]
pub struct VideoCaptureConfig {
    pub output_path: String,
    pub fps: f64,
    pub video_chunk_duration: Duration,
    pub ocr_engine: Arc<OcrEngine>,
    pub monitor_id: u32,
    pub ignored_windows: Vec<String>,
    pub included_windows: Vec<String>,
    pub languages: Vec<Language>,
    pub capture_unfocused_windows: bool,
}

impl VideoCaptureConfig {
    pub fn new(
        output_path: String,
        fps: f64,
        video_chunk_duration: Duration,
        ocr_engine: Arc<OcrEngine>,
        monitor_id: u32,
        ignored_windows: Vec<String>,
        included_windows: Vec<String>,
        languages: Vec<Language>,
        capture_unfocused_windows: bool,
    ) -> Self {
        Self {
            output_path,
            fps,
            video_chunk_duration,
            ocr_engine,
            monitor_id,
            ignored_windows,
            included_windows,
            languages,
            capture_unfocused_windows,
        }
    }

    /// Create from recording and vision configs for a specific monitor
    pub fn from_configs(
        recording: &RecordingConfig,
        vision: &VisionConfig,
        monitor_id: u32,
    ) -> Self {
        Self {
            output_path: recording.output_path_str(),
            fps: recording.fps,
            video_chunk_duration: recording.video_chunk_duration,
            ocr_engine: vision.ocr_engine.clone(),
            monitor_id,
            ignored_windows: vision.ignored_windows.clone(),
            included_windows: vision.included_windows.clone(),
            languages: recording.languages.clone(),
            capture_unfocused_windows: vision.capture_unfocused_windows,
        }
    }
}
