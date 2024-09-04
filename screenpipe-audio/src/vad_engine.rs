use std::path::PathBuf;
use onnxruntime::{environment::Environment, session::Session, tensor::OrtOwnedTensor};
use ndarray::Array2;
use hf_hub::{api::sync::Api, Repo, RepoType};

pub enum VadEngineEnum {
    WebRtc,
    Silero,
}

pub trait VadEngine {
    fn is_voice_segment(&mut self, audio_chunk: &[i16]) -> anyhow::Result<bool>;
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
    fn is_voice_segment(&mut self, audio_chunk: &[i16]) -> anyhow::Result<bool> {
        self.0.is_voice_segment(audio_chunk)
            .map_err(|e| anyhow::anyhow!("WebRTC VAD error: {:?}", e))
    }
}

pub struct SileroVad {
    session: Session,
    sample_rate: i64,
    frame_size: usize,
}

impl SileroVad {
    pub fn new() -> anyhow::Result<Self> {
        let environment = Environment::builder().build()?;
        let model_path = hf_hub::api::sync::Api::new()?
            .model("snakers4/silero-vad".to_string())
            .get("silero_vad.onnx")?;

        let session = environment.new_session_builder()?
            .with_model_from_file(model_path)?;
        
        let sample_rate = 16000;
        let frame_size = 512;

        Ok(Self {
            session,
            sample_rate,
            frame_size,
        })
    }

    fn i16_to_f32(audio: &[i16]) -> Vec<f32> {
        audio.iter().map(|&x| x as f32 / 32768.0).collect()
    }
}

impl VadEngine for SileroVad {
    fn is_voice_segment(&mut self, audio_chunk: &[i16]) -> anyhow::Result<bool> {
        if audio_chunk.len() < self.frame_size {
            return Err(anyhow::anyhow!("Audio chunk too small"));
        }

        let chunk_data = Self::i16_to_f32(audio_chunk);
        let input_tensor: Array2<f32> = Array2::from_shape_vec((1, chunk_data.len()), chunk_data)?;
        let sr_tensor: Array2<f32> = Array2::from_elem((1, 1), self.sample_rate as f32);

        let inputs = vec![
            ("input", input_tensor.into()),
            ("sr", sr_tensor.into()),
        ];

        let outputs: Vec<OrtOwnedTensor<f32, _>> = self.session.run(inputs)?;
        let result = outputs[0].view();
        
        const VOICE_THRESHOLD: f32 = 0.5;
        Ok(result[[0, 1]] > VOICE_THRESHOLD)
    }
}

pub fn create_vad_engine(engine: VadEngineEnum) -> anyhow::Result<Box<dyn VadEngine>> {
    match engine {
        VadEngineEnum::WebRtc => Ok(Box::new(WebRtcVad::new())),
        VadEngineEnum::Silero => Ok(Box::new(SileroVad::new()?)),
    }
}

unsafe impl Send for WebRtcVad {}
unsafe impl Send for SileroVad {}
