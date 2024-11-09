use crate::pyannote::session;
use anyhow::{format_err, Context, Result};
use ndarray::{ArrayBase, Axis, IxDyn, ViewRepr};
use std::{cmp::Ordering, path::Path};

use super::{embedding::EmbeddingExtractor, identify::EmbeddingManager};

#[derive(Debug, Clone)]
#[repr(C)]
pub struct SpeechSegment {
    pub start: f64,
    pub end: f64,
    pub samples: Vec<f32>,
    pub speaker: String,
    pub embedding: Vec<f32>,
}

fn find_max_index(row: ArrayBase<ViewRepr<&f32>, IxDyn>) -> Result<usize> {
    let (max_index, _) = row
        .iter()
        .enumerate()
        .max_by(|a, b| {
            a.1.partial_cmp(b.1)
                .context("Comparison error")
                .unwrap_or(Ordering::Equal)
        })
        .context("sub_row should not be empty")?;
    Ok(max_index)
}

fn create_speech_segment(
    start_offset: f64,
    offset: i32,
    sample_rate: u32,
    samples: &[f32],
    padded_samples: &[f32],
    embedding_extractor: &mut EmbeddingExtractor,
    embedding_manager: &mut EmbeddingManager,
) -> Result<SpeechSegment> {
    let start = start_offset / sample_rate as f64;
    let end = offset as f64 / sample_rate as f64;

    let start_f64 = start * (sample_rate as f64);
    let end_f64 = end * (sample_rate as f64);

    let start_idx = start_f64.min((samples.len() - 1) as f64) as usize;
    let end_idx = end_f64.min(samples.len() as f64) as usize;

    let segment_samples = &padded_samples[start_idx..end_idx];
    let embedding = get_speaker_embedding(embedding_extractor, segment_samples);
    let speaker = get_speaker_from_embedding(embedding_manager, embedding.clone());

    Ok(SpeechSegment {
        start,
        end,
        samples: segment_samples.to_vec(),
        speaker,
        embedding,
    })
}

fn handle_new_segment(
    current_segment: Option<SpeechSegment>,
    new_segment: SpeechSegment,
    segments: &mut Vec<SpeechSegment>,
) -> Option<SpeechSegment> {
    if let Some(mut prev_segment) = current_segment {
        if prev_segment.speaker == new_segment.speaker {
            // Merge segments
            prev_segment.end = new_segment.end;
            prev_segment.samples.extend(new_segment.samples);
            Some(prev_segment)
        } else {
            // Different speaker, push previous and start new
            segments.push(prev_segment);
            Some(new_segment)
        }
    } else {
        Some(new_segment)
    }
}

pub fn get_segments<P: AsRef<Path>>(
    samples: &[f32],
    sample_rate: u32,
    model_path: P,
    embedding_extractor: &mut EmbeddingExtractor,
    embedding_manager: &mut EmbeddingManager,
) -> Result<Vec<SpeechSegment>> {
    let session = session::create_session(model_path.as_ref())?;

    let frame_size = 270;
    let frame_start = 721;
    let window_size = (sample_rate * 10) as usize;
    let mut is_speeching = false;
    let mut offset: i32 = frame_start;
    let mut start_offset = 0.0;

    let padded_samples = {
        let mut padded = Vec::from(samples);
        padded.extend(vec![0.0; window_size - (samples.len() % window_size)]);
        padded
    };

    let mut segments = Vec::new();
    let mut current_segment: Option<SpeechSegment> = None;

    for start in (0..padded_samples.len()).step_by(window_size) {
        let end = (start + window_size).min(padded_samples.len());
        let window = &padded_samples[start..end];

        let array = ndarray::Array1::from_vec(window.to_vec());
        let array = array
            .view()
            .insert_axis(Axis(0))
            .insert_axis(Axis(1))
            .to_owned();

        let inputs = ort::inputs![array].context("Failed to prepare inputs")?;
        let ort_outs = session.run(inputs).context("Failed to run the session")?;

        let ort_out = ort_outs.get("output").context("Output tensor not found")?;

        let ort_out = match ort_out
            .try_extract_tensor::<f32>()
            .context("Failed to extract tensor")
        {
            Ok(tensor) => tensor,
            Err(e) => return Err(format_err!("Tensor extraction error: {:?}", e)),
        };

        for row in ort_out.outer_iter() {
            for sub_row in row.axis_iter(Axis(0)) {
                let max_index = find_max_index(sub_row)?;

                if max_index != 0 {
                    if !is_speeching {
                        start_offset = offset as f64;
                        is_speeching = true;
                    }
                } else if is_speeching {
                    let new_segment = create_speech_segment(
                        start_offset,
                        offset,
                        sample_rate,
                        samples,
                        &padded_samples,
                        embedding_extractor,
                        embedding_manager,
                    )?;

                    current_segment =
                        handle_new_segment(current_segment, new_segment, &mut segments);
                    is_speeching = false;
                }
                offset += frame_size;
            }
        }
    }

    if let Some(last_segment) = current_segment {
        segments.push(last_segment);
    }

    Ok(segments)
}

fn get_speaker_embedding(
    embedding_extractor: &mut EmbeddingExtractor,
    samples: &[f32],
) -> Vec<f32> {
    embedding_extractor.compute(samples).unwrap().collect()
}

pub fn get_speaker_from_embedding(
    embedding_manager: &mut EmbeddingManager,
    embedding: Vec<f32>,
) -> String {
    let search_threshold = 0.5;

    embedding_manager
        .search_speaker(embedding.clone(), search_threshold)
        .ok_or_else(|| embedding_manager.search_speaker(embedding, 0.0)) // Ensure always to return speaker
        .map(|r| r.to_string())
        .unwrap_or("?".into())
}
