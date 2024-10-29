use crate::pyannote::session;
use anyhow::{format_err, Context, Result};
use ndarray::{ArrayBase, Axis, IxDyn, ViewRepr};
use std::{cmp::Ordering, path::Path};

#[derive(Debug, Clone)]
#[repr(C)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub samples: Vec<f32>,
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

pub fn get_segments<P: AsRef<Path>>(
    samples: &[f32],
    sample_rate: u32,
    model_path: P,
) -> Result<impl Iterator<Item = Result<Segment>> + '_> {
    // Create session using the provided model path
    let session = session::create_session(model_path.as_ref())?;

    // Define frame parameters
    let frame_size = 270;
    let frame_start = 721;
    let window_size = (sample_rate * 5) as usize; // 10 seconds
    let mut is_speeching = false;
    let mut offset = frame_start;
    let mut start_offset = 0.0;

    // Pad end with silence for full last segment
    let padded_samples = {
        let mut padded = Vec::from(samples);
        padded.extend(vec![0.0; window_size - (samples.len() % window_size)]);
        padded
    };

    let mut start_iter = (0..padded_samples.len()).step_by(window_size);

    let mut segments = Vec::new();

    Ok(std::iter::from_fn(move || {
        while let Some(start) = start_iter.next() {
            let end = (start + window_size).min(padded_samples.len());
            let window = &padded_samples[start..end];

            // Convert window to ndarray::Array1 and ensure single ownership
            let array = ndarray::Array1::from_vec(window.to_vec());
            let array = array
                .view()
                .insert_axis(Axis(0))
                .insert_axis(Axis(1))
                .to_owned();

            // Handle potential errors during the session and input processing
            let inputs = match ort::inputs![array] {
                Ok(inputs) => inputs,
                Err(e) => return Some(Err(format_err!("Failed to prepare inputs: {:?}", e))),
            };

            let ort_outs = match session.run(inputs) {
                Ok(outputs) => outputs,
                Err(e) => return Some(Err(format_err!("Failed to run the session: {:?}", e))),
            };

            let ort_out = match ort_outs.get("output").context("Output tensor not found") {
                Ok(output) => output,
                Err(e) => return Some(Err(format_err!("Output tensor error: {:?}", e))),
            };

            let ort_out = match ort_out
                .try_extract_tensor::<f32>()
                .context("Failed to extract tensor")
            {
                Ok(tensor) => tensor,
                Err(e) => return Some(Err(format_err!("Tensor extraction error: {:?}", e))),
            };

            for row in ort_out.outer_iter() {
                for sub_row in row.axis_iter(Axis(0)) {
                    let max_index = match find_max_index(sub_row) {
                        Ok(index) => index,
                        Err(e) => return Some(Err(format_err!(e))),
                    };

                    if max_index != 0 {
                        if !is_speeching {
                            start_offset = offset as f64;
                            is_speeching = true;
                        }
                    } else if is_speeching {
                        let start = start_offset / sample_rate as f64;
                        let end = offset as f64 / sample_rate as f64;

                        let start_f64 = start * (sample_rate as f64);
                        let end_f64 = end * (sample_rate as f64);

                        let start_idx = start_f64.min((samples.len() - 1) as f64) as usize;
                        let end_idx = end_f64.min(samples.len() as f64) as usize;

                        let segment_samples = &padded_samples[start_idx..end_idx];

                        is_speeching = false;

                        segments.push(Ok(Segment {
                            start,
                            end,
                            samples: segment_samples.to_vec(),
                        }));
                    }
                    offset += frame_size;
                }
            }
        }
        segments.pop()
    }))
}
