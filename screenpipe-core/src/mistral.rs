#[cfg(feature = "llm")]
mod llm_module {

    use anyhow::{Error as E, Result};

    use candle_transformers::models::mistral::{Config, Model as Mistral};
    use candle_transformers::models::quantized_mistral::Model as QMistral;

    use candle::{DType, Device, Tensor};
    use candle_nn::VarBuilder;
    use candle_transformers::generation::{LogitsProcessor, Sampling};
    use hf_hub::api::sync::ApiBuilder;
    use hf_hub::{Repo, RepoType};
    use tokenizers::Tokenizer;

    use crate::{hub_load_safetensors, TokenOutputStream};

    enum Model {
        Mistral(Mistral),
        Quantized(QMistral),
    }

    struct TextGeneration {
        model: Model,
        device: Device,
        tokenizer: TokenOutputStream,
        logits_processor: LogitsProcessor,
        repeat_penalty: f32,
        repeat_last_n: usize,
    }

    impl TextGeneration {
        #[allow(clippy::too_many_arguments)]
        fn new(
            model: Model,
            tokenizer: Tokenizer,
            seed: u64,
            temp: Option<f64>,
            top_p: Option<f64>,
            top_k: Option<usize>,
            repeat_penalty: f32,
            repeat_last_n: usize,
            device: &Device,
        ) -> Self {
            let logits_processor = {
                let temperature = temp.unwrap_or(0.);
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
                LogitsProcessor::from_sampling(seed, sampling)
            };

            Self {
                model,
                tokenizer: TokenOutputStream::new(tokenizer),
                logits_processor,
                repeat_penalty,
                repeat_last_n,
                device: device.clone(),
            }
        }

        fn run(&mut self, prompt: &str, sample_len: usize) -> Result<()> {
            use std::io::Write;
            self.tokenizer.clear();
            let mut tokens = self
                .tokenizer
                .tokenizer()
                .encode(prompt, true)
                .map_err(E::msg)?
                .get_ids()
                .to_vec();
            for &t in tokens.iter() {
                if let Some(t) = self.tokenizer.next_token(t)? {
                    print!("{t}")
                }
            }
            std::io::stdout().flush()?;

            let mut generated_tokens = 0usize;
            let eos_token = match self.tokenizer.get_token("</s>") {
                Some(token) => token,
                None => anyhow::bail!("cannot find the </s> token"),
            };
            let start_gen = std::time::Instant::now();
            for index in 0..sample_len {
                let context_size = if index > 0 { 1 } else { tokens.len() };
                let start_pos = tokens.len().saturating_sub(context_size);
                let ctxt = &tokens[start_pos..];
                let input = Tensor::new(ctxt, &self.device)?.unsqueeze(0)?;
                let logits = match &mut self.model {
                    Model::Mistral(m) => m.forward(&input, start_pos)?,
                    Model::Quantized(m) => m.forward(&input, start_pos)?,
                };
                let logits = logits.squeeze(0)?.squeeze(0)?.to_dtype(DType::F32)?;
                let logits = if self.repeat_penalty == 1. {
                    logits
                } else {
                    let start_at = tokens.len().saturating_sub(self.repeat_last_n);
                    candle_transformers::utils::apply_repeat_penalty(
                        &logits,
                        self.repeat_penalty,
                        &tokens[start_at..],
                    )?
                };

                let next_token = self.logits_processor.sample(&logits)?;
                tokens.push(next_token);
                generated_tokens += 1;
                if next_token == eos_token {
                    break;
                }
                if let Some(t) = self.tokenizer.next_token(next_token)? {
                    print!("{t}");
                    std::io::stdout().flush()?;
                }
            }
            let dt = start_gen.elapsed();
            if let Some(rest) = self.tokenizer.decode_rest().map_err(E::msg)? {
                print!("{rest}");
            }
            std::io::stdout().flush()?;
            println!(
                "\n{generated_tokens} tokens generated ({:.2} token/s)",
                generated_tokens as f64 / dt.as_secs_f64(),
            );
            Ok(())
        }
    }

    #[derive(Clone, Debug, Copy, PartialEq, Eq)]
    enum Which {
        Mistral7bV01,
        Mistral7bV02,
        Mistral7bInstructV01,
        Mistral7bInstructV02,
        Mistral7bInstructV03,
        Mathstral7bV01,
        MistralNemo2407,
        MistralNemoInstruct2407,
    }

