use crate::core::engine::AudioTranscriptionEngine;
use anyhow::Result;
use hf_hub::{api::sync::Api, Cache, Repo, RepoType};
use std::{path::PathBuf, sync::Arc};
use tracing::info;
use whisper_rs::WhisperContextParameters;

pub fn download_whisper_model(engine: Arc<AudioTranscriptionEngine>) -> Result<PathBuf> {
    let model_name = match *engine {
        AudioTranscriptionEngine::WhisperLargeV3Turbo => "ggml-large-v3-turbo.bin",
        AudioTranscriptionEngine::WhisperTiny => "ggml-tiny.bin",
        AudioTranscriptionEngine::WhisperTinyQuantized => "ggml-tiny-q8_0.bin",
        AudioTranscriptionEngine::WhisperLargeV3 => "ggml-large-v3.bin",
        AudioTranscriptionEngine::WhisperLargeV3Quantized => "ggml-large-v3-q5_0.bin",
        _ => "ggml-large-v3-turbo-q8_0.bin",
    };

    let api = Api::new()?;
    let repo = Repo::with_revision(
        "ggerganov/whisper.cpp".to_string(),
        RepoType::Model,
        "main".to_string(),
    );

    let cache = Cache::default();
    let cache_repo = cache.repo(repo.clone());

    if let Some(model_path) = cache_repo.get(model_name) {
        info!("model found at {:?}", model_path);
        return Ok(model_path);
    }

    let api_repo = api.repo(repo);

    info!("downloading model {:?}", model_name);
    let model = api_repo.get(model_name)?;

    info!("model downloaded {}", model_name);

    return Ok(model);
}

pub fn create_whisper_context_parameters<'a>(
    engine: Arc<AudioTranscriptionEngine>,
) -> Result<WhisperContextParameters<'a>> {
    let model_preset = match *engine {
        AudioTranscriptionEngine::WhisperLargeV3
        | AudioTranscriptionEngine::WhisperLargeV3Quantized => whisper_rs::DtwModelPreset::LargeV3,
        AudioTranscriptionEngine::WhisperTiny | AudioTranscriptionEngine::WhisperTinyQuantized => {
            whisper_rs::DtwModelPreset::Tiny
        }
        _ => whisper_rs::DtwModelPreset::LargeV3Turbo,
    };

    let mut context_param = WhisperContextParameters::default();
    context_param.dtw_parameters.mode = whisper_rs::DtwMode::ModelPreset { model_preset };

    Ok(context_param)
}
