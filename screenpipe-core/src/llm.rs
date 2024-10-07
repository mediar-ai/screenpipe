#[cfg(feature = "llm")]
mod llm_module {

    use serde::{Deserialize, Serialize};

    use crate::Llama;
    #[derive(Deserialize, Serialize, Clone, Debug)]
    pub struct ChatMessage {
        pub role: String,
        pub content: String,
    }

    #[derive(Deserialize, Serialize)]
    pub struct ChatResponseChoice {
        pub index: i64,
        pub message: ChatMessage,
        pub logprobs: Option<serde_json::Value>,
        pub finish_reason: String,
    }

    #[derive(Deserialize, Serialize)]
    pub struct ChatResponseUsage {
        pub prompt_tokens: i64,
        pub completion_tokens: i64,
        pub total_tokens: i64,
        pub completion_tokens_details: serde_json::Value,
        pub tokens_per_second: f64,
    }

    #[derive(Serialize, Deserialize)]
    pub struct ChatResponse {
        pub id: String,
        pub object: String,
        pub created: i64,
        pub model: String,
        pub system_fingerprint: String,
        pub choices: Vec<ChatResponseChoice>,
        pub usage: ChatResponseUsage,
    }

    #[derive(Deserialize, Clone, Debug)]
    pub struct ChatRequest {
        pub messages: Vec<ChatMessage>,
        #[serde(default)]
        pub stream: bool,
        pub max_completion_tokens: Option<usize>,
        pub temperature: Option<f64>,
        pub top_p: Option<f64>,
        pub top_k: Option<usize>,
        pub seed: Option<u64>,
    }

    pub trait Model {
        fn chat(&self, request: ChatRequest) -> anyhow::Result<ChatResponse>;
    }

    pub struct LLM {
        model: Llama,
    }

    pub enum ModelName {
        Llama,
    }

    impl LLM {
        pub fn new(model_name: ModelName) -> anyhow::Result<Self> {
            let model = match model_name {
                ModelName::Llama => Llama::new()?,
            };

            Ok(Self { model })
        }

        pub fn chat(&self, request: ChatRequest) -> anyhow::Result<ChatResponse> {
            self.model.chat(request)
        }
    }
    /// This is a wrapper around a tokenizer to ensure that tokens can be returned to the user in a
    /// streaming way rather than having to wait for the full decoding.
    pub struct TokenOutputStream {
        tokenizer: tokenizers::Tokenizer,
        tokens: Vec<u32>,
        prev_index: usize,
        current_index: usize,
    }

    impl TokenOutputStream {
        pub fn new(tokenizer: tokenizers::Tokenizer) -> Self {
            Self {
                tokenizer,
                tokens: Vec::new(),
                prev_index: 0,
                current_index: 0,
            }
        }

        pub fn into_inner(self) -> tokenizers::Tokenizer {
            self.tokenizer
        }

        fn decode(&self, tokens: &[u32]) -> anyhow::Result<String> {
            match self.tokenizer.decode(tokens, true) {
                Ok(str) => Ok(str),
                Err(err) => anyhow::bail!("cannot decode: {err}"),
            }
        }

        // https://github.com/huggingface/text-generation-inference/blob/5ba53d44a18983a4de32d122f4cb46f4a17d9ef6/server/text_generation_server/models/model.py#L68
        pub fn next_token(&mut self, token: u32) -> anyhow::Result<Option<String>> {
            let prev_text = if self.tokens.is_empty() {
                String::new()
            } else {
                let tokens = &self.tokens[self.prev_index..self.current_index];
                self.decode(tokens)?
            };
            self.tokens.push(token);
            let text = self.decode(&self.tokens[self.prev_index..])?;
            if text.len() > prev_text.len() && text.chars().last().unwrap().is_alphanumeric() {
                let text = text.split_at(prev_text.len());
                self.prev_index = self.current_index;
                self.current_index = self.tokens.len();
                Ok(Some(text.1.to_string()))
            } else {
                Ok(None)
            }
        }

        pub fn decode_rest(&self) -> anyhow::Result<Option<String>> {
            let prev_text = if self.tokens.is_empty() {
                String::new()
            } else {
                let tokens = &self.tokens[self.prev_index..self.current_index];
                self.decode(tokens)?
            };
            let text = self.decode(&self.tokens[self.prev_index..])?;
            if text.len() > prev_text.len() {
                let text = text.split_at(prev_text.len());
                Ok(Some(text.1.to_string()))
            } else {
                Ok(None)
            }
        }

        pub fn decode_all(&self) -> anyhow::Result<String> {
            self.decode(&self.tokens)
        }

        pub fn get_token(&self, token_s: &str) -> Option<u32> {
            self.tokenizer.get_vocab(true).get(token_s).copied()
        }

        pub fn tokenizer(&self) -> &tokenizers::Tokenizer {
            &self.tokenizer
        }

        pub fn clear(&mut self) {
            self.tokens.clear();
            self.prev_index = 0;
            self.current_index = 0;
        }
    }
}

// Optionally, you can re-export the module contents if needed
#[cfg(feature = "llm")]
pub use llm_module::*;
