use anyhow::{Context, Result};
use ndarray::Array2;
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct EmbeddingExtractor {
    embedding_model_path: PathBuf,
}

impl EmbeddingExtractor {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        Ok(Self {
            embedding_model_path: model_path.as_ref().to_path_buf(),
        })
    }
    pub fn compute(&mut self, samples: &[f32]) -> Result<impl Iterator<Item = f32>> {
        let session = super::create_session(&self.embedding_model_path)?;
        let features: Array2<f32> = knf_rs::compute_fbank(samples).map_err(anyhow::Error::msg)?;
        let features = features.insert_axis(ndarray::Axis(0)); // Add batch dimension
        let inputs = ort::inputs! ["feats" => features.view()]?;

        let ort_outs = session.run(inputs)?;
        let ort_out = ort_outs
            .get("embs")
            .context("Output tensor not found")?
            .try_extract_tensor::<f32>()
            .context("Failed to extract tensor")?;

        // Collect the tensor data into a Vec to own it
        let embeddings: Vec<f32> = ort_out.iter().copied().collect();

        // Return an iterator over the Vec
        Ok(embeddings.into_iter())
    }
}
