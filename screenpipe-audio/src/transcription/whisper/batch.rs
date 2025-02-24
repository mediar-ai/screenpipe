use super::decoder::{Decoder, Segment};
use super::detect_language;
use super::model::WhisperModel;
use crate::utils::audio::pcm_to_mel;
use anyhow::Result;
use candle::Tensor;
use lazy_static::lazy_static;
use regex::Regex;
use screenpipe_core::Language;
use std::collections::HashSet;
use tracing::debug;

lazy_static! {
    static ref TOKEN_REGEX: Regex = Regex::new(r"<\|\d{1,2}\.\d{1,2}\|>").unwrap();
}

/// Processes audio data using the Whisper model to generate transcriptions.
///
/// # Arguments
/// * `whisper_model` - The Whisper model instance
/// * `audio` - Raw audio PCM data
/// * `mel_filters` - Mel filter bank coefficients
/// * `languages` - List of languages to consider for detection
///
/// # Returns
/// A string containing the processed transcript
pub async fn process_with_whisper(
    whisper_model: &mut WhisperModel,
    audio: &[f32],
    mel_filters: &[f32],
    languages: Vec<Language>,
) -> Result<String> {
    let model = &mut whisper_model.model.lock().await;
    let tokenizer = &whisper_model.tokenizer.lock().await;
    let device = &whisper_model.device.lock().await;

    debug!("converting pcm to mel spectrogram");
    let mel = pcm_to_mel(model.config(), audio, mel_filters);
    let mel_len = mel.len();

    debug!("creating tensor from mel spectrogram");
    let mel = Tensor::from_vec(
        mel,
        (
            1,
            model.config().num_mel_bins,
            mel_len / model.config().num_mel_bins,
        ),
        device,
    )?;

    debug!("detecting language");
    let language_token = Some(detect_language(model, tokenizer, &mel, languages.clone())?);

    debug!("initializing decoder");
    let mut dc = Decoder::new(model, tokenizer, 42, device, language_token, true, false)?;

    debug!("starting decoding process");
    let segments = dc.run(&mel)?;
    debug!("decoding complete");

    process_segments(segments)
}

fn process_segments(segments: Vec<Segment>) -> Result<String> {
    let mut unique_ranges = HashSet::new();
    let mut transcript = String::new();

    let time_bounds = segments
        .iter()
        .fold((f32::MAX, f32::MIN), |(min, max), _| (min, max));
    let (mut min_time, mut max_time) = time_bounds;

    for (idx, segment) in segments.iter().enumerate() {
        let text = segment.dr.text.clone();
        let (start_token, end_token) = extract_time_tokens(&text)?;
        let (start_time, end_time) =
            parse_time_tokens(&start_token, &end_token, &mut min_time, &mut max_time);

        // Skip if this is the last segment and spans the entire time range
        if segments.len() > 1
            && idx == segments.len() - 1
            && start_time == min_time
            && end_time == max_time
        {
            continue;
        }

        let range_key = format!("{}{}", start_token, end_token);
        if unique_ranges.insert(range_key) {
            let cleaned_text = TOKEN_REGEX.replace_all(&text, "").into_owned();
            transcript.push_str(&cleaned_text);
            transcript.push('\n');
        }
    }

    Ok(transcript)
}

fn extract_time_tokens(text: &str) -> Result<(String, String)> {
    let tokens: Vec<&str> = TOKEN_REGEX.find_iter(text).map(|m| m.as_str()).collect();

    let start = tokens
        .first()
        .ok_or_else(|| anyhow::anyhow!("Missing start time token"))?
        .to_string();
    let end = tokens
        .last()
        .ok_or_else(|| anyhow::anyhow!("Missing end time token"))?
        .to_string();

    Ok((start, end))
}

fn parse_time_tokens(start: &str, end: &str, min_time: &mut f32, max_time: &mut f32) -> (f32, f32) {
    lazy_static! {
        static ref NUM_REGEX: Regex = Regex::new(r"([<>|])").unwrap();
    }

    let parse_token = |token: &str, default: f32| -> f32 {
        NUM_REGEX.replace_all(token, "").parse().unwrap_or(default)
    };

    let start_time = parse_token(start, *min_time);
    let end_time = parse_token(end, *max_time);

    *min_time = start_time.min(*min_time);
    *max_time = end_time.max(*max_time);

    (start_time, end_time)
}