    impl Which {
        fn as_str(&self) -> &'static str {
            match self {
                Which::Mistral7bV01 => "7b-v0.1",
                Which::Mistral7bV02 => "7b-v0.2",
                Which::Mistral7bInstructV01 => "7b-instruct-v0.1",
                Which::Mistral7bInstructV02 => "7b-instruct-v0.2",
                Which::Mistral7bInstructV03 => "7b-instruct-v0.3",
                Which::Mathstral7bV01 => "7b-maths-v0.1",
                Which::MistralNemo2407 => "nemo-2407",
                Which::MistralNemoInstruct2407 => "nemo-instruct-2407",
            }
        }
    }

    impl ToString for Which {
        fn to_string(&self) -> String {
            self.as_str().to_string()
        }
    }

    #[derive(Debug)]
    pub struct MistralConfig {
        use_flash_attn: bool,

        prompt: String,

        /// The temperature used to generate samples.
        temperature: Option<f64>,

        /// Nucleus sampling probability cutoff.
        top_p: Option<f64>,

        /// Only sample among the top K samples.
        top_k: Option<usize>,

        /// The seed to use when generating random samples.
        seed: u64,

        /// The length of the sample to generate (in tokens).
        sample_len: usize,

        /// The model size to use.
        which: Which,

        model_id: Option<String>,

        revision: String,

        tokenizer_file: Option<String>,

        config_file: Option<String>,

        weight_files: Option<String>,

        quantized: bool,

        /// Penalty to be applied for repeating tokens, 1. means no penalty.
        repeat_penalty: f32,

        /// The context size to consider for the repeat penalty.
        repeat_last_n: usize,

        /// Use the slower dmmv cuda kernel.
        force_dmmv: bool,
    }

    impl Default for MistralConfig {
        fn default() -> Self {
            Self {
                use_flash_attn: false,
                prompt: String::new(),
                temperature: Some(0.8),
                top_p: Some(0.95),
                top_k: None,
                seed: 299792458,
                sample_len: 100,
                which: Which::Mistral7bInstructV03,
                model_id: None,
                revision: "main".to_string(),
                tokenizer_file: None,
                config_file: None,
                weight_files: None,
                quantized: false,
                repeat_penalty: 1.1,
                repeat_last_n: 64,
                force_dmmv: false,
            }
        }
    }

    pub fn stream_text<F>(args: MistralConfig, mut callback: F) -> Result<()>
    where
        F: FnMut(String) -> Result<()>,
    {
        #[cfg(feature = "cuda")]
        candle::quantized::cuda::set_force_dmmv(args.force_dmmv);

        println!(
            "avx: {}, neon: {}, simd128: {}, f16c: {}",
            candle::utils::with_avx(),
            candle::utils::with_neon(),
            candle::utils::with_simd128(),
            candle::utils::with_f16c()
        );
        println!(
            "temp: {:.2} repeat-penalty: {:.2} repeat-last-n: {}",
            args.temperature.unwrap_or(0.),
            args.repeat_penalty,
            args.repeat_last_n
        );

        let start = std::time::Instant::now();
        let api = ApiBuilder::new()
            // ! hardcoded louis token dont CARE
            .with_token(Some("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".to_string()))
            .build()?;
        let model_id = match args.model_id {
            Some(model_id) => model_id,
            None => {
                if args.quantized {
                    if args.which != Which::Mistral7bV01 {
                        anyhow::bail!("only 7b-v0.1 is available as a quantized model for now")
                    }
                    "lmz/candle-mistral".to_string()
                } else {
                    let name = match args.which {
                        // https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3
                        Which::Mistral7bV01 => "mistralai/Mistral-7B-v0.1",
                        Which::Mistral7bV02 => "mistralai/Mistral-7B-v0.2",
                        Which::Mistral7bInstructV01 => "mistralai/Mistral-7B-Instruct-v0.1",
                        Which::Mistral7bInstructV02 => "mistralai/Mistral-7B-Instruct-v0.2",
                        Which::Mistral7bInstructV03 => "mistralai/Mistral-7B-Instruct-v0.3",
                        Which::Mathstral7bV01 => "mistralai/mathstral-7B-v0.1",
                        Which::MistralNemo2407 => "mistralai/Mistral-Nemo-Base-2407",
                        Which::MistralNemoInstruct2407 => "mistralai/Mistral-Nemo-Instruct-2407",
                    };
                    name.to_string()
                }
            }
        };
        let repo = api.repo(Repo::with_revision(
            model_id,
            RepoType::Model,
            args.revision,
        ));
        let tokenizer_filename = match args.tokenizer_file {
            Some(file) => std::path::PathBuf::from(file),
            None => repo.get("tokenizer.json")?,
        };
        let filenames = match args.weight_files {
            Some(files) => files
                .split(',')
                .map(std::path::PathBuf::from)
                .collect::<Vec<_>>(),
            None => {
                if args.quantized {
                    vec![repo.get("model-q4k.gguf")?]
                } else {
                    hub_load_safetensors(&repo, "model.safetensors.index.json")?
                }
            }
        };
        println!("retrieved the files in {:?}", start.elapsed());
        let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(E::msg)?;

        let start = std::time::Instant::now();
        let config = match args.config_file {
            Some(config_file) => serde_json::from_slice(&std::fs::read(config_file)?)?,
            None => {
                if args.quantized {
                    Config::config_7b_v0_1(args.use_flash_attn)
                } else {
                    let config_file = repo.get("config.json")?;
                    serde_json::from_slice(&std::fs::read(config_file)?)?
                }
            }
        };
        let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

        let (model, device) = if args.quantized {
            let filename = &filenames[0];
            let vb = candle_transformers::quantized_var_builder::VarBuilder::from_gguf(
                filename, &device,
            )?;
            let model = QMistral::new(&config, vb)?;
            (Model::Quantized(model), device)
        } else {
            let dtype = if device.is_cuda() {
                DType::BF16
            } else {
                DType::F32
            };
            let vb = unsafe { VarBuilder::from_mmaped_safetensors(&filenames, dtype, &device)? };
            let model = Mistral::new(&config, vb)?;
            (Model::Mistral(model), device)
        };

        println!("loaded the model in {:?}", start.elapsed());

        let mut pipeline = TextGeneration::new(
            model,
            tokenizer,
            args.seed,
            args.temperature,
            args.top_p,
            args.top_k,
            args.repeat_penalty,
            args.repeat_last_n,
            &device,
        );
        pipeline.run(&args.prompt, args.sample_len)?;
        Ok(())
    }
}

// Optionally, you can re-export the module contents if needed
#[cfg(feature = "llm")]
pub use llm_module::*;
