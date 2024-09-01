use anyhow::Result;
use candle::{Device, Tensor};
use candle_nn::VarBuilder;
use hf_hub::{api::sync::Api, Repo, RepoType};
use std::path::PathBuf;

pub enum VadEngineEnum {
    WebRtc,
    Silero,
}

pub trait VadEngine {
    fn is_voice_segment(&mut self, audio_chunk: &[i16]) -> Result<bool>;
}

pub struct WebRtcVad(webrtc_vad::Vad);

impl WebRtcVad {
    pub fn new() -> Self {
        let mut vad = webrtc_vad::Vad::new();
        vad.set_mode(webrtc_vad::VadMode::Quality);
        Self(vad)
    }
}

impl VadEngine for WebRtcVad {
    fn is_voice_segment(&mut self, audio_chunk: &[i16]) -> Result<bool> {
        self.0.is_voice_segment(audio_chunk).map_err(Into::into)
    }
}

pub struct SileroVad {
    model: candle_nn::Module,
    device: Device,
}

impl SileroVad {
    pub fn new() -> Result<Self> {
        let device = Device::Cpu;
        let repo = Repo::with_revision(
            "snakers4/silero-vad".to_string(),
            RepoType::Model,
            "master".to_string(),
        );
        let api = Api::new()?;
        let api = api.repo(repo);
        let model_path: PathBuf = api.get("silero_vad.onnx")?;

        let vb = VarBuilder::from_onnx(model_path, &device)?;
        let model = candle_nn::Module::new(vb)?;

        Ok(Self { model, device })
    }

    fn preprocess_audio(&self, audio_chunk: &[i16]) -> anyhow::Result<Tensor> {
        let float_chunk: Vec<f32> = audio_chunk.iter().map(|&x| x as f32 / 32768.0).collect();
        Tensor::from_vec(float_chunk, (1, audio_chunk.len()), &self.device)
    }
}

impl VadEngine for SileroVad {
    fn is_voice_segment(&mut self, audio_chunk: &[i16]) -> Result<bool> {
        let input = self.preprocess_audio(audio_chunk)?;
        let output = self.model.forward(&input)?;
        let probability = output.squeeze(0)?.squeeze(0)?.to_vec1::<f32>()?[0];

        // You may need to adjust this threshold based on your specific use case
        const VOICE_THRESHOLD: f32 = 0.5;
        Ok(probability > VOICE_THRESHOLD)
    }
}

pub fn create_vad_engine(engine: VadEngineEnum) -> Result<Box<dyn VadEngine>> {
    match engine {
        VadEngineEnum::WebRtc => Ok(Box::new(WebRtcVad::new())),
        VadEngineEnum::Silero => Ok(Box::new(SileroVad::new()?)),
    }
}
