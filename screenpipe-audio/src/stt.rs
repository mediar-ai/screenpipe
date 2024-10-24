use crate::{
    audio_processing::AudioInput,
    multilingual,
    whisper::{Decoder, WhisperModel},
    AudioTranscriptionEngine,
};
use anyhow::Result;
use candle::Tensor;
use candle_transformers::models::whisper::audio;
use log::{debug, error, info};
#[cfg(target_os = "macos")]
use objc::rc::autoreleasepool;

use std::collections::HashSet;
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use hound::{WavSpec, WavWriter};
use regex::Regex;
use reqwest::Client;
use screenpipe_core::Language;
use serde_json::Value;
use std::io::Cursor;

// Replace the get_deepgram_api_key function with this:
fn get_deepgram_api_key() -> String {
    "7ed2a159a094337b01fd8178b914b7ae0e77822d".to_string()
}

async fn transcribe_with_deepgram(
    api_key: &str,
    audio_data: &[f32],
    device: &str,
    sample_rate: u32,
    languages: Vec<Language>,
) -> Result<String> {
    debug!("starting deepgram transcription");
    let client = Client::new();

    // Create a WAV file in memory
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = WavSpec {
            channels: 1,
            sample_rate: match sample_rate {
                88200 => 16000,       // Deepgram expects 16kHz for 88.2kHz
                _ => sample_rate / 3, // Fallback for other sample rates
            },
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = WavWriter::new(&mut cursor, spec)?;
        for &sample in audio_data {
            writer.write_sample(sample)?;
        }
        writer.finalize()?;
    }

    // Get the WAV data from the cursor
    let wav_data = cursor.into_inner();

    let mut query_params = String::from("model=nova-2&smart_format=true");

    if !languages.is_empty() {
        query_params = [
            query_params,
            "&".into(),
            languages
                .iter()
                .map(|lang| format!("detect_language={}", lang.as_lang_code()))
                .collect::<Vec<String>>()
                .join("&"),
        ]
        .concat();
    }

    let response = client
        .post(format!(
            "https://api.deepgram.com/v1/listen?{}",
            query_params
        ))
        .header("Content-Type", "audio/wav")
        .header("Authorization", format!("Token {}", api_key))
        .body(wav_data)
        .send();

    match response.await {
        Ok(resp) => {
            debug!("received response from deepgram api");
            match resp.json::<Value>().await {
                Ok(result) => {
                    debug!("successfully parsed json response");
                    if let Some(err_code) = result.get("err_code") {
                        error!(
                            "deepgram api error code: {:?}, result: {:?}",
                            err_code, result
                        );
                        return Err(anyhow::anyhow!("Deepgram API error: {:?}", result));
                    }
                    let transcription = result["results"]["channels"][0]["alternatives"][0]
                        ["transcript"]
                        .as_str()
                        .unwrap_or("");

                    if transcription.is_empty() {
                        info!(
                            "device: {}, transcription is empty. full response: {:?}",
                            device, result
                        );
                    } else {
                        info!(
                            "device: {}, transcription successful. length: {} characters",
                            device,
                            transcription.len()
                        );
                    }

                    Ok(transcription.to_string())
                }
                Err(e) => {
                    error!("Failed to parse JSON response: {:?}", e);
                    Err(anyhow::anyhow!("Failed to parse JSON response: {:?}", e))
                }
            }
        }
        Err(e) => {
            error!("Failed to send request to Deepgram API: {:?}", e);
            Err(anyhow::anyhow!(
                "Failed to send request to Deepgram API: {:?}",
                e
            ))
        }
    }
}

pub fn stt_sync(
    audio_input: &AudioInput,
    whisper_model: &mut WhisperModel,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    deepgram_api_key: Option<String>,
    languages: Vec<Language>,
) -> Result<String> {
    let audio_input = audio_input.clone();
    let mut whisper_model = whisper_model.clone();

    let handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();

        rt.block_on(stt(
            &audio_input,
            &mut whisper_model,
            audio_transcription_engine,
            deepgram_api_key,
            languages,
        ))
    });

    handle.join().unwrap()
}

