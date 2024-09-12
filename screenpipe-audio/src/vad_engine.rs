use std::path::PathBuf;
use vad_rs::{Vad};
use anyhow;
use std::io::Write;
use log::debug;

pub enum VadEngineEnum {
    WebRtc,
    Silero,
}

pub trait VadEngine {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool>;
}

pub struct WebRtcVad(webrtc_vad::Vad);

impl WebRtcVad {
    pub fn new() -> Self {
        let mut vad = webrtc_vad::Vad::new();
        vad.set_mode(webrtc_vad::VadMode::VeryAggressive);
        Self(vad)
    }
}

impl VadEngine for WebRtcVad {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool> {
        // Convert f32 to i16
        let i16_chunk: Vec<i16> = audio_chunk
            .iter()
            .map(|&x| (x * 32767.0) as i16)
            .collect();

        let result = self.0.is_voice_segment(&i16_chunk)
            .map_err(|e| anyhow::anyhow!("WebRTC VAD error: {:?}", e))?;

        // debug!("WebRTC VAD result: is_voice_segment = {}", result);

        Ok(result)
    }
}

pub struct SileroVad {
    vad: Vad,
}

impl SileroVad {
    pub fn new() -> anyhow::Result<Self> {
        debug!("Initializing SileroVad...");
        let model_path = Self::download_model()?;
        debug!("SileroVad Model downloaded to: {:?}", model_path);
        let vad = Vad::new(model_path, 16000).map_err(|e| {
            debug!("SileroVad Error creating Vad: {}", e);
            anyhow::anyhow!("Vad creation error: {}", e)
        })?;
        debug!("SileroVad initialized successfully");
        Ok(Self { vad })
    }

    fn download_model() -> anyhow::Result<PathBuf> {
        debug!("Downloading SileroVAD model...");
        let url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";
        let response = reqwest::blocking::get(url)?;
        let model_data = response.bytes()?;

        let path = std::env::temp_dir().join("silero_vad.onnx");
        let mut file = std::fs::File::create(&path)?;
        file.write_all(&model_data)?;
        debug!("SileroVad Model downloaded and saved to: {:?}", path);

        Ok(path)
    }
}

impl VadEngine for SileroVad {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool> {
        const CHUNK_SIZE: usize = 1600; // 100 milliseconds

        for chunk in audio_chunk.chunks(CHUNK_SIZE) {
            let mut chunk_data: Vec<f32> = chunk.to_vec();
            chunk_data.resize(CHUNK_SIZE, 0.0);

            let result = self.vad.compute(&chunk_data).map_err(|e| {
                debug!("SileroVad Error computing VAD: {}", e);
                anyhow::anyhow!("Vad compute error: {}", e)
            })?;

            if result.prob < 0.3 {
                return Ok(true);
            }
        }

        Ok(false)
    }
}

pub fn create_vad_engine(engine: VadEngineEnum) -> anyhow::Result<Box<dyn VadEngine>> {
    match engine {
        VadEngineEnum::WebRtc => Ok(Box::new(WebRtcVad::new())),
        VadEngineEnum::Silero => {
            let silero_vad = SileroVad::new()?;
            Ok(Box::new(silero_vad))
        },
    }
}

unsafe impl Send for WebRtcVad {}
unsafe impl Send for SileroVad {}