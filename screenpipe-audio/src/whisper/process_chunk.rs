use super::Segment;
use crate::{
    multilingual,
    whisper::{Decoder, WhisperModel},
};
use anyhow::Result;
use candle::Tensor;
use candle_transformers::models::whisper::audio;
use lazy_static::lazy_static;
use log::debug;
use regex::Regex;
use screenpipe_core::Language;
use std::{collections::HashSet, sync::Arc};
use tokio::sync::Mutex;

lazy_static! {
    static ref TOKEN_REGEX: Regex = Regex::new(r"<\|\d{1,2}\.\d{1,2}\|>").unwrap();
}

pub async fn process_with_whisper(
    whisper_model: Arc<Mutex<WhisperModel>>,
    audio: &[f32],
    languages: Vec<Language>,
) -> Result<String> {
    let mut whisper = whisper_model.lock().await;
    let WhisperModel {
        model,
        tokenizer,
        device,
        mel_filters,
    } = &mut *whisper;

    debug!("converting pcm to mel spectrogram");
    let mel = audio::pcm_to_mel(model.config(), audio, mel_filters);
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
    let language_token = Some(multilingual::detect_language(
        model,
        tokenizer,
        &mel,
        languages.clone(),
    )?);

    debug!("initializing decoder");
    let mut dc = Decoder::new(model, tokenizer, 42, device, language_token, true, false)?;

    debug!("starting decoding process");
    let segments = dc.run(&mel)?;
    debug!("decoding complete");

    process_segments(segments)
}

fn process_segments(segments: Vec<Segment>) -> Result<String> {
    let mut ranges: HashSet<String> = HashSet::new();
    let mut transcript = String::new();

    let mut min_time: f32 = f32::MAX;
    let mut max_time: f32 = f32::MIN;
    let segments_len = segments.len();

    for (i, segment) in segments.iter().enumerate() {
        let mut text = segment.dr.text.clone();

        // Extract start and end times
        let (start, end) = extract_time_tokens(&text, &TOKEN_REGEX);
        let (s_time, e_time) = parse_time_tokens(&start, &end, &mut min_time, &mut max_time);

        let range = format!("{}{}", start, end);
        if ranges.insert(range) {
            if segments_len > 1 && i == segments_len - 1 && s_time == min_time && e_time == max_time
            {
                continue;
            }

            text = TOKEN_REGEX.replace_all(&text, "").to_string();
            text.push('\n');
            transcript.push_str(&text);
        }
    }

    Ok(transcript)
}

fn extract_time_tokens(text: &str, token_regex: &Regex) -> (String, String) {
    let tokens = token_regex
        .find_iter(text)
        .map(|m| m.as_str())
        .collect::<Vec<&str>>();

    let start = tokens.first().unwrap().to_string();
    let end = tokens.last().unwrap().to_string();

    (start, end)
}

fn parse_time_tokens(start: &str, end: &str, min_time: &mut f32, max_time: &mut f32) -> (f32, f32) {
    let num_regex = Regex::new(r"([<>|])").unwrap();
    let s_time = num_regex
        .replace_all(start, "")
        .parse::<f32>()
        .unwrap_or(*min_time);
    let e_time = num_regex
        .replace_all(end, "")
        .parse::<f32>()
        .unwrap_or(*max_time);

    if *min_time > s_time {
        *min_time = s_time;
    }
    if *max_time < e_time {
        *max_time = e_time;
    }

    (s_time, e_time)
}
