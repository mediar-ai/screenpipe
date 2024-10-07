#[cfg(feature = "llm")]
mod llm_module {
    use anyhow::{Error as E, Result};
    use std::path::PathBuf;

    use candle::{DType, Device, Tensor};
    use candle_nn::VarBuilder;
    use candle_transformers::generation::{LogitsProcessor, Sampling};
    use hf_hub::{Repo, RepoType};

    use candle_transformers::models::llama as model;
    use log::debug;
    use model::LlamaConfig;
    use tokenizers::Tokenizer;

    use crate::{
        ChatMessage, ChatRequest, ChatResponse, ChatResponseChoice, ChatResponseUsage, Model,
        TokenOutputStream,
    };

    const EOS_TOKEN: &str = "</s>";

    #[derive(Clone, Debug, Copy, PartialEq, Eq)]
    enum Which {
        V32_1bInstruct,
    }

    impl Which {
        fn model_id(&self) -> String {
            match self {
                // Which::V1 => "Narsil/amall-7b".to_string(),
                // Which::V2 => "meta-llama/Llama-2-7b-hf".to_string(),
                // Which::V3 => "meta-llama/Meta-Llama-3-8B".to_string(),
                // Which::V3Instruct => "meta-llama/Meta-Llama-3-8B-Instruct".to_string(),
                // Which::V31 => "meta-llama/Meta-Llama-3.1-8B".to_string(),
                // Which::V31Instruct => "meta-llama/Meta-Llama-3.1-8B-Instruct".to_string(),
                // Which::V32_1b => "meta-llama/Llama-3.2-1B".to_string(),
                Which::V32_1bInstruct => "meta-llama/Llama-3.2-1B-Instruct".to_string(),
                // Which::V32_3b => "meta-llama/Llama-3.2-3B".to_string(),
                // Which::V32_3bInstruct => "meta-llama/Llama-3.2-3B-Instruct".to_string(),
                // Which::Solar10_7B => "upstage/SOLAR-10.7B-v1.0".to_string(),
                // Which::TinyLlama1_1BChat => "TinyLlama/TinyLlama-1.1B-Chat-v1.0".to_string(),
            }
        }
    }

    #[derive(Debug, Clone)]
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

