use screenpipe_core::Language;
use screenpipe_vision::OcrEngine;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

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
        let fps = if fps.is_finite() && fps > 0.0 { fps } else { 1.0 };
        Self { fps, video_chunk_duration, output_path, use_pii_removal, languages }
    }

    pub fn output_path_str(&self) -> String {
        self.output_path.to_string_lossy().into_owned()
    }
}

#[derive(Clone)]
pub struct VisionConfig {
    pub enabled: bool,
    pub monitor_ids: Vec<u32>,
    pub ocr_engine: Arc<OcrEngine>,
    pub ignored_windows: Vec<String>,
    pub included_windows: Vec<String>,
    pub capture_unfocused_windows: bool,
    pub use_all_monitors: bool,
}

#[derive(Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub enable_telemetry: bool,
    pub enable_frame_cache: bool,
    pub enable_pipe_manager: bool,
    pub auto_destruct_pid: Option<u32>,
}
