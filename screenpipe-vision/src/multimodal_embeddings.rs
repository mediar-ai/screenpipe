use std::ops::Mul;

use anyhow::Result;
use candle::{DType, Device, Tensor};
use candle_nn::{ops::softmax, VarBuilder};
use candle_transformers::models::siglip::{Config, Model as SiglipModel};
use image::DynamicImage;
use tokenizers::Tokenizer;

pub struct MultimodalEmbedder {
    model: SiglipModel,
    tokenizer: Tokenizer,
    device: Device,
    config: Config,
}

impl MultimodalEmbedder {
    pub fn new(device: &Device) -> Result<Self> {
        let config = Config::base_patch16_224();

        // Load the model weights from safetensors file
        let model_file = {
            let api = hf_hub::api::sync::Api::new()?;
            let api = api.model("google/siglip-base-patch16-224".to_string());
            api.get("model.safetensors")?
        };

        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[model_file], DType::F32, device)? };

        let model = SiglipModel::new(&config, vb)?;
        let tokenizer = Self::get_tokenizer(None)?;

        Ok(Self {
            model,
            tokenizer,
            device: device.clone(),
            config,
        })
    }

    fn get_tokenizer(tokenizer_path: Option<String>) -> Result<Tokenizer> {
        let tokenizer_path = match tokenizer_path {
            None => {
                let api = hf_hub::api::sync::Api::new()?;
                let api = api.model("google/siglip-base-patch16-224".to_string());
                api.get("tokenizer.json")?
            }
            Some(path) => path.into(),
        };

        Tokenizer::from_file(tokenizer_path).map_err(anyhow::Error::msg)
    }

    pub fn compute_embeddings(
        &self,
        image: &DynamicImage,
        ocr_text: &str,
    ) -> Result<(Tensor, Tensor)> {
        let image_tensor = self.preprocess_image(image)?;
        let text_tensor = self.tokenize_text(ocr_text)?;

        let (text_embeddings, image_embeddings) =
            self.model.forward(&image_tensor, &text_tensor)?;
        Ok((text_embeddings, image_embeddings))
    }

    pub fn compute_similarity(
        &self,
        text_embeddings: &Tensor,
        image_embeddings: &Tensor,
    ) -> anyhow::Result<Tensor> {
        // compute dot product between text and image embeddings
        let similarity = text_embeddings.matmul(&image_embeddings.transpose(0, 1)?)?;

        // apply softmax to get probabilities
        let similarity = softmax(&similarity, 1)?;

        Ok(similarity)
    }

    fn preprocess_image(&self, image: &DynamicImage) -> Result<Tensor> {
        let image_size = self.config.vision_config.image_size;
        let img = image.resize_to_fill(
            image_size as u32,
            image_size as u32,
            image::imageops::FilterType::Triangle,
        );
        let img = img.to_rgb8();
        let img = img.into_raw();
        let img = Tensor::from_vec(img, (image_size, image_size, 3), &self.device)?
            .permute((2, 0, 1))?
            .to_dtype(DType::F32)?
            .affine(2. / 255., -1.)?
            .unsqueeze(0)?;
        Ok(img)
    }

    fn tokenize_text(&self, text: &str) -> anyhow::Result<Tensor> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| anyhow::anyhow!(e))?;
        let mut tokens = encoding.get_ids().to_vec();
        let max_len = self.config.text_config.max_position_embeddings;
        let pad_id = self.config.text_config.pad_token_id;

        // Pad the sequence to have the correct length
        let len_diff = max_len - tokens.len();
        if len_diff > 0 {
            tokens.extend(vec![pad_id; len_diff]);
        }

        let input_ids = Tensor::new(vec![tokens], &self.device)?;
        Ok(input_ids)
    }
}
