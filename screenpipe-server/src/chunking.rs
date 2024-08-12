use anyhow::Result;
use candle::{DType, Device, Tensor};
use candle_nn::{Module, VarBuilder};
use candle_transformers::models::jina_bert::{BertModel, Config};
use hf_hub::{api::sync::Api, Repo, RepoType};
use tokenizers::Tokenizer;

pub async fn text_chunking_by_similarity(text: &str) -> Result<Vec<String>> {
    let device =
        Device::new_metal(0).unwrap_or_else(|_| Device::new_cuda(0).unwrap_or(Device::Cpu));
    let repo = Repo::with_revision(
        "jinaai/jina-embeddings-v2-base-en".to_string(),
        RepoType::Model,
        "main".to_string(),
    );
    let api = Api::new()?;
    let model_file = api.repo(repo.clone()).get("model.safetensors")?;
    let tokenizer_file = api.repo(repo).get("tokenizer.json")?;

    let tokenizer = Tokenizer::from_file(tokenizer_file).map_err(anyhow::Error::msg)?;
    let config = Config::v2_base();
    let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[model_file], DType::F32, &device)? };
    let model = BertModel::new(vb, &config)?;

    let sentences: Vec<&str> = text
        .split(&['.', '!', '?', '\n'][..])
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim())
        .collect();

    let mut chunks = Vec::new();
    let mut current_chunk = String::new();
    let mut previous_embedding: Option<Tensor> = None;
    let similarity_threshold = 0.8;
    let max_chunk_length = 300;

    for sentence in sentences {
        let tokens = tokenizer
            .encode(sentence, true)
            .map_err(anyhow::Error::msg)?;
        let token_ids = Tensor::new(tokens.get_ids(), &device)?;
        let embeddings = model.forward(&token_ids.unsqueeze(0)?)?;
        let sentence_embedding = embeddings.mean(1)?;

        let should_split = if let Some(prev_emb) = &previous_embedding {
            let similarity = cosine_similarity(&sentence_embedding, prev_emb)?;
            similarity < similarity_threshold
                || current_chunk.len() + sentence.len() > max_chunk_length
        } else {
            false
        };

        if should_split && !current_chunk.is_empty() {
            chunks.push(current_chunk);
            current_chunk = String::new();
        }

        if !current_chunk.is_empty() {
            current_chunk.push(' ');
        }
        current_chunk.push_str(sentence);
        previous_embedding = Some(sentence_embedding);
    }

    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }

    Ok(chunks)
}

pub fn text_chunking_simple(text: &str) -> Result<Vec<String>> {
    let mut chunks = Vec::new();
    let lines: Vec<&str> = text.split('\n').collect();

    if lines.len() > 1 {
        // Chunk by newlines
        chunks = lines.into_iter().map(String::from).collect();
    } else {
        // Chunk by fixed character count with overlap
        let chunk_size = 200;
        let overlap = 30;
        let chars: Vec<char> = text.chars().collect();
        let mut start = 0;

        while start < chars.len() {
            let end = (start + chunk_size).min(chars.len());
            chunks.push(chars[start..end].iter().collect());
            start = if end == chars.len() {
                end
            } else {
                end - overlap
            };
        }
    }

    Ok(chunks)
}

fn cosine_similarity(a: &Tensor, b: &Tensor) -> Result<f32> {
    let a = a.flatten_all()?;
    let b = b.flatten_all()?;
    let dot_product = (&a * &b)?.sum_all()?;
    let norm_a = a.sqr()?.sum_all()?.sqrt()?;
    let norm_b = b.sqr()?.sum_all()?.sqrt()?;
    let similarity = dot_product.to_scalar::<f32>()?
        / (norm_a.to_scalar::<f32>()? * norm_b.to_scalar::<f32>()?);
    Ok(similarity)
}
