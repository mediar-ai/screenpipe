mod google_module {

    use anyhow::{Error as E, Result};
    use candle::{DType, Device, Tensor};
    use candle_nn::VarBuilder;
    use candle_transformers::generation::{LogitsProcessor, Sampling};
    use candle_transformers::models::gemma::Model as Model1;
    use candle_transformers::models::gemma2::Model as Model2;
    use hf_hub::api::sync::ApiBuilder;
    use hf_hub::{Repo, RepoType};
    use tokenizers::Tokenizer;

    use crate::{hub_load_safetensors, TokenOutputStream};

    enum Model {
        V1(Model1),
        V2(Model2),
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
                    Model::V1(m) => m.forward(&input, start_pos)?,
                    Model::V2(m) => m.forward(&input, start_pos)?,
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
        Base2B,
        Base7B,
        Instruct2B,
        Instruct7B,
        InstructV1_1_2B,
        InstructV1_1_7B,
        CodeBase2B,
        CodeBase7B,
        CodeInstruct2B,
        CodeInstruct7B,
        BaseV2_2B,
        InstructV2_2B,
        BaseV2_9B,
        InstructV2_9B,
    }

    impl Which {
        fn as_str(&self) -> &'static str {
            match self {
                Which::Base2B => "2b",
                Which::Base7B => "7b",
                Which::Instruct2B => "2b-it",
                Which::Instruct7B => "7b-it",
                Which::InstructV1_1_2B => "1.1-2b-it",
                Which::InstructV1_1_7B => "1.1-7b-it",
                Which::CodeBase2B => "code-2b",
                Which::CodeBase7B => "code-7b",
                Which::CodeInstruct2B => "code-2b-it",
                Which::CodeInstruct7B => "code-7b-it",
                Which::BaseV2_2B => "2-2b",
                Which::InstructV2_2B => "2-2b-it",
                Which::BaseV2_9B => "2-9b",
                Which::InstructV2_9B => "2-9b-it",
            }
        }
    }

    impl ToString for Which {
        fn to_string(&self) -> String {
            self.as_str().to_string()
        }
    }

    #[derive(Debug)]
    pub struct GoogleConfig {
        cpu: bool,
        tracing: bool,
        use_flash_attn: bool,
        prompt: String,
        temperature: Option<f64>,
        top_p: Option<f64>,
        top_k: Option<usize>,
        seed: u64,
        sample_len: usize,
        which: Which,
        model_id: Option<String>,
        revision: String,
        tokenizer_file: Option<String>,
        config_file: Option<String>,
        weight_files: Option<String>,
        repeat_penalty: f32,
        repeat_last_n: usize,
        force_dmmv: bool,
    }

    impl Default for GoogleConfig {
        fn default() -> Self {
            Self {
                cpu: false,
                tracing: false,
                use_flash_attn: false,
                prompt: String::new(),
                temperature: Some(0.8),
                top_p: Some(0.95),
                top_k: None,
                seed: 299792458,
                sample_len: 100,
                which: Which::InstructV2_2B,
                model_id: None,
                revision: "main".to_string(),
                tokenizer_file: None,
                config_file: None,
                weight_files: None,
                repeat_penalty: 1.1,
                repeat_last_n: 64,
                force_dmmv: false,
            }
        }
    }

    pub fn google_stream_text<F>(args: GoogleConfig, mut callback: F) -> Result<()>
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
            .with_token(Some("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".to_string()))
            .build()?;
        let model_id = match args.model_id {
            Some(model_id) => model_id,
            None => {
                let name = match args.which {
                    Which::Base2B => "google/gemma-2b",
                    Which::Base7B => "google/gemma-7b",
                    Which::Instruct2B => "google/gemma-2b-it",
                    Which::Instruct7B => "google/gemma-7b-it",
                    Which::InstructV1_1_2B => "google/gemma-1.1-2b-it",
                    Which::InstructV1_1_7B => "google/gemma-1.1-7b-it",
                    Which::CodeBase2B => "google/codegemma-2b",
                    Which::CodeBase7B => "google/codegemma-7b",
                    Which::CodeInstruct2B => "google/codegemma-2b-it",
                    Which::CodeInstruct7B => "google/codegemma-7b-it",
                    Which::BaseV2_2B => "google/gemma-2-2b",
                    Which::InstructV2_2B => "google/gemma-2-2b-it",
                    Which::BaseV2_9B => "google/gemma-2-9b",
                    Which::InstructV2_9B => "google/gemma-2-9b-it",
                };
                name.to_string()
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
            None => hub_load_safetensors(&repo, "model.safetensors.index.json")?,
        };
        println!("retrieved the files in {:?}", start.elapsed());
        let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(E::msg)?;

        let start = std::time::Instant::now();
        let config = match args.config_file {
            Some(config_file) => serde_json::from_slice(&std::fs::read(config_file)?)?,
            None => {
                let config_file = repo.get("config.json")?;
                serde_json::from_slice(&std::fs::read(config_file)?)?
            }
        };
        let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

        let (model, device) = {
            let vb =
                unsafe { VarBuilder::from_mmaped_safetensors(&filenames, DType::F32, &device)? };
            let model = Model2::new(args.use_flash_attn, &config, vb)?;
            (Model::V2(model), device)
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

#[cfg(feature = "llm")]
pub use google_module::*;
