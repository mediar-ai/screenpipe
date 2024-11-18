use anyhow::{bail, Result};
use ndarray::Array1;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct EmbeddingManager {
    max_speakers: usize,
    speakers: HashMap<usize, Array1<f32>>,
    next_speaker_id: usize,
}

impl EmbeddingManager {
    pub fn new(max_speakers: usize) -> Self {
        Self {
            max_speakers,
            speakers: HashMap::new(),
            next_speaker_id: 1,
        }
    }

    fn cosine_similarity(a: &Array1<f32>, b: &Array1<f32>) -> f32 {
        let dot_product = a.dot(b);
        let norm_a = a.dot(a).sqrt();
        let norm_b = b.dot(b).sqrt();
        dot_product / (norm_a * norm_b)
    }

    /// Search or create speaker
    pub fn search_speaker(&mut self, embedding: Vec<f32>, threshold: f32) -> Option<usize> {
        let embedding_array = Array1::from_vec(embedding);
        let mut best_speaker_id = None;
        let mut best_similarity = threshold;

        for (&speaker_id, speaker_embedding) in &self.speakers {
            let similarity = Self::cosine_similarity(&embedding_array, speaker_embedding);
            if similarity > best_similarity {
                best_speaker_id = Some(speaker_id);
                best_similarity = similarity;
            }
        }

        match best_speaker_id {
            Some(id) => Some(id),
            None if self.speakers.len() < self.max_speakers => {
                Some(self.add_speaker(embedding_array))
            }
            None => None,
        }
    }

    pub fn get_best_speaker_match(&mut self, embedding: Vec<f32>) -> Result<usize> {
        if self.speakers.is_empty() {
            bail!("no speakers")
        }
        let embedding_array = Array1::from_vec(embedding);
        let mut best_speaker_id = 0;
        let mut best_similarity = f32::MIN; // Initialize to the lowest possible value

        for (&speaker_id, speaker_embedding) in &self.speakers {
            let similarity = Self::cosine_similarity(&embedding_array, speaker_embedding);
            if similarity > best_similarity {
                best_speaker_id = speaker_id;
                best_similarity = similarity;
            }
        }
        Ok(best_speaker_id)
    }

    fn add_speaker(&mut self, embedding: Array1<f32>) -> usize {
        let speaker_id = self.next_speaker_id;
        self.speakers.insert(speaker_id, embedding);
        self.next_speaker_id += 1;
        speaker_id
    }

    #[allow(unused)]
    pub fn get_all_speakers(&self) -> &HashMap<usize, Array1<f32>> {
        &self.speakers
    }
}
