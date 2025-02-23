use anyhow::Error as E;
use candle::{DType, Device, Module, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::jina_bert::{BertModel, Config, PositionEmbeddingType};
use hf_hub::{api::sync::Api, Repo, RepoType};
use tokenizers::Tokenizer;
pub struct EmbeddingModel {
    model: BertModel,
    tokenizer: Tokenizer,
    device: candle::Device,
    normalize: bool,
}

impl EmbeddingModel {
    pub fn new(model_path: Option<String>, tokenizer_path: Option<String>) -> anyhow::Result<Self> {
        let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

        // default to jina-embeddings-v2-base-en if no paths provided
        let (model_path, tokenizer_path) = if model_path.is_none() || tokenizer_path.is_none() {
            let api = Api::new()?;
            let repo = api.repo(Repo::new(
                "jinaai/jina-embeddings-v2-base-en".to_string(),
                RepoType::Model,
            ));
            (repo.get("model.safetensors")?, repo.get("tokenizer.json")?)
        } else {
            (
                std::path::PathBuf::from(model_path.unwrap()),
                std::path::PathBuf::from(tokenizer_path.unwrap()),
            )
        };

        let tokenizer = Tokenizer::from_file(tokenizer_path).map_err(E::msg)?;

        let config = Config::new(
            tokenizer.get_vocab_size(true),
            768,
            12,
            12,
            3072,
            candle_nn::Activation::Gelu,
            8192,
            2,
            0.02,
            1e-12,
            0,
            PositionEmbeddingType::Alibi,
        );

        let vb =
            unsafe { VarBuilder::from_mmaped_safetensors(&[model_path], DType::F32, &device)? };
        let model = BertModel::new(vb, &config)?;

        Ok(Self {
            model,
            tokenizer,
            device,
            normalize: true,
        })
    }

    fn normalize_l2(&self, v: &Tensor) -> candle::Result<Tensor> {
        v.broadcast_div(&v.sqr()?.sum_keepdim(1)?.sqrt()?)
    }

    pub fn generate_embedding(&self, text: &str) -> anyhow::Result<Vec<f32>> {
        let tokens = self
            .tokenizer
            .encode(text, true)
            .map_err(E::msg)?
            .get_ids()
            .to_vec();

        let token_ids = Tensor::new(&tokens[..], &self.device)?.unsqueeze(0)?;
        let embeddings = self.model.forward(&token_ids)?;
        let (_, n_tokens, _) = embeddings.dims3()?;

        // mean pooling
        let embeddings = (embeddings.sum(1)? / (n_tokens as f64))?;

        let embeddings = if self.normalize {
            self.normalize_l2(&embeddings)?
        } else {
            embeddings
        };

        // convert to vec
        let embeddings = embeddings.squeeze(0)?;
        let embedding_vec = embeddings.to_vec1()?;

        Ok(embedding_vec)
    }

    pub fn generate_batch_embeddings(&self, texts: &[String]) -> anyhow::Result<Vec<Vec<f32>>> {
        // configure padding
        let mut tokenizer = self.tokenizer.clone();
        if let Some(pp) = tokenizer.get_padding_mut() {
            pp.strategy = tokenizers::PaddingStrategy::BatchLongest
        } else {
            let pp = tokenizers::PaddingParams {
                strategy: tokenizers::PaddingStrategy::BatchLongest,
                ..Default::default()
            };
            tokenizer.with_padding(Some(pp));
        }

        let tokens = tokenizer
            .encode_batch(texts.to_vec(), true)
            .map_err(E::msg)?;
        let token_ids: Vec<Tensor> = tokens
            .iter()
            .map(|tokens| {
                let tokens = tokens.get_ids().to_vec();
                Tensor::new(tokens.as_slice(), &self.device)
            })
            .collect::<candle::Result<Vec<_>>>()?;

        let token_ids = Tensor::stack(&token_ids, 0)?;
        let embeddings = self.model.forward(&token_ids)?;

        let (_, n_tokens, _) = embeddings.dims3()?;
        let embeddings = (embeddings.sum(1)? / (n_tokens as f64))?;

        let embeddings = if self.normalize {
            self.normalize_l2(&embeddings)?
        } else {
            embeddings
        };

        // convert to vec of vecs
        let mut result = Vec::new();
        for i in 0..texts.len() {
            let emb = embeddings.get(i)?;
            result.push(emb.to_vec1()?);
        }

        Ok(result)
    }
}
