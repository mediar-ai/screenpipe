use crate::pyannote::session;
use anyhow::{Context, Result};
use ndarray::Array2;
use ort::Session;
use std::{path::Path, sync::Mutex};
use tracing::debug;

#[derive(Debug)]
pub struct EmbeddingExtractor {}

lazy_static::lazy_static! {
    static ref EMBEDDING_SESSION: Mutex<Option<Session>> = Mutex::new(None);
}

impl EmbeddingExtractor {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        debug!(
            "initializing embedding extractor with model: {:?}",
            model_path.as_ref()
        );
        let mut session = EMBEDDING_SESSION.lock().unwrap();
        if session.is_none() {
            debug!("creating new embedding session");
            *session = Some(session::create_session(model_path.as_ref(), false)?);
        }
        Ok(Self {})
    }
    pub fn compute(&mut self, samples: &[f32]) -> Result<impl Iterator<Item = f32>> {
        debug!("computing embeddings for {} samples", samples.len());
        let session = EMBEDDING_SESSION.lock().unwrap();
        let session = session.as_ref().unwrap();

        debug!("computing fbank features");
        let features: Array2<f32> = knf_rs::compute_fbank(samples).map_err(anyhow::Error::msg)?;
        let features = features.insert_axis(ndarray::Axis(0)); // Add batch dimension
        debug!("features shape: {:?}", features.shape());

        let inputs = ort::inputs! ["feats" => features.view()]?;
        debug!("running inference");
        let ort_outs = session.run(inputs).context("Failed to run the session")?;

        let ort_out = ort_outs
            .get("embs")
            .context("Output tensor not found")?
            .try_extract_tensor::<f32>()
            .context("Failed to extract tensor")?;

        debug!("extracted embeddings tensor shape: {:?}", ort_out.shape());

        // Collect the tensor data into a Vec to own it
        let embeddings: Vec<f32> = ort_out.iter().copied().collect();
        debug!("created embeddings vector of size: {}", embeddings.len());

        // Return an iterator over the Vec
        Ok(embeddings.into_iter())
    }
}
