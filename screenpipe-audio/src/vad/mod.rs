pub mod silero;
pub mod webrtc;

use anyhow;
use lazy_static::lazy_static;
use silero::SileroVad;
use std::path::PathBuf;
use std::sync::Once;
use tokio::sync::Mutex;
use vad_rs::VadStatus;
use webrtc::WebRtcVad;

#[derive(Clone, Copy, Debug, Default)]
pub enum VadSensitivity {
    Low,
    #[default]
    Medium,
    High,
}

impl VadSensitivity {
    pub fn min_speech_ratio(&self) -> f32 {
        match self {
            VadSensitivity::Low => 0.01,    // 1% of frames must be speech
            VadSensitivity::Medium => 0.05, // 5% of frames must be speech
            VadSensitivity::High => 0.2,    // 20% of frames must be speech
        }
    }
}

#[derive(Clone)]
pub enum VadEngineEnum {
    WebRtc,
    Silero,
}

pub trait VadEngine: Send {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool>;
    fn set_sensitivity(&mut self, sensitivity: VadSensitivity);
    fn audio_type(&mut self, audio_chunk: &[f32]) -> anyhow::Result<VadStatus>;
    fn get_min_speech_ratio(&self) -> f32;
}

const FRAME_HISTORY: usize = 10; // Number of frames to consider for decision
const SPEECH_THRESHOLD: f32 = 0.5;
const SILENCE_THRESHOLD: f32 = 0.35;
const SPEECH_FRAME_THRESHOLD: usize = 3; // Minimum number of frames above SPEECH_THRESHOLD to consider as speech

lazy_static! {
    static ref MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

static DOWNLOAD_ONCE: Once = Once::new();

pub async fn create_vad_engine(engine: VadEngineEnum) -> anyhow::Result<Box<dyn VadEngine>> {
    match engine {
        VadEngineEnum::WebRtc => Ok(Box::new(WebRtcVad::new())),
        VadEngineEnum::Silero => {
            let silero_vad = SileroVad::new().await?;
            Ok(Box::new(silero_vad))
        }
    }
}

unsafe impl Send for WebRtcVad {}
unsafe impl Send for SileroVad {}
