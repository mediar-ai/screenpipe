use anyhow;
use dirs;
use std::collections::VecDeque;
use std::path::PathBuf;
use tracing::debug;
use vad_rs::{Vad, VadStatus};

use crate::vad::FRAME_HISTORY;

use super::{
    VadEngine, VadSensitivity, DOWNLOAD_ONCE, MODEL_PATH, SILENCE_THRESHOLD,
    SPEECH_FRAME_THRESHOLD, SPEECH_THRESHOLD,
};

pub struct SileroVad {
    vad: Vad,
    prob_history: VecDeque<f32>,
    sensitivity: VadSensitivity,
}

impl SileroVad {
    pub async fn new() -> anyhow::Result<Self> {
        debug!("Initializing SileroVad...");
        let model_path = Self::get_or_download_model().await?;
        debug!("SileroVad Model downloaded to: {:?}", model_path);
        let vad = Vad::new(model_path, 16000).map_err(|e| {
            debug!("SileroVad Error creating Vad: {}", e);
            anyhow::anyhow!("Vad creation error: {}", e)
        })?;
        debug!("SileroVad initialized successfully");
        Ok(Self {
            vad,
            prob_history: VecDeque::with_capacity(FRAME_HISTORY),
            sensitivity: VadSensitivity::Medium,
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
        if self.prob_history.len() > FRAME_HISTORY {
            self.prob_history.pop_front();
        }

        let speech_frames = self
            .prob_history
            .iter()
            .filter(|&&p| p > SPEECH_THRESHOLD)
            .count();
        let silence_frames = self
            .prob_history
            .iter()
            .filter(|&&p| p < SILENCE_THRESHOLD)
            .count();

        if speech_frames >= SPEECH_FRAME_THRESHOLD {
            VadStatus::Speech
        } else if silence_frames > self.prob_history.len() / 2 {
            VadStatus::Silence
        } else {
            VadStatus::Unknown
        }
    }

    fn get_threshold(&self) -> f32 {
        match self.sensitivity {
            VadSensitivity::Low => 0.7,
            VadSensitivity::Medium => 0.5,
            VadSensitivity::High => 0.3,
        }
    }
}

impl VadEngine for SileroVad {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool> {
        const CHUNK_SIZE: usize = 1600; // 100 milliseconds

        let threshold = self.get_threshold();

        let mut chunk_data: Vec<f32> = audio_chunk.to_vec();
        chunk_data.resize(CHUNK_SIZE, 0.0);

        let result = self.vad.compute(&chunk_data).map_err(|e| {
            debug!("SileroVad Error computing VAD: {}", e);
            anyhow::anyhow!("Vad compute error: {}", e)
        })?;

        let status = self.update_status(result.prob);

        Ok(status == VadStatus::Speech && result.prob > threshold)
    }

    fn audio_type(&mut self, audio_chunk: &[f32]) -> anyhow::Result<VadStatus> {
        const CHUNK_SIZE: usize = 1600; // 100 milliseconds

        let threshold = self.get_threshold();

        let mut chunk_data: Vec<f32> = audio_chunk.to_vec();
        chunk_data.resize(CHUNK_SIZE, 0.0);

        let result = self.vad.compute(&chunk_data).map_err(|e| {
            debug!("SileroVad Error computing VAD: {}", e);
            anyhow::anyhow!("Vad compute error: {}", e)
        })?;

        let status = self.update_status(result.prob);

        if status == VadStatus::Speech && result.prob > threshold {
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
}