fn process_with_whisper(
    whisper_model: &mut WhisperModel,
    speech_frames: &[f32],
    mel_filters: &[f32],
    languages: Vec<Language>,
) -> Result<String> {
    let model = &mut whisper_model.model;
    let tokenizer = &whisper_model.tokenizer;
    let device = &whisper_model.device;

    debug!("converting pcm to mel spectrogram");
    let mel = audio::pcm_to_mel(&model.config(), speech_frames, mel_filters);
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

    let mut ranges: HashSet<String> = HashSet::new();
    let token_regex = Regex::new(r"<\|\d{1,2}\.\d{1,2}\|>")?;
    let mut transcript = String::new();

    let mut min_time: f32 = f32::MAX;
    let mut max_time: f32 = f32::MIN;
    let segments_len = segments.len();

    for (i, segment) in segments.iter().enumerate() {
        let mut text = segment.dr.text.clone();

        // Extract start and end times
        let (start, end) = extract_time_tokens(&text, &token_regex);
        let (s_time, e_time) = parse_time_tokens(&start, &end, &mut min_time, &mut max_time);

        let range = format!("{}{}", start, end);
        if ranges.insert(range) {
            if segments_len > 1 && i == segments_len - 1 && s_time == min_time && e_time == max_time
            {
                continue;
            }

            text = token_regex.replace_all(&text, "").to_string();
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

    let start = tokens.first().unwrap_or_else(|| &"").to_string();
    let end = tokens.last().unwrap_or_else(|| &"").to_string();

    (start, end)
}

fn parse_time_tokens(start: &str, end: &str, min_time: &mut f32, max_time: &mut f32) -> (f32, f32) {
    let num_regex = Regex::new(r"([<>|])").unwrap();
    let s_time = num_regex
        .replace_all(&start, "")
        .parse::<f32>()
        .unwrap_or(*min_time);
    let e_time = num_regex
        .replace_all(&end, "")
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

#[allow(clippy::too_many_arguments)]
pub async fn stt(
    audio_input: &AudioInput,
    whisper_model: &mut WhisperModel,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    deepgram_api_key: Option<String>,
    languages: Vec<Language>,
) -> Result<String> {
    let model = &whisper_model.model;

    debug!("Loading mel filters");
    let mel_bytes = match model.config().num_mel_bins {
        80 => include_bytes!("../models/whisper/melfilters.bytes").as_slice(),
        128 => include_bytes!("../models/whisper/melfilters128.bytes").as_slice(),
        nmel => anyhow::bail!("unexpected num_mel_bins {nmel}"),
    };
    let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
    <byteorder::LittleEndian as byteorder::ByteOrder>::read_f32_into(mel_bytes, &mut mel_filters);

    let speech_frames = audio_input
        .data
        .iter()
        .flat_map(|segment| segment.speech_frames.iter().copied())
        .collect::<Vec<_>>();

    info!("speech frames length: {}", speech_frames.len());

    if speech_frames.len() == 0 {
        return Ok(String::new());
    }

    let transcription: Result<String> =
        if audio_transcription_engine == AudioTranscriptionEngine::Deepgram.into() {
            // Deepgram implementation
            let api_key = deepgram_api_key
                .clone()
                .unwrap_or_else(get_deepgram_api_key);
            info!(
                "device: {}, using deepgram api key: {}...",
                audio_input.device,
                &api_key[..8]
            );
            match transcribe_with_deepgram(
                &api_key,
                &speech_frames,
                &audio_input.device.name,
                audio_input.sample_rate,
                languages.clone(),
            )
            .await
            {
                Ok(transcription) => Ok(transcription),
                Err(e) => {
                    error!(
                        "device: {}, deepgram transcription failed, falling back to Whisper: {:?}",
                        audio_input.device, e
                    );
                    // Fallback to Whisper
                    process_with_whisper(
                        &mut *whisper_model,
                        &speech_frames,
                        &mel_filters,
                        languages.clone(),
                    )
                }
            }
        } else {
            // Existing Whisper implementation
            process_with_whisper(&mut *whisper_model, &speech_frames, &mel_filters, languages)
        };

    Ok(transcription?)
}

#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    pub input: AudioInput,
    pub transcription: Option<String>,
    pub timestamp: u64,
    pub error: Option<String>,
}

impl TranscriptionResult {
    // TODO --optimize
    pub fn cleanup_overlap(&mut self, previous_transcript: String) -> Option<(String, String)> {
        if let Some(transcription) = &self.transcription {
            let transcription = transcription.to_string();
            if let Some((prev_idx, cur_idx)) =
                longest_common_word_substring(previous_transcript.as_str(), transcription.as_str())
            {
                // strip old transcript from prev_idx word pos
                let new_prev = previous_transcript
                    .split_whitespace()
                    .collect::<Vec<&str>>()[..prev_idx]
                    .join(" ");
                // strip new transcript before cur_idx word pos
                let new_cur =
                    transcription.split_whitespace().collect::<Vec<&str>>()[cur_idx..].join(" ");

                return Some((new_prev, new_cur));
            }
        }

        None
    }
}

use std::sync::atomic::{AtomicBool, Ordering};

pub async fn create_whisper_channel(
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    deepgram_api_key: Option<String>,
    languages: Vec<Language>,
) -> Result<(
    crossbeam::channel::Sender<AudioInput>,
    crossbeam::channel::Receiver<TranscriptionResult>,
    Arc<AtomicBool>, // Shutdown flag
)> {
    let mut whisper_model = WhisperModel::new(&audio_transcription_engine)?;
    let (input_sender, input_receiver): (
        crossbeam::channel::Sender<AudioInput>,
        crossbeam::channel::Receiver<AudioInput>,
    ) = crossbeam::channel::bounded(20);
    let (output_sender, output_receiver): (
        crossbeam::channel::Sender<TranscriptionResult>,
        crossbeam::channel::Receiver<TranscriptionResult>,
    ) = crossbeam::channel::bounded(20);

    let shutdown_flag = Arc::new(AtomicBool::new(false));
    let shutdown_flag_clone = shutdown_flag.clone();

    tokio::spawn(async move {
        loop {
            if shutdown_flag_clone.load(Ordering::Relaxed) {
                info!("Whisper channel shutting down");
                break;
            }
            debug!("Waiting for input from input_receiver");

            crossbeam::select! {
                recv(input_receiver) -> input_result => {
                    match input_result {
                        Ok(input) => {
                            debug!("Received input from input_receiver");
                            let timestamp = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .expect("Time went backwards")
                                .as_secs();

                            let transcription_result = if cfg!(target_os = "macos") {
                                #[cfg(target_os = "macos")]
                                {
                                    autoreleasepool(|| {
                                        match stt_sync(&input, &mut whisper_model, audio_transcription_engine.clone(), deepgram_api_key.clone(), languages.clone()) {
                                            Ok(transcription) => TranscriptionResult {
                                                input: input.clone(),
                                                transcription: Some(transcription),
                                                timestamp,
                                                error: None,
                                            },
                                            Err(e) => {
                                                error!("STT error for input {}: {:?}", input.device, e);
                                                TranscriptionResult {
                                                    input: input.clone(),
                                                    transcription: None,
                                                    timestamp,
                                                    error: Some(e.to_string()),
                                                }
                                            },
                                        }
                                    })
                                }
                                #[cfg(not(target_os = "macos"))]
                                {
                                    unreachable!("This code should not be reached on non-macOS platforms")
                                }
                            } else {
                                match stt_sync(&input, &mut whisper_model, audio_transcription_engine.clone(), deepgram_api_key.clone(), languages.clone()) {
                                    Ok(transcription) => TranscriptionResult {
                                        input: input.clone(),
                                        transcription: Some(transcription),
                                        timestamp,
                                        error: None,
                                    },
                                    Err(e) => {
                                        error!("STT error for input {}: {:?}", input.device, e);
                                        TranscriptionResult {
                                            input: input.clone(),
                                            transcription: None,
                                            timestamp,
                                            error: Some(e.to_string()),
                                        }
                                    },
                                }
                            };

                            if output_sender.send(transcription_result).is_err() {
                                break;
                            }
                        },
                        Err(e) => {
                            error!("Error receiving input: {:?}", e);
                            // Depending on the error type, you might want to break the loop or continue
                            // For now, we'll continue to the next iteration
                            break;
                        }
                    }
                },
            }
        }
        // Cleanup code here (if needed)
    });

    Ok((input_sender, output_receiver, shutdown_flag))
}

pub fn longest_common_word_substring(s1: &str, s2: &str) -> Option<(usize, usize)> {
    let s1 = s1.to_lowercase();
    let s2 = s2.to_lowercase();

    let s1 = s1.replace(|c| char::is_ascii_punctuation(&c), "");
    let s2 = s2.replace(|c| char::is_ascii_punctuation(&c), "");

    let s1_words: Vec<&str> = s1.split_whitespace().collect();
    let s2_words: Vec<&str> = s2.split_whitespace().collect();

    let s1_len = s1_words.len();
    let s2_len = s2_words.len();

    // Table to store lengths of longest common suffixes of word substrings
    let mut dp = vec![vec![0; s2_len + 1]; s1_len + 1];

    let mut max_len = 0;
    let mut max_index_s1 = None; // Store the starting word index of the longest substring in s1
    let mut max_index_s2 = None; // Store the starting word index of the longest substring in s2

    for i in 1..=s1_len {
        for j in 1..=s2_len {
            if s1_words[i - 1] == s2_words[j - 1] {
                dp[i][j] = dp[i - 1][j - 1] + 1;
                if dp[i][j] > max_len {
                    max_len = dp[i][j];
                    max_index_s1 = Some(i - max_len); // The start index of the match in s1
                    max_index_s2 = Some(j - max_len); // The start index of the match in s2
                }
            }
        }
    }

    match (max_index_s1, max_index_s2) {
        (Some(idx1), Some(idx2)) => Some((idx1, idx2)),
        _ => None,
    }
}
