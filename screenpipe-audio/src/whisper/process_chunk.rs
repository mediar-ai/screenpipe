use super::Segment;
use crate::{
    multilingual::{self, get_lang_token},
    whisper::{Decoder, WhisperModel},
};
use anyhow::Result;
use candle::Tensor;
use candle_transformers::models::whisper::{self, audio};
use lazy_static::lazy_static;
use log::debug;
use regex::Regex;
use screenpipe_core::Language;
use std::collections::HashSet;
use tracing::info;
use whisper_rs::{get_lang_str, FullParams, SamplingStrategy, WhisperContext, WhisperState};

lazy_static! {
    static ref TOKEN_REGEX: Regex = Regex::new(r"<\|\d{1,2}\.\d{1,2}\|>").unwrap();
}

pub fn process_with_whisper(
    ctx: &WhisperContext,
    audio: &[f32],
    // mel_filters: &[f32],
    languages: Vec<Language>,
) -> Result<String> {
    // let model = &mut whisper_model.model;
    // let tokenizer = &whisper_model.tokenizer;
    // let device = &whisper_model.device;

    // debug!("converting pcm to mel spectrogram");
    // let mel = audio::pcm_to_mel(model.config(), audio, mel_filters);
    // let mel_len = mel.len();

    // debug!("creating tensor from mel spectrogram");
    // let mel = Tensor::from_vec(
    //     mel,
    //     (
    //         1,
    //         model.config().num_mel_bins,
    //         mel_len / model.config().num_mel_bins,
    //     ),
    //     device,
    // )?;

    // debug!("detecting language");
    // let language_token = Some(multilingual::detect_language(
    //     model,
    //     tokenizer,
    //     &mel,
    //     languages.clone(),
    // )?);

    // debug!("initializing decoder");
    // let mut dc = Decoder::new(model, tokenizer, 42, device, language_token, true, false)?;

    // debug!("starting decoding process");
    // let segments = dc.run(&mel)?;
    // debug!("decoding complete");
    let mut whisper_model = ctx.create_state().expect("failed to create key");

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });

    // Edit params as needed.
    // Set the number of threads to use to 1.
    params.set_n_threads(1);
    // Enable translation.
    params.set_translate(true);
    // Set the language to translate to to English.
    params.set_language(Some("en"));
    // Disable anything that prints to stdout.
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // Enable token level timestamps
    params.set_token_timestamps(true);
    whisper_model.pcm_to_mel(audio, 2)?;
    let (_, lang_tokens) = whisper_model.lang_detect(0, 4)?;
    let lang_token = get_lang_token(lang_tokens, languages)?;
    params.set_language(get_lang_str(lang_token));
    params.set_debug_mode(false);
    params.set_logprob_thold(-2.0);
    params.set_translate(false);

    whisper_model.encode(0, 4)?;

    // let (_, lang_codes) = whisper_model.lang_detect(0, 2)?;
    // whisper_model.encode(0, 2);

    // let n_segments = whisper_model.full_n_segments()?;

    // for i in 0..n_segments {
    //     let segment = whisper_model.
    // }
    // // whisper_model.decode(whisper_model.token, n_past, threads);
    whisper_model
        .full(params, audio)
        .expect("failed to run model");
    let mut transcript = String::new();

    let num_segments = whisper_model
        .full_n_segments()
        .expect("failed to get number of segments");

    for i in 0..num_segments {
        // Get the transcribed text and timestamps for the current segment.
        let segment = whisper_model
            .full_get_segment_text(i)
            .expect("failed to get segment");

        transcript.push_str(&segment);
    }

    Ok(transcript)
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
