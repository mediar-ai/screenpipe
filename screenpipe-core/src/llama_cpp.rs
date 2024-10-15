use anyhow::{self, Context};
use dirs;
use hf_hub::api::tokio::ApiBuilder;
use lazy_static::lazy_static;
use llama_cpp_2::token::data_array::LlamaTokenDataArray;
use log::debug;
use std::path::PathBuf;
use tokio::sync::Mutex;
use tracing::info;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::grammar::LlamaGrammar;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::model::{AddBos, Special};
use std::str::FromStr;

lazy_static! {
    static ref MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

pub struct LlamaEngine {
    model: Box<LlamaModel>,
    ctx: llama_cpp_2::context::LlamaContext<'static>,
    backend: LlamaBackend,
}

impl LlamaEngine {
    pub async fn new(repo: &str, model: &str) -> anyhow::Result<Self> {
        info!("initializing llamaengine...");
        let model_path = Self::get_or_download_model(repo, model).await?;
        info!("llamaengine model downloaded to: {:?}", model_path);

        let backend = LlamaBackend::init()?;
        let params = LlamaModelParams::default();
        let model = Box::new(LlamaModel::load_from_file(&backend, &model_path, &params)?);

        let ctx_params = LlamaContextParams::default();
        let ctx = unsafe {
            // SAFETY: We're ensuring that the model lives as long as the LlamaEngine
            // by boxing it and never moving it out of the struct.
            std::mem::transmute::<
                llama_cpp_2::context::LlamaContext<'_>,
                llama_cpp_2::context::LlamaContext<'static>,
            >(model.new_context(&backend, ctx_params)?)
        };

        debug!("llamaengine initialized successfully");
        Ok(Self {
            model,
            ctx,
            backend,
        })
    }

    async fn get_or_download_model(repo: &str, model: &str) -> anyhow::Result<PathBuf> {
        let model_path = MODEL_PATH.lock().await;
        if let Some(path) = model_path.as_ref() {
            return Ok(path.clone());
        }

        let cache_dir = Self::get_cache_dir()?;
        tokio::fs::create_dir_all(&cache_dir).await?;

        let model_path = ApiBuilder::new()
            .with_progress(true)
            .build()
            .with_context(|| "unable to create huggingface api")?
            .model(repo.to_string())
            .get(&model)
            .await
            .with_context(|| "unable to download model")?;

        Ok(model_path)
    }

    fn get_cache_dir() -> anyhow::Result<PathBuf> {
        let proj_dirs =
            dirs::cache_dir().ok_or_else(|| anyhow::anyhow!("failed to get cache dir"))?;
        Ok(proj_dirs.join("screenpipe").join("llms"))
    }

    pub fn generate(&mut self, prompt: &str, max_tokens: usize) -> anyhow::Result<String> {
        let tokens_list = self.model.str_to_token(prompt, AddBos::Always)?;
        let mut batch = LlamaBatch::new(512, 1);

        let last_index = tokens_list.len() as i32 - 1;
        for (i, token) in (0_i32..).zip(tokens_list.into_iter()) {
            let is_last = i == last_index;
            batch.add(token, i, &[0], is_last)?;
        }

        self.ctx.decode(&mut batch)?;

        let mut output = String::new();
        let mut n_cur = batch.n_tokens();

        while n_cur <= max_tokens as i32 {
            let candidates = self.ctx.candidates_ith(batch.n_tokens() - 1);
            let candidates_p = LlamaTokenDataArray::from_iter(candidates, false);
            let new_token_id = self.ctx.sample_token_greedy(candidates_p);

            if new_token_id == self.model.token_eos() {
                break;
            }

            // Corrected line: Added the Special::None argument
            let token_str = self.model.token_to_str(new_token_id, Special::Plaintext)?;
            output.push_str(&token_str);

            batch.clear();
            batch.add(new_token_id, n_cur, &[0], true)?;
            n_cur += 1;
            self.ctx.decode(&mut batch)?;
        }

        Ok(output)
    }

    pub fn generate_json(&mut self, prompt: &str, max_tokens: usize) -> anyhow::Result<String> {
        // Load the JSON grammar
        // let grammar_content = include_str!("path/to/json_arr.gbnf");
        let grammar = LlamaGrammar::from_str(
            r#"root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null")

object ::=
  "{" (
            string ":" value
    ("," string ":" value)*
  )? "}" 

array  ::=
  "[" (
            value
    ("," value)*
  )? "]" 

string ::=
  "\"" (
    [^"\\] |
    "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]) # escapes
  )* "\""

number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [-+]? [0-9]+)?"#,
        )?;

        // Set the grammar for the context
        self.ctx.set_grammar(Some(&grammar))?;

        let tokens_list = self.model.str_to_token(prompt, AddBos::Always)?;
        let mut batch = LlamaBatch::new(512, 1);

        let last_index = tokens_list.len() as i32 - 1;
        for (i, token) in (0_i32..).zip(tokens_list.into_iter()) {
            let is_last = i == last_index;
            batch.add(token, i, &[0], is_last)?;
        }

        self.ctx.decode(&mut batch)?;

        let mut output = String::new();
        let mut n_cur = batch.n_tokens();

        while n_cur <= max_tokens as i32 {
            let candidates = self.ctx.candidates_ith(batch.n_tokens() - 1);
            let candidates_p = LlamaTokenDataArray::from_iter(candidates, false);

            if candidates_p.data.is_empty() {
                break; // No valid tokens according to the grammar
            }

            let new_token_id = self.ctx.sample_token_greedy(candidates_p);

            if new_token_id == self.model.token_eos() {
                break;
            }

            let token_str = self.model.token_to_str(new_token_id, Special::Plaintext)?;
            output.push_str(&token_str);

            batch.clear();
            batch.add(new_token_id, n_cur, &[0], true)?;
            n_cur += 1;
            self.ctx.decode(&mut batch)?;
        }

        // Clear the grammar after generation
        self.ctx.set_grammar(None)?;

        Ok(output)
    }
}

pub async fn create_llama_engine(repo: &str, model: &str) -> anyhow::Result<LlamaEngine> {
    LlamaEngine::new(repo, model).await
}
