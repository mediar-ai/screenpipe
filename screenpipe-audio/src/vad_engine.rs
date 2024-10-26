use crate::constants::CONFIG;
use anyhow;
use dirs;
use lazy_static::lazy_static;
use log::debug;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Once;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::info;
use vad_rs::{Vad, VadStatus};

#[derive(Clone, Copy, Debug)]
pub enum VadSensitivity {
    Low,
    Medium,
    High,
}

impl VadSensitivity {
    pub fn min_speech_ratio(&self) -> f32 {
        match self {
            VadSensitivity::Low => CONFIG.vad_sensitivity_low_speech_ratio,
            VadSensitivity::Medium => CONFIG.vad_sensitivity_medium_speech_ratio,
            VadSensitivity::High => CONFIG.vad_sensitivity_high_speech_ratio,
        }
    }
}

pub enum VadEngineEnum {
    Silero,
}

#[derive(Debug, PartialEq)]
pub enum SpeechBoundary {
    Start,
    End,
    Continuing,
    Silence,
}

lazy_static! {
    static ref MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

static DOWNLOAD_ONCE: Once = Once::new();

pub trait VadEngine: Send {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool>;
    fn set_sensitivity(&mut self, sensitivity: VadSensitivity);
    fn audio_type(&mut self, audio_chunk: &[f32]) -> anyhow::Result<VadStatus>;
    fn get_min_speech_ratio(&self) -> f32;
    fn detect_speech_boundaries(&mut self, audio_chunk: &[f32]) -> anyhow::Result<SpeechBoundary>;
}

pub struct SileroVad {
    vad: Vad,
    prob_history: VecDeque<f32>,
    sensitivity: VadSensitivity,
    speech_start_time: Option<Instant>,
    last_speech_time: Option<Instant>,
    speech_duration: Duration,
    silence_duration: Duration,
}

impl SileroVad {
    pub async fn new() -> anyhow::Result<Self> {
        info!("initializing SileroVad...");
        let model_path = Self::get_or_download_model().await?;
        info!("silero vad model downloaded to: {:?}", model_path);
        let vad = Vad::new(model_path, 16000).map_err(|e| {
            debug!("silero vad error creating vad: {}", e);
            anyhow::anyhow!("vad creation error: {}", e)
        })?;
        info!("silero vad initialized successfully");
        Ok(Self {
            vad,
            prob_history: VecDeque::with_capacity(CONFIG.frame_history),
            sensitivity: VadSensitivity::Medium,
            speech_start_time: None,
            last_speech_time: None,
            speech_duration: Duration::from_millis(0),
            silence_duration: Duration::from_millis(0),
        })
    }

    async fn get_or_download_model() -> anyhow::Result<PathBuf> {
        let mut model_path = MODEL_PATH.lock().await;
        if let Some(path) = model_path.as_ref() {
            return Ok(path.clone());
        }

        let cache_dir = Self::get_cache_dir()?;
        let path = cache_dir.join("silero_vad.onnx");

        if path.exists() {
            *model_path = Some(path.clone());
            return Ok(path);
        }

        DOWNLOAD_ONCE.call_once(|| {
            tokio::spawn(async move {
                if let Err(e) = Self::download_model().await {
                    debug!("error downloading silerovad model: {}", e);
                }
            });
        });

        // wait for download to complete
        while !path.exists() {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        *model_path = Some(path.clone());
        Ok(path)
    }

    async fn download_model() -> anyhow::Result<()> {
        debug!("downloading silerovad model...");
        let url =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";
        let response = reqwest::get(url).await?;
        let model_data = response.bytes().await?;

        let cache_dir = Self::get_cache_dir()?;
        tokio::fs::create_dir_all(&cache_dir).await?;
        let path = cache_dir.join("silero_vad.onnx");

        let mut file = tokio::fs::File::create(&path).await?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &model_data).await?;
        debug!("silerovad model downloaded and saved to: {:?}", path);

        Ok(())
    }

    fn get_cache_dir() -> anyhow::Result<PathBuf> {
        let proj_dirs =
            dirs::cache_dir().ok_or_else(|| anyhow::anyhow!("failed to get cache dir"))?;
        Ok(proj_dirs.join("screenpipe").join("vad"))
    }

    fn update_status(&mut self, prob: f32) -> VadStatus {
        self.prob_history.push_back(prob);
        if self.prob_history.len() > CONFIG.frame_history {
            self.prob_history.pop_front();
        }

        let speech_frames = self
            .prob_history
            .iter()
            .filter(|&&p| p > CONFIG.speech_threshold)
            .count();
        let silence_frames = self
            .prob_history
            .iter()
            .filter(|&&p| p < CONFIG.silence_threshold)
            .count();

        if speech_frames >= CONFIG.speech_frame_threshold {
            VadStatus::Speech
        } else if silence_frames > self.prob_history.len() / 2 {
            VadStatus::Silence
        } else {
            VadStatus::Unknown
        }
    }

    fn get_threshold(&self) -> f32 {
        match self.sensitivity {
            VadSensitivity::Low => CONFIG.vad_sensitivity_low_threshold,
            VadSensitivity::Medium => CONFIG.vad_sensitivity_medium_threshold,
            VadSensitivity::High => CONFIG.vad_sensitivity_high_threshold,
        }
    }

    fn update_speech_state(&mut self, is_speech: bool) -> SpeechBoundary {
        let now = Instant::now();

        if is_speech {
            if self.speech_start_time.is_none() {
                self.speech_start_time = Some(now);
            }
            self.last_speech_time = Some(now);
            self.speech_duration += Duration::from_millis(100);
            self.silence_duration = Duration::from_millis(0);

            if self.speech_duration > Duration::from_millis(CONFIG.speech_duration_threshold_ms) {
                SpeechBoundary::Start
            } else {
                SpeechBoundary::Continuing
            }
        } else {
            if let Some(last_speech) = self.last_speech_time {
                self.silence_duration = now.duration_since(last_speech);
                if self.silence_duration
                    > Duration::from_millis(CONFIG.silence_duration_threshold_ms)
                {
                    self.speech_start_time = None;
                    self.last_speech_time = None;
                    self.speech_duration = Duration::from_millis(0);
                    SpeechBoundary::End
                } else {
                    SpeechBoundary::Continuing
                }
            } else {
                SpeechBoundary::Silence
            }
        }
    }
}

impl VadEngine for SileroVad {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool> {
        let mut chunk_data: Vec<f32> = audio_chunk.to_vec();
        chunk_data.resize(CONFIG.chunk_size, 0.0);
        let result = self.vad.compute(&chunk_data).map_err(|e| {
            debug!("SileroVad Error computing VAD: {}", e);
            anyhow::anyhow!("Vad compute error: {}", e)
        })?;

        let status = self.update_status(result.prob);

        Ok(status == VadStatus::Speech && result.prob > self.get_threshold())
    }

    fn audio_type(&mut self, audio_chunk: &[f32]) -> anyhow::Result<VadStatus> {
        let mut chunk_data: Vec<f32> = audio_chunk.to_vec();
        chunk_data.resize(CONFIG.chunk_size, 0.0);
        let result = self.vad.compute(&chunk_data).map_err(|e| {
            debug!("SileroVad Error computing VAD: {}", e);
            anyhow::anyhow!("Vad compute error: {}", e)
        })?;

        let status = self.update_status(result.prob);

        if status == VadStatus::Speech && result.prob > self.get_threshold() {
            return Ok(VadStatus::Speech);
        }

        match status {
            VadStatus::Unknown => Ok(VadStatus::Unknown),
            // this is super misleading
            _ => Ok(VadStatus::Silence),
        }
    }

    fn set_sensitivity(&mut self, sensitivity: VadSensitivity) {
        self.sensitivity = sensitivity;
    }

    fn get_min_speech_ratio(&self) -> f32 {
        self.sensitivity.min_speech_ratio()
    }

    fn detect_speech_boundaries(&mut self, audio_chunk: &[f32]) -> anyhow::Result<SpeechBoundary> {
        let is_speech = self.is_voice_segment(audio_chunk)?;
        Ok(self.update_speech_state(is_speech))
    }
}

pub async fn create_vad_engine(engine: VadEngineEnum) -> anyhow::Result<Box<dyn VadEngine>> {
    match engine {
        VadEngineEnum::Silero => {
            let silero_vad = SileroVad::new().await?;
            Ok(Box::new(silero_vad))
        }
    }
}

unsafe impl Send for SileroVad {}
