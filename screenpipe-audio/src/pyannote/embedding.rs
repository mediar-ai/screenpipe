use crate::pyannote::session;
use anyhow::{Context, Result};
use ndarray::Array2;
use ort::Session;
use std::{path::Path, sync::Mutex};

#[derive(Debug)]
pub struct EmbeddingExtractor {}

lazy_static::lazy_static! {
    static ref EMBEDDING_SESSION: Mutex<Option<Session>> = Mutex::new(None);
}

impl EmbeddingExtractor {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let mut session = EMBEDDING_SESSION.lock().unwrap();
        if session.is_none() {
            *session = Some(session::create_session(model_path.as_ref(), false)?);
        }
        Ok(Self {})
    }
    pub fn compute(&mut self, samples: &[f32]) -> Result<impl Iterator<Item = f32>> {
        let session = EMBEDDING_SESSION.lock().unwrap();
        let session = session.as_ref().unwrap();
        let features: Array2<f32> = knf_rs::compute_fbank(samples).map_err(anyhow::Error::msg)?;
        let features = features.insert_axis(ndarray::Axis(0)); // Add batch dimension
        let inputs = ort::inputs! ["feats" => features.view()]?;

        let ort_outs = session.run(inputs).context("Failed to run the session")?;
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
