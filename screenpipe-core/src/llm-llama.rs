use anyhow::Result;
use candle::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::llama::{Cache, Llama, LlamaConfig};
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

pub fn load_llama_model(device: &Device) -> Result<(Llama, Tokenizer, Cache)> {
    let api = Api::new()?;
    let model_id = "meta-llama/Meta-Llama-3-8B-Instruct";
    let revision = "main";

    let api = api.repo(Repo::with_revision(
        model_id.to_string(),
        RepoType::Model,
        revision.to_string(),
    ));
    let tokenizer_filename = api.get("tokenizer.json")?;
    let config_filename = api.get("config.json")?;

    let config: LlamaConfig = serde_json::from_slice(&std::fs::read(config_filename)?)?;
    let config = config.into_config(false); // Assuming no flash attention

    let dtype = DType::BF16; // You can change this to F16 if preferred
    let cache = Cache::new(true, dtype, &config, device)?;

    let filenames = hub_load_safetensors(&api, "model.safetensors.index.json")?;
    let vb = unsafe { VarBuilder::from_mmaped_safetensors(&filenames, dtype, device)? };

    let model = Llama::load(vb, &config)?;
    let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(anyhow::Error::msg)?;

    Ok((model, tokenizer, cache))
}

pub fn generate_text_streaming<F>(
    model: &Llama,
    tokenizer: &Tokenizer,
    cache: &mut Cache,
    prompt: &str,
    max_tokens: usize,
    temperature: f64,
    device: &Device,
    mut callback: F,
) -> Result<()>
where
    F: FnMut(String) -> Result<()>,
{
    let mut logits_processor =
        candle_transformers::generation::LogitsProcessor::new(42, Some(temperature), None);

    let mut tokens = tokenizer.encode(prompt, true).map_err(anyhow::Error::msg)?;
    let mut generated_tokens = 0;

    let eos_token = tokenizer.token_to_id("</s>");
    let bos_token = tokenizer.token_to_id("<s>");

    let mut all_tokens = if let Some(bos_token) = bos_token {
        std::iter::once(bos_token)
            .chain(tokens.get_ids().iter().cloned())
            .collect::<Vec<_>>()
    } else {
        tokens.get_ids().to_vec()
    };
    for index in 0..max_tokens {
        let context_size = if index > 0 { 1 } else { tokens.get_ids().len() };
        let start_pos = tokens.get_ids().len().saturating_sub(context_size);
        let input = Tensor::new(&tokens.get_ids()[start_pos..], device)?;

        let logits = model.forward(&input, start_pos, cache)?;
        let logits = logits.squeeze(0)?;
        let logits = if temperature == 0. {
            logits
        } else {
            let temp_tensor = Tensor::new(&[temperature], device)?;
            logits.div(&temp_tensor)?
        };
        let next_token = logits_processor.sample(&logits)?;
        let text = tokenizer
            .decode(&[next_token], false)
            .map_err(anyhow::Error::msg)?;
        tokens = tokenizer.encode(text, true).map_err(anyhow::Error::msg)?;
        all_tokens.push(next_token);

        if let Some(eos_token) = eos_token {
            if next_token == eos_token {
                break;
            }
        }

        let text = tokenizer
            .decode(&[next_token], true)
            .map_err(anyhow::Error::msg)?;
        callback(text)?;

        generated_tokens += 1;
    }

    Ok(())
}
