#[cfg(feature = "llm")]
mod llm_module {

    use anyhow::{Error as E, Result};

    use candle::{DType, Device, Tensor};
    use candle_nn::VarBuilder;
    use candle_transformers::generation::{LogitsProcessor, Sampling};
    use hf_hub::{
        api::sync::{Api, ApiBuilder},
        Repo, RepoType,
    };

    use candle_transformers::models::llama as model;
    use model::{Llama, LlamaConfig};
    use tokenizers::Tokenizer;

    use crate::{hub_load_safetensors, TokenOutputStream};

    const EOS_TOKEN: &str = "</s>";
    const DEFAULT_PROMPT: &str = "My favorite theorem is ";

    #[derive(Clone, Debug, Copy, PartialEq, Eq)]
    enum Which {
        V1,
        V2,
        V3,
        V31,
        V3Instruct,
        V31Instruct,
        V32_1b,
        V32_1bInstruct,
        V32_3b,
        V32_3bInstruct,
        Solar10_7B,
        TinyLlama1_1BChat,
    }

    #[derive(Debug)]
    pub struct LlamaInitConfig {
        /// The temperature used to generate samples.
        temperature: f64,

        /// Nucleus sampling probability cutoff.
        top_p: Option<f64>,

        /// Only sample among the top K samples.
        top_k: Option<usize>,

        /// The seed to use when generating random samples.
        seed: u64,

        /// The length of the sample to generate (in tokens).
        sample_len: usize,

        /// Disable the key-value cache.
        no_kv_cache: bool,

        /// The initial prompt.
        prompt: Option<String>,

        /// Use different dtype than f16
        dtype: Option<String>,

        model_id: Option<String>,

        revision: Option<String>,

        /// The model size to use.
        which: Which,

        use_flash_attn: bool,

        /// Penalty to be applied for repeating tokens, 1. means no penalty.
        repeat_penalty: f32,

        /// The context size to consider for the repeat penalty.
        repeat_last_n: usize,
    }

    impl Default for LlamaInitConfig {
        fn default() -> Self {
            Self {
                use_flash_attn: false,
                prompt: None,
                temperature: 0.8,
                top_p: None,
                top_k: None,
                seed: 299792458,
                sample_len: 10000,
                which: Which::V32_3bInstruct,
                model_id: None,
                revision: None,
                repeat_penalty: 1.1,
                repeat_last_n: 128,
                no_kv_cache: false,
                dtype: None,
            }
        }
    }