        /// Use different dtype than f16
        dtype: DType,

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
                temperature: 0.8,
                top_p: None,
                top_k: None,
                seed: 299792458,
                sample_len: 1000,
                which: Which::V32_1bInstruct,
                repeat_penalty: 1.1,
                repeat_last_n: 64,
                dtype: DType::F16,
            }
        }
    }

    pub struct Llama {
        llama_config: candle_transformers::models::llama::Config,
        // device: Device,
        filenames: Vec<PathBuf>,
        tokenizer: Tokenizer,
        // llama: model::Llama,
        eos_token_id: Option<model::LlamaEosToks>,
        config: LlamaInitConfig,
    }

    impl Llama {
        pub fn new() -> Result<Self> {
            // let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));
            let init_config = LlamaInitConfig::default();
            let api = hf_hub::api::sync::Api::new()?;

            let hf_api = api.repo(Repo::with_revision(
                init_config.which.model_id(),
                RepoType::Model,
                "main".to_string(),
            ));

            let tokenizer_filename = hf_api.get("tokenizer.json")?;
            let config_filename = hf_api.get("config.json")?;
            let config: LlamaConfig = serde_json::from_slice(&std::fs::read(config_filename)?)?;
            let llama_config = config.into_config(init_config.use_flash_attn);

            let filenames = vec![hf_api.get("model.safetensors")?];
            // let vb = unsafe {
            //     VarBuilder::from_mmaped_safetensors(&filenames, init_config.dtype, &device)?
            // };

            let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(E::msg)?;

            // let llama = model::Llama::load(vb, &llama_config)?;

            let eos_token_id = tokenizer
                .token_to_id(EOS_TOKEN)
                .map(model::LlamaEosToks::Single);
            Ok(Self {
                llama_config,
                // device,
                filenames,
                eos_token_id,
                tokenizer,
                // llama,
                config: init_config,
            })
        }

        // TODO Implement
        pub fn llama_stream_text(&self) -> Result<()> {
            Ok(())
        }
    }

    impl Model for Llama {
        fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
            let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

            let vb = unsafe {
                VarBuilder::from_mmaped_safetensors(
                    &self.filenames.clone(),
                    self.config.dtype,
                    &device,
                )?
            };

            let llama = model::Llama::load(vb, &self.llama_config)?;

            let sample_len = request
                .max_completion_tokens
                .unwrap_or(self.config.sample_len);
            let prompt = request
                .messages
                .iter()
                .map(|m| m.content.as_str())
                .collect::<Vec<&str>>()
                .join("\n\n");
            let mut cache =
                model::Cache::new(true, self.config.dtype, &self.llama_config, &device)?;

            let temperature = request.temperature.unwrap_or(self.config.temperature);
            let top_k = request.top_k.or(self.config.top_k);
            let top_p = request.top_p.or(self.config.top_p);
            let seed = request.seed.unwrap_or(self.config.seed);
            let sampling = if temperature <= 0. {
                Sampling::ArgMax
            } else {
                match (top_k, top_p) {
                    (None, None) => Sampling::All { temperature },
                    (Some(k), None) => Sampling::TopK { k, temperature },
                    (None, Some(p)) => Sampling::TopP { p, temperature },
                    (Some(k), Some(p)) => Sampling::TopKThenTopP { k, p, temperature },
                }
            };
            let mut logits_processor = LogitsProcessor::from_sampling(seed, sampling);

            let prompt = prompt.as_str();
            let mut tokens = self
                .tokenizer
                .encode(prompt, true)
                .map_err(E::msg)?
                .get_ids()
                .to_vec();

            let prompt_tokens = tokens.len();

            let mut tokenizer = TokenOutputStream::new(self.tokenizer.clone());

            let mut output = String::new();
            let mut start_gen = std::time::Instant::now();

            let mut index_pos = 0;
            let mut token_generated = 0;

            for index in 0..sample_len {
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
                let logits = if self.config.repeat_penalty == 1. {
                    logits
                } else {
                    let start_at = tokens.len().saturating_sub(self.config.repeat_last_n);
                    candle_transformers::utils::apply_repeat_penalty(
                        &logits,
                        self.config.repeat_penalty,
                        &tokens[start_at..],
                    )?
                };
                index_pos += ctxt.len();

                let next_token = logits_processor.sample(&logits)?;
                token_generated += 1;
                tokens.push(next_token);

                // match eos_token_id {
                match self.eos_token_id {
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
                    output.push_str(&t);
                }
            }
            if let Some(rest) = tokenizer.decode_rest().map_err(E::msg)? {
                output.push_str(&rest);
            }
            let dt = start_gen.elapsed();
            tokenizer.clear();

            let tokens_per_second = (token_generated - 1) as f64 / dt.as_secs_f64();

            debug!(
                "Llama: {} tokens generated ({} token/s)",
                token_generated, tokens_per_second
            );

            Ok(ChatResponse {
                id: "123".to_string(),
                object: "chat.completion".to_string(),
                created: 1,
                model: "llama3.2-1B-Instruct".to_string(),
                system_fingerprint: "".to_string(),
                choices: vec![ChatResponseChoice {
                    index: 0,
                    message: ChatMessage {
                        role: "assistant".to_string(),
                        content: output,
                    },
                    logprobs: None,
                    finish_reason: "stop".to_string(),
                }],
                usage: ChatResponseUsage {
                    prompt_tokens: prompt_tokens as i64,
                    completion_tokens: token_generated,
                    total_tokens: token_generated,
                    completion_tokens_details: serde_json::Value::Null,
                    tokens_per_second: tokens_per_second,
                },
            })
        }
    }
}
// Optionally, you can re-export the module contents if needed
#[cfg(feature = "llm")]
pub use llm_module::*;
