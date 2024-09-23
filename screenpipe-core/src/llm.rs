#[cfg(feature = "llm")]
mod llm_module {
    use anyhow::Result;
    use candle::{DType, Device, Tensor};
    use candle_nn::VarBuilder;
    use candle_transformers::{
        generation::LogitsProcessor,
        models::phi3::{Config as Phi3Config, Model as Phi3},
    };

    use hf_hub::{api::sync::Api, Repo, RepoType};
    use tokenizers::Tokenizer;

    /// Loads the safetensors files for a model from the hub based on a json index file.
    pub fn hub_load_safetensors(
        repo: &hf_hub::api::sync::ApiRepo,
        json_file: &str,
    ) -> Result<Vec<std::path::PathBuf>> {
        let json_file = repo.get(json_file).map_err(candle::Error::wrap)?;
        let json_file = std::fs::File::open(json_file)?;
        let json: serde_json::Value =
            serde_json::from_reader(&json_file).map_err(candle::Error::wrap)?;
        let weight_map = match json.get("weight_map") {
            None => anyhow::bail!("no weight map in {json_file:?}"),
            Some(serde_json::Value::Object(map)) => map,
            Some(_) => anyhow::bail!("weight map in {json_file:?} is not a map"),
        };
        let mut safetensors_files = std::collections::HashSet::new();
        for value in weight_map.values() {
            if let Some(file) = value.as_str() {
                safetensors_files.insert(file.to_string());
            }
        }
        let safetensors_files = safetensors_files
            .iter()
            .map(|v| repo.get(v).map_err(anyhow::Error::from))
            .collect::<Result<Vec<_>, anyhow::Error>>()?;
        Ok(safetensors_files)
    }

    pub fn load_llama_model(device: &Device) -> Result<(Phi3, Tokenizer)> {
        let api = Api::new()?;
        let model_id = "microsoft/Phi-3-mini-4k-instruct";
        let revision = "main";

        let api = api.repo(Repo::with_revision(
            model_id.to_string(),
            RepoType::Model,
            revision.to_string(),
        ));
        let tokenizer_filename = api.get("tokenizer.json")?;
        let config_filename = api.get("config.json")?;

        let config: Phi3Config = serde_json::from_slice(&std::fs::read(config_filename)?)?;

        // https://github.com/huggingface/candle/blob/ddafc61055601002622778b7762c15bd60057c1f/candle-examples/examples/phi/main.rs#L364
        // let dtype = DType::BF16;
        let dtype = DType::F32;

        let filenames = hub_load_safetensors(&api, "model.safetensors.index.json")?;
        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&filenames, dtype, device)? };

        let model = Phi3::new(&config, vb)?;
        let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(anyhow::Error::msg)?;

        Ok((model, tokenizer))
    }

    pub fn generate_text_streaming<F>(
        model: &mut Phi3,
        tokenizer: &Tokenizer,
        prompt: &str,
        max_tokens: usize,
        temperature: f64,
        repeat_penalty: f32,
        repeat_last_n: usize,
        seed: u64,
        top_p: f64,
        device: &Device,
        mut callback: F,
    ) -> Result<()>
    where
        F: FnMut(String) -> Result<()>,
    {
        let mut logits_processor = LogitsProcessor::new(seed, Some(temperature), Some(top_p));
        let tokens = tokenizer.encode(prompt, true).unwrap();
        if tokens.is_empty() {
            anyhow::bail!("empty prompt")
        }
        let mut tokens = tokens.get_ids().to_vec();
        let eos_token = match tokenizer.token_to_id("<|endoftext|>") {
            Some(token) => token,
            None => anyhow::bail!("cannot find the endoftext token"),
        };

        let mut pos = 0;
        for _ in 0..max_tokens {
            let context_size = if pos > 0 { 1 } else { tokens.len() };
            let ctxt = &tokens[tokens.len().saturating_sub(context_size)..];
            let input = Tensor::new(ctxt, device)?.unsqueeze(0)?;
            let logits = model.forward(&input, pos)?;
            let logits = logits.squeeze(0)?.to_dtype(DType::F32)?;

            let logits = if repeat_penalty == 1. {
                logits
            } else {
                let start_at = tokens.len().saturating_sub(repeat_last_n);
                candle_transformers::utils::apply_repeat_penalty(
                    &logits,
                    repeat_penalty,
                    &tokens[start_at..],
                )?
            };

            // Remove the batch dimension if it exists
            let logits = if logits.dims().len() > 1 {
                logits.squeeze(0)?
            } else {
                logits
            };

            let next_token = logits_processor.sample(&logits)?;
            tokens.push(next_token);
            if next_token == eos_token {
                break;
            }
            if let Ok(t) = tokenizer.decode(&[next_token], false) {
                callback(t)?;
            }
            pos += 1;
        }

        Ok(())
    }
}

// Optionally, you can re-export the module contents if needed
#[cfg(feature = "llm")]
pub use llm_module::*;
