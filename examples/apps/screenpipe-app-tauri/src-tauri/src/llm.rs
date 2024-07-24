use anyhow::{bail, Result};
use candle::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::llama::{Cache, Llama, LlamaConfig};
use hf_hub::{api::sync::Api, Repo, RepoType};
use tokenizers::Tokenizer;

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

    let filenames = candle_examples::hub_load_safetensors(&api, "model.safetensors.index.json")?;
    let vb = unsafe { VarBuilder::from_mmaped_safetensors(&filenames, dtype, device)? };

    let model = Llama::load(vb, &config)?;
    let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(anyhow::Error::msg)?;

    Ok((model, tokenizer, cache))
}

pub fn generate_text(
    model: &Llama,
    tokenizer: &Tokenizer,
    cache: &mut Cache,
    prompt: &str,
    max_tokens: usize,
    temperature: f64,
    device: &Device,
) -> Result<String> {
    // Implement text generation logic here
    // This would include tokenization, forward passes, and token sampling
    // You can refer to the main() function in the GitHub example for details

    // Placeholder return
    Ok("Generated text placeholder".to_string())
}

pub fn generate_text_streaming<F>(
    model: &Llama,
    tokenizer: &Tokenizer,
    cache: &mut Cache,
    prompt: &str,
    max_tokens: usize,
    temperature: f64,
    device: &Device,
    callback: F,
) -> Result<()>
where
    F: FnMut(String) -> Result<()>,
{
    let mut rng = rand::rngs::StdRng::seed_from_u64(299792458);
    let mut logits_processor =
        candle_transformers::generation::LogitsProcessor::new(299792458, temperature, None);

    let mut tokens = tokenizer.encode(prompt, true).map_err(anyhow::Error::msg)?;
    let mut generated_tokens = 0;
    let mut callback = callback;

    let eos_token = tokenizer.token_to_id("</s>");
    let bos_token = tokenizer.token_to_id("<s>");

    if let Some(bos_token) = bos_token {
        tokens.insert(0, bos_token);
    }

    let mut all_tokens = tokens.clone();

    for index in 0..max_tokens {
        let context_size = if index > 0 { 1 } else { tokens.len() };
        let start_pos = tokens.len().saturating_sub(context_size);
        let input = Tensor::new(&tokens[start_pos..], device)?;

        let logits = model.forward(&input, start_pos, cache)?;
        let logits = logits.squeeze(0)?;
        let logits = if temperature == 0. {
            logits
        } else {
            logits.div(temperature)?
        };

        let next_token = logits_processor.sample(&logits)?;
        tokens.push(next_token);
        all_tokens.push(next_token);

        if let Some(eos_token) = eos_token {
            if next_token == eos_token {
                break;
            }
        }

        if let Some(text) = tokenizer
            .decode(&[next_token], true)
            .map_err(anyhow::Error::msg)?
        {
            callback(text)?;
        }

        generated_tokens += 1;
    }

    Ok(())
}

fn main() {
    let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));
    let (model, tokenizer, cache) = load_llama_model(&device).unwrap();
    let prompt = "Hello, world!";
    let max_tokens = 10;
    let temperature = 0.1;
    let callback = |text| {
        println!("Generated text: {}", text);
        Ok(())
    };
    // streaming
    generate_text_streaming(
        &model,
        &tokenizer,
        &mut cache,
        &prompt,
        max_tokens,
        temperature,
        &device,
        callback,
    )
    .unwrap();
}
