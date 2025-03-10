use anyhow;
use vad_rs::VadStatus;

use super::{VadEngine, VadSensitivity};

#[derive(Default)]
pub struct WebRtcVad {
    vad: webrtc_vad::Vad,
    sensitivity: VadSensitivity,
}

impl WebRtcVad {
    pub fn new() -> Self {
        let vad = webrtc_vad::Vad::new();
        Self {
            vad,
            sensitivity: VadSensitivity::Medium,
        }
    }
}
impl VadEngine for WebRtcVad {
    fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool> {
        // Convert f32 to i16
        let i16_chunk: Vec<i16> = audio_chunk.iter().map(|&x| (x * 32767.0) as i16).collect();

        // Set VAD mode based on sensitivity
        let mode = match self.sensitivity {
            VadSensitivity::Low => webrtc_vad::VadMode::Quality,
            VadSensitivity::Medium => webrtc_vad::VadMode::Aggressive,
            VadSensitivity::High => webrtc_vad::VadMode::VeryAggressive,
        };
        self.vad.set_mode(mode);

        let result = self
            .vad
            .is_voice_segment(&i16_chunk)
            .map_err(|e| anyhow::anyhow!("WebRTC VAD error: {:?}", e))?;

        Ok(result)
    }
    fn audio_type(&mut self, audio_chunk: &[f32]) -> anyhow::Result<VadStatus> {
        // Convert f32 to i16
        let i16_chunk: Vec<i16> = audio_chunk.iter().map(|&x| (x * 32767.0) as i16).collect();

        // Set VAD mode based on sensitivity
        let mode = match self.sensitivity {
            VadSensitivity::Low => webrtc_vad::VadMode::Quality,
            VadSensitivity::Medium => webrtc_vad::VadMode::Aggressive,
            VadSensitivity::High => webrtc_vad::VadMode::VeryAggressive,
        };
        self.vad.set_mode(mode);

        let result = self
            .vad
            .is_voice_segment(&i16_chunk)
            .map_err(|e| anyhow::anyhow!("WebRTC VAD error: {:?}", e))?;

        if !result {
            return Ok(VadStatus::Silence);
        }

        Ok(VadStatus::Speech)
    }

    fn set_sensitivity(&mut self, sensitivity: VadSensitivity) {
        self.sensitivity = sensitivity;
    }

    fn get_min_speech_ratio(&self) -> f32 {
        self.sensitivity.min_speech_ratio()
    }
}