    pub fn llama_stream_text<F>(args: LlamaInitConfig, mut callback: F) -> Result<()>
    where
        F: FnMut(String) -> Result<()>,
    {
        let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

        let dtype = match args.dtype.as_deref() {
            Some("f16") => DType::F16,
            Some("bf16") => DType::BF16,
            Some("f32") => DType::F32,
            Some(dtype) => anyhow::bail!("Unsupported dtype {dtype}"),
            None => DType::F16,
        };
        let (llama, tokenizer_filename, mut cache, config) = {
            let api = Api::new()?;
            let model_id = args.model_id.unwrap_or_else(|| match args.which {
                Which::V1 => "Narsil/amall-7b".to_string(),
                Which::V2 => "meta-llama/Llama-2-7b-hf".to_string(),
                Which::V3 => "meta-llama/Meta-Llama-3-8B".to_string(),
                Which::V3Instruct => "meta-llama/Meta-Llama-3-8B-Instruct".to_string(),
                Which::V31 => "meta-llama/Meta-Llama-3.1-8B".to_string(),
                Which::V31Instruct => "meta-llama/Meta-Llama-3.1-8B-Instruct".to_string(),
                Which::V32_1b => "meta-llama/Llama-3.2-1B".to_string(),
                Which::V32_1bInstruct => "meta-llama/Llama-3.2-1B-Instruct".to_string(),
                Which::V32_3b => "meta-llama/Llama-3.2-3B".to_string(),
                Which::V32_3bInstruct => "meta-llama/Llama-3.2-3B-Instruct".to_string(),
                Which::Solar10_7B => "upstage/SOLAR-10.7B-v1.0".to_string(),
                Which::TinyLlama1_1BChat => "TinyLlama/TinyLlama-1.1B-Chat-v1.0".to_string(),
            });
            println!("loading the model weights from {model_id}");
            let revision = args.revision.unwrap_or("main".to_string());
            let api = api.repo(Repo::with_revision(model_id, RepoType::Model, revision));

            let tokenizer_filename = api.get("tokenizer.json")?;
            let config_filename = api.get("config.json")?;
            let config: LlamaConfig = serde_json::from_slice(&std::fs::read(config_filename)?)?;
            let config = config.into_config(args.use_flash_attn);

            let filenames = match args.which {
                Which::V1
                | Which::V2
                | Which::V3
                | Which::V3Instruct
                | Which::V31
                | Which::V31Instruct
                | Which::V32_3b
                | Which::V32_3bInstruct
                | Which::Solar10_7B => hub_load_safetensors(&api, "model.safetensors.index.json")?,
                Which::V32_1b | Which::V32_1bInstruct | Which::TinyLlama1_1BChat => {
                    vec![api.get("model.safetensors")?]
                }
            };
            let cache = model::Cache::new(!args.no_kv_cache, dtype, &config, &device)?;

            let vb = unsafe { VarBuilder::from_mmaped_safetensors(&filenames, dtype, &device)? };
            (Llama::load(vb, &config)?, tokenizer_filename, cache, config)
        };
        let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(E::msg)?;
        let eos_token_id = config.eos_token_id.or_else(|| {
            tokenizer
                .token_to_id(EOS_TOKEN)
                .map(model::LlamaEosToks::Single)
        });
        let prompt = args.prompt.as_ref().map_or(DEFAULT_PROMPT, |p| p.as_str());
        let mut tokens = tokenizer
            .encode(prompt, true)
            .map_err(E::msg)?
            .get_ids()
            .to_vec();
        let mut tokenizer = TokenOutputStream::new(tokenizer);

        println!("starting the inference loop");
        print!("{prompt}");
        let mut logits_processor = {
            let temperature = args.temperature;
            let sampling = if temperature <= 0. {
                Sampling::ArgMax
            } else {
                match (args.top_k, args.top_p) {
                    (None, None) => Sampling::All { temperature },
                    (Some(k), None) => Sampling::TopK { k, temperature },
                    (None, Some(p)) => Sampling::TopP { p, temperature },
                    (Some(k), Some(p)) => Sampling::TopKThenTopP { k, p, temperature },
                }
            };
            LogitsProcessor::from_sampling(args.seed, sampling)
        };

        let mut start_gen = std::time::Instant::now();
        let mut index_pos = 0;
        let mut token_generated = 0;
        for index in 0..args.sample_len {
            let (context_size, context_index) = if cache.use_kv_cache && index > 0 {
                (1, index_pos)
            } else {
                (tokens.len(), 0)
            };
            if index == 1 {
                start_gen = std::time::Instant::now()
            }
            let ctxt = &tokens[tokens.len().saturating_sub(context_size)..];
            let input = Tensor::new(ctxt, &device)?.unsqueeze(0)?;
            let logits = llama.forward(&input, context_index, &mut cache)?;
            let logits = logits.squeeze(0)?;
            let logits = if args.repeat_penalty == 1. {
                logits
            } else {
                let start_at = tokens.len().saturating_sub(args.repeat_last_n);
                candle_transformers::utils::apply_repeat_penalty(
                    &logits,
                    args.repeat_penalty,
                    &tokens[start_at..],
                )?
            };
            index_pos += ctxt.len();

            let next_token = logits_processor.sample(&logits)?;
            token_generated += 1;
            tokens.push(next_token);

            match eos_token_id {
                Some(model::LlamaEosToks::Single(eos_tok_id)) if next_token == eos_tok_id => {
                    break;
                }
                Some(model::LlamaEosToks::Multiple(ref eos_ids))
                    if eos_ids.contains(&next_token) =>
                {
                    break;
                }
                _ => (),
            }
            if let Some(t) = tokenizer.next_token(next_token)? {
                print!("{t}");
            }
        }
        if let Some(rest) = tokenizer.decode_rest().map_err(E::msg)? {
            print!("{rest}");
        }
        let dt = start_gen.elapsed();
        println!(
            "\n\n{} tokens generated ({} token/s)\n",
            token_generated,
            (token_generated - 1) as f64 / dt.as_secs_f64(),
        );
        Ok(())
    }
}
// Optionally, you can re-export the module contents if needed
#[cfg(feature = "llm")]
pub use llm_module::*;
