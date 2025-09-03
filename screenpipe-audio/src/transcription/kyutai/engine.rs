use anyhow::Result;
use candle::Device;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::kyutai::model::Model; // This is the Kyutai Model you already have

pub struct KyutaiSttEngine {
    model: Model,
}

impl KyutaiSttEngine {
    pub fn new(cpu: bool, repo: &str) -> Result<Self> {
        let device = if cpu {
            Device::Cpu
        } else if candle::utils::cuda_is_available() {
            Device::new_cuda(0)?
        } else {
            Device::Cpu
        };

        let args = crate::kyutai::Args {
            in_file: "".to_string(),
            hf_repo: repo.to_string(),
            cpu,
            timestamps: false,
            vad: false,
        };

        let model = Model::load_from_hf(&args, &device)?;
        Ok(Self { model })
    }

    pub fn transcribe(&mut self, audio: &[f32], sample_rate: u32) -> Result<String> {
        let pcm = if sample_rate != 24_000 {
            kaudio::resample(audio, sample_rate as usize, 24_000)?
        } else {
            audio.to_vec()
        };

        self.model.transcribe(pcm)
    }
}
