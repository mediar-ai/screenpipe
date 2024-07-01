use candle::Tensor;
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, HiddenAct, DTYPE};
use lazy_static::lazy_static;

use std::sync::Mutex;
use tokenizers::{PaddingParams, Tokenizer};

lazy_static! {
    static ref MODEL: Mutex<Option<(BertModel, Tokenizer)>> = Mutex::new(None);
}

// Function to initialize the model and tokenizer from local files
pub fn init_model(
    config_path: &str,
    tokenizer_path: &str,
    weights_path: &str,
    approximate_gelu: bool,
) -> bool {
    let device = candle::Device::Cpu;

    // Load config
    let config_contents = std::fs::read_to_string(config_path).unwrap();
    let mut config: Config = serde_json::from_str(&config_contents).unwrap();

    // Load tokenizer
    let tokenizer = Tokenizer::from_file(tokenizer_path).unwrap();

    // Load weights
    let vb =
        unsafe { VarBuilder::from_mmaped_safetensors(&[weights_path], DTYPE, &device).unwrap() };

    if approximate_gelu {
        config.hidden_act = HiddenAct::GeluApproximate;
    }

    let model = BertModel::load(vb, &config).unwrap();

    // Store model and tokenizer in the global MODEL variable
    let mut model_guard = MODEL.lock().unwrap();
    *model_guard = Some((model, tokenizer));
    true
}

pub struct EmbeddingResult {
    pub embeddings: Vec<f32>,
    pub len: usize,
    pub error: String,
}

impl EmbeddingResult {
    fn from_error_string(e: &str) -> EmbeddingResult {
        return EmbeddingResult {
            embeddings: vec![],
            len: 0,
            error: e.to_owned(),
        };
    }

    fn from_err(e: Box<dyn std::error::Error>) -> EmbeddingResult {
        EmbeddingResult::from_error_string(e.to_string().as_str())
    }
}

// Function to generate embeddings
pub fn generate_embeddings(text: &str) -> EmbeddingResult {
    let model_guard = MODEL.lock().unwrap();
    let (model, tokenizer) = match model_guard.as_ref() {
        Some(data) => data,
        None => return EmbeddingResult::from_error_string("Model not initialized"),
    };

    // Create a new tokenizer instance with the desired configuration
    let mut new_tokenizer = tokenizer.clone();
    new_tokenizer.with_padding(Some(PaddingParams::default()));

    if let Err(e) = new_tokenizer.with_truncation(None) {
        return EmbeddingResult::from_err(e);
    }

    let tokens = match tokenizer.encode(text, true) {
        Ok(t) => t,
        Err(e) => return EmbeddingResult::from_err(e),
    };

    let token_ids = match Tensor::new(&tokens.get_ids().to_vec()[..], &model.device)
        .unwrap()
        .unsqueeze(0)
    {
        Ok(t) => t,
        Err(e) => return EmbeddingResult::from_error_string(e.to_string().as_str()),
    };

    let token_type_ids = token_ids.zeros_like().unwrap();

    let embeddings = match model.forward(&token_ids, &token_type_ids) {
        Ok(e) => e,
        Err(e) => return EmbeddingResult::from_error_string(e.to_string().as_str()),
    };

    let (_n_sentence, n_tokens, _hidden_size) = match embeddings.dims3() {
        Ok(e) => e,
        Err(e) => {
            return EmbeddingResult::from_error_string(e.to_string().as_str());
        }
    };
    let summed = match embeddings.sum(1) {
        Ok(e) => e,
        Err(e) => {
            return EmbeddingResult::from_error_string(e.to_string().as_str());
        }
    };
    let embeddings = match summed / (n_tokens as f64) {
        Ok(e) => e,
        Err(e) => {
            return EmbeddingResult::from_error_string(e.to_string().as_str());
        }
    };

    // Flatten the tensor without changing the total number of elements
    let reshaped_embeddings = match embeddings.reshape(&[embeddings.elem_count()]) {
        Ok(r) => r,
        Err(e) => {
            return EmbeddingResult {
                embeddings: vec![],
                len: 0,
                error: e.to_string(),
            }
        }
    };

    let elem_count = reshaped_embeddings.elem_count();
    let out = match reshaped_embeddings.to_vec1::<f32>() {
        Ok(a) => a,
        Err(_e) => vec![],
    };

    EmbeddingResult {
        embeddings: out,
        len: elem_count,
        error: "".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_embeddings() {
        let config_path = "models/gte-small/config.json";
        let tokenizer_path = "models/gte-small/tokenizer.json";
        let weights_path = "models/gte-small/model.safetensors";

        // Initialize the model first
        init_model(config_path, tokenizer_path, weights_path, false);

        // Test embedding generation
        let text = "Test sentence for embeddings.";
        let result: EmbeddingResult = generate_embeddings(text);
        let arr = result.embeddings;
        assert_eq!(384, arr.len())
    }
}
