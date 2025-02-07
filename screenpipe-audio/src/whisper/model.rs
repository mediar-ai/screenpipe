use anyhow::{Error as E, Result};
use candle::{Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::whisper::{self as m, Config};
use hf_hub::{api::sync::Api, Repo, RepoType};
use log::debug;
use tokenizers::Tokenizer;

pub struct WhisperModel {
    pub model: Model,
    pub tokenizer: Box<Tokenizer>,
    pub device: Device,
    pub mel_filters: Vec<f32>,
}

impl WhisperModel {
    pub fn new(engine: &crate::AudioTranscriptionEngine) -> Result<Self> {
        debug!("Initializing WhisperModel");
        let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));
        debug!("device = {:?}", device);

        debug!("Fetching model files");
        let (config_filename, tokenizer_filename, weights_filename) = {
            let api = Api::new()?;
            let repo = match engine {
                crate::AudioTranscriptionEngine::WhisperTiny => Repo::with_revision(
                    "openai/whisper-tiny".to_string(),
                    RepoType::Model,
                    "main".to_string(),
                ),
                crate::AudioTranscriptionEngine::WhisperDistilLargeV3 => Repo::with_revision(
                    "distil-whisper/distil-large-v3".to_string(),
                    RepoType::Model,
                    "main".to_string(),
                ),
                crate::AudioTranscriptionEngine::WhisperLargeV3Turbo => Repo::with_revision(
                    "openai/whisper-large-v3-turbo".to_string(),
                    RepoType::Model,
                    "main".to_string(),
                ),
                _ => Repo::with_revision(
                    "openai/whisper-large-v3-turbo".to_string(),
                    RepoType::Model,
                    "main".to_string(),
                ),
            };
            let api_repo = api.repo(repo);
            let config = api_repo.get("config.json")?;
            let tokenizer = api_repo.get("tokenizer.json")?;
            let model = api_repo.get("model.safetensors")?;
            (config, tokenizer, model)
        };

        debug!("Parsing config and tokenizer");
        let config: Config = serde_json::from_str(&std::fs::read_to_string(config_filename)?)?;
        let tokenizer = Box::new(Tokenizer::from_file(tokenizer_filename).map_err(E::msg)?);
        // tokenizer.with_pre_tokenizer(PreT)
        debug!("Loading model weights");
        let vb =
            unsafe { VarBuilder::from_mmaped_safetensors(&[weights_filename], m::DTYPE, &device)? };
        let whisper = m::model::Whisper::load(&vb, config.clone())?;

        let model = Model::Normal(whisper);

        debug!("Loading mel filters");
        let mel_bytes = match config.num_mel_bins {
            80 => include_bytes!("../../models/whisper/melfilters.bytes").as_slice(),
            128 => include_bytes!("../../models/whisper/melfilters128.bytes").as_slice(),
            nmel => anyhow::bail!("unexpected num_mel_bins {nmel}"),
        };
        let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
        <byteorder::LittleEndian as byteorder::ByteOrder>::read_f32_into(
            mel_bytes,
            &mut mel_filters,
        );

        debug!("WhisperModel initialization complete");
        Ok(Self {
            model,
            tokenizer,
            device,
            mel_filters,
        })
    }
}

#[derive(Debug, Clone)]
pub enum Model {
    Normal(m::model::Whisper),
    Quantized(m::quantized_model::Whisper),
}

impl Model {
    pub fn config(&self) -> &Config {
        match self {
            Self::Normal(m) => &m.config,
            Self::Quantized(m) => &m.config,
        }
    }

    pub fn encoder_forward(&mut self, x: &Tensor, flush: bool) -> candle::Result<Tensor> {
        match self {
            Self::Normal(m) => m.encoder.forward(x, flush),
            Self::Quantized(m) => m.encoder.forward(x, flush),
        }
    }

    pub fn decoder_forward(
        &mut self,
        x: &Tensor,
        xa: &Tensor,
        flush: bool,
    ) -> candle::Result<Tensor> {
        match self {
            Self::Normal(m) => m.decoder.forward(x, xa, flush),
            Self::Quantized(m) => m.decoder.forward(x, xa, flush),
        }
    }

    pub fn decoder_final_linear(&self, x: &Tensor) -> candle::Result<Tensor> {
        match self {
            Self::Normal(m) => m.decoder.final_linear(x),
            Self::Quantized(m) => m.decoder.final_linear(x),
        }
    }
}
