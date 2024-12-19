use crate::{
    audio_processing::normalize_v2,
    encode_single_audio, multilingual,
    pyannote::{
        embedding::EmbeddingExtractor,
        identify::EmbeddingManager,
        segment::{get_segments, SpeechSegment},
    },
    vad_engine::{SileroVad, VadEngine, VadEngineEnum, VadSensitivity, WebRtcVad},
    whisper::{Decoder, WhisperModel},
    AudioDevice, AudioTranscriptionEngine,
};
use anyhow::{anyhow, Result};
use candle::Tensor;
use candle_transformers::models::whisper::{self as m, audio};
use chrono::Utc;
use log::{debug, error, info};
#[cfg(target_os = "macos")]
use objc::rc::autoreleasepool;
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use std::collections::HashSet;
use std::{
    path::PathBuf,
    sync::Arc,
    sync::Mutex as StdMutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

use hound::{WavSpec, WavWriter};
use regex::Regex;
use reqwest::Client;
use screenpipe_core::Language;
use serde_json::Value;
use std::io::Cursor;

use crate::pyannote::models::{get_or_download_model, PyannoteModel};
use lazy_static::lazy_static;
use std::env;

lazy_static! {
    static ref DEEPGRAM_API_URL: String = env::var("DEEPGRAM_API_URL")
        .unwrap_or_else(|_| "https://api.deepgram.com/v1/listen".to_string());
    static ref CUSTOM_DEEPGRAM_API_TOKEN: String =
        env::var("CUSTOM_DEEPGRAM_API_TOKEN").unwrap_or_else(|_| String::new());
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

    // Use token from env var
    let custom_api_key = CUSTOM_DEEPGRAM_API_TOKEN.as_str();
    if custom_api_key.is_empty() {
        return Err(anyhow!("CUSTOM_DEEPGRAM_API_TOKEN not set"));
    }

    // Create a WAV file in memory
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = WavSpec {
            channels: 1,
            sample_rate: match sample_rate {
                88200 => 16000,   // Deepgram expects 16kHz for 88.2kHz
                _ => sample_rate, // Fallback for other sample rates
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

    let mut query_params = String::from("model=nova-2&smart_format=true&sample_rate=16000");

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

    let api_key_to_use = if custom_api_key.is_empty() {
        api_key
    } else {
        custom_api_key
    };

    let response = client
        .post(format!("{}?{}", *DEEPGRAM_API_URL, query_params))
        .header("Content-Type", "audio/wav")
        .header("Authorization", format!("Token {}", api_key_to_use))
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
    audio: &[f32],
    sample_rate: u32,
    device: &str,
    whisper_model: &mut WhisperModel,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    deepgram_api_key: Option<String>,
    languages: Vec<Language>,
) -> Result<String> {
    let mut whisper_model = whisper_model.clone();
    let audio = audio.to_vec();

    let device = device.to_string();
    let handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();

        rt.block_on(stt(
            &audio,
            sample_rate,
            &device,
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
    audio: &[f32],
    mel_filters: &[f32],
    languages: Vec<Language>,
) -> Result<String> {
    let model = &mut whisper_model.model;
    let tokenizer = &whisper_model.tokenizer;
    let device = &whisper_model.device;

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

pub async fn prepare_segments(
    audio_data: &[f32],
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    segmentation_model_path: &PathBuf,
    embedding_manager: EmbeddingManager,
    embedding_extractor: Arc<StdMutex<EmbeddingExtractor>>,
    device: &str,
) -> Result<tokio::sync::mpsc::Receiver<SpeechSegment>> {
    let audio_data = normalize_v2(&audio_data);

    let frame_size = 1600;
    let vad_engine = vad_engine.clone();

    let mut noise = 0.;
    let mut audio_frames = Vec::new();
    let mut total_frames = 0;
    let mut speech_frame_count = 0;

    for chunk in audio_data.chunks(frame_size) {
        total_frames += 1;

        let mut new_chunk = chunk.to_vec();
        let status = vad_engine.lock().await.audio_type(chunk);
        match status {
            Ok(VadStatus::Speech) => {
                if let Ok(processed_audio) = spectral_subtraction(chunk, noise) {
                    new_chunk = processed_audio;
                    speech_frame_count += 1;
                }
            }
            Ok(VadStatus::Unknown) => {
                noise = average_noise_spectrum(chunk);
            }
            _ => {}
        }
        audio_frames.extend(new_chunk);
    }

    let speech_ratio = speech_frame_count as f32 / total_frames as f32;
    let min_speech_ratio = vad_engine.lock().await.get_min_speech_ratio();

    info!(
        "device: {}, speech ratio: {}, min_speech_ratio: {}, audio_frames: {}, speech_frames: {}",
        device,
        speech_ratio,
        min_speech_ratio,
        audio_frames.len(),
        speech_frame_count
    );
    let (tx, rx) = tokio::sync::mpsc::channel(100);
    if !audio_frames.is_empty() && speech_ratio >= min_speech_ratio {
        let segments = get_segments(
            &audio_data,
            16000,
            segmentation_model_path,
            embedding_extractor,
            embedding_manager,
        )?;

        for segment in segments.flatten() {
            if let Err(e) = tx.send(segment).await {
                error!("failed to send segment: {:?}", e);
                break;
            }
        }
    }

    Ok(rx)
}

#[allow(clippy::too_many_arguments)]
pub async fn stt(
    audio: &[f32],
    sample_rate: u32,
    device: &str,
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

    let transcription: Result<String> = if audio_transcription_engine
        == AudioTranscriptionEngine::Deepgram.into()
    {
        // Deepgram implementation
        let api_key = deepgram_api_key.unwrap_or_default();

        match transcribe_with_deepgram(&api_key, audio, device, sample_rate, languages.clone())
            .await
        {
            Ok(transcription) => Ok(transcription),
            Err(e) => {
                error!(
                    "device: {}, deepgram transcription failed, falling back to Whisper: {:?}",
                    device, e
                );
                // Fallback to Whisper
                process_with_whisper(&mut *whisper_model, audio, &mel_filters, languages.clone())
            }
        }
    } else {
        // Existing Whisper implementation
        process_with_whisper(&mut *whisper_model, audio, &mel_filters, languages)
    };

    Ok(transcription?)
}

pub fn resample(input: &[f32], from_sample_rate: u32, to_sample_rate: u32) -> Result<Vec<f32>> {
    debug!("Resampling audio");
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(
        to_sample_rate as f64 / from_sample_rate as f64,
        2.0,
        params,
        input.len(),
        1,
    )?;

    let waves_in = vec![input.to_vec()];
    debug!("Performing resampling");
    let waves_out = resampler.process(&waves_in, None)?;
    debug!("Resampling complete");
    Ok(waves_out.into_iter().next().unwrap())
}

#[derive(Debug, Clone)]
pub struct AudioInput {
    pub data: Arc<Vec<f32>>,
    pub sample_rate: u32,
    pub channels: u16,
    pub device: Arc<AudioDevice>,
}

#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    pub path: String,
    pub input: AudioInput,
    pub speaker_embedding: Vec<f32>,
    pub transcription: Option<String>,
    pub timestamp: u64,
    pub error: Option<String>,
    pub start_time: f64,
    pub end_time: f64,
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

use crate::audio_processing::{average_noise_spectrum, spectral_subtraction};
use std::sync::atomic::{AtomicBool, Ordering};
use vad_rs::VadStatus;

pub async fn create_whisper_channel(
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    vad_engine: VadEngineEnum,
    deepgram_api_key: Option<String>,
    output_path: &PathBuf,
    vad_sensitivity: VadSensitivity,
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
    ) = crossbeam::channel::bounded(1000);
    let (output_sender, output_receiver): (
        crossbeam::channel::Sender<TranscriptionResult>,
        crossbeam::channel::Receiver<TranscriptionResult>,
    ) = crossbeam::channel::bounded(1000);
    let mut vad_engine: Box<dyn VadEngine + Send> = match vad_engine {
        VadEngineEnum::WebRtc => Box::new(WebRtcVad::new()),
        VadEngineEnum::Silero => Box::new(SileroVad::new().await?),
    };
    vad_engine.set_sensitivity(vad_sensitivity);
    let vad_engine = Arc::new(Mutex::new(vad_engine));
    let shutdown_flag = Arc::new(AtomicBool::new(false));
    let shutdown_flag_clone = shutdown_flag.clone();
    let output_path = output_path.clone();

    let embedding_model_path = get_or_download_model(PyannoteModel::Embedding).await?;
    let segmentation_model_path = get_or_download_model(PyannoteModel::Segmentation).await?;

    let embedding_extractor = Arc::new(StdMutex::new(EmbeddingExtractor::new(
        embedding_model_path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid embedding model path"))?,
    )?));

    let embedding_manager = EmbeddingManager::new(usize::MAX);

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
                        Ok(mut audio) => {
                            debug!("Received input from input_receiver");
                            let timestamp = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .expect("Time went backwards")
                                .as_secs();

                            let audio_data = if audio.sample_rate != m::SAMPLE_RATE as u32 {
                                match resample(
                                    audio.data.as_ref(),
                                    audio.sample_rate,
                                    m::SAMPLE_RATE as u32,
                                ) {
                                    Ok(data) => data,
                                    Err(e) => {
                                        error!("Error resampling audio: {:?}", e);
                                        continue;
                                    }
                                }
                            } else {
                                audio.data.as_ref().to_vec()
                            };

                            audio.data = Arc::new(audio_data.clone());
                            audio.sample_rate = m::SAMPLE_RATE as u32;

                            let mut segments = match prepare_segments(&audio_data, vad_engine.clone(), &segmentation_model_path, embedding_manager.clone(), embedding_extractor.clone(), &audio.device.to_string()).await {
                                Ok(segments) => segments,
                                Err(e) => {
                                    error!("Error preparing segments: {:?}", e);
                                    continue;
                                }
                            };


                            let path = match write_audio_to_file(
                                &audio.data.to_vec(),
                                audio.sample_rate,
                                &output_path,
                                &audio.device.to_string(),
                                false,
                            ) {
                                Ok(file_path) => file_path,
                                Err(e) => {
                                    error!("Error writing audio to file: {:?}", e);
                                    "".to_string()
                                }
                            };

                            while let Some(segment) = segments.recv().await {
                                let path = path.clone();
                                let transcription_result = if cfg!(target_os = "macos") {
                                    let timestamp = timestamp + segment.start.round() as u64;
                                    #[cfg(target_os = "macos")]
                                    {
                                        autoreleasepool(|| {
                                            match stt_sync(&segment.samples, segment.sample_rate, &audio.device.to_string(), &mut whisper_model, audio_transcription_engine.clone(), deepgram_api_key.clone(), languages.clone()) {
                                                Ok(transcription) => TranscriptionResult {
                                                    input: AudioInput {
                                                        data: Arc::new(segment.samples),
                                                        sample_rate: segment.sample_rate,
                                                        channels: 1,
                                                        device: audio.device.clone(),
                                                    },
                                                    transcription: Some(transcription),
                                                    path,
                                                    timestamp,
                                                    error: None,
                                                    speaker_embedding: segment.embedding.clone(),
                                                    start_time: segment.start,
                                                    end_time: segment.end,
                                                },
                                                Err(e) => {
                                                    error!("STT error for input {}: {:?}", audio.device, e);
                                                    TranscriptionResult {
                                                        input: AudioInput {
                                                            data: Arc::new(segment.samples),
                                                            sample_rate: segment.sample_rate,
                                                            channels: 1,
                                                            device: audio.device.clone(),
                                                        },
                                                        transcription: None,
                                                        path,
                                                        timestamp,
                                                        error: Some(e.to_string()),
                                                        speaker_embedding: Vec::new(),
                                                        start_time: segment.start,
                                                        end_time: segment.end,
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
                                    match stt_sync(&segment.samples, segment.sample_rate, &audio.device.to_string(), &mut whisper_model, audio_transcription_engine.clone(), deepgram_api_key.clone(), languages.clone()) {
                                        Ok(transcription) => TranscriptionResult {
                                            input: AudioInput {
                                                data: Arc::new(segment.samples),
                                                sample_rate: segment.sample_rate,
                                                channels: 1,
                                                device: audio.device.clone(),
                                            },
                                            transcription: Some(transcription),
                                            path,
                                            timestamp,
                                            error: None,
                                            speaker_embedding: segment.embedding.clone(),
                                            start_time: segment.start,
                                            end_time: segment.end,
                                        },
                                        Err(e) => {
                                            error!("STT error for input {}: {:?}", audio.device, e);
                                            TranscriptionResult {
                                                input: AudioInput {
                                                    data: Arc::new(segment.samples),
                                                    sample_rate: segment.sample_rate,
                                                    channels: 1,
                                                    device: audio.device.clone(),
                                                },
                                                transcription: None,
                                                path,
                                                timestamp,
                                                error: Some(e.to_string()),
                                                speaker_embedding: Vec::new(),
                                                start_time: segment.start,
                                                end_time: segment.end,
                                            }
                                        },
                                    }
                                };

                                if output_sender.send(transcription_result).is_err() {
                                    break;
                                }
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

pub fn write_audio_to_file(
    audio: &[f32],
    sample_rate: u32,
    output_path: &PathBuf,
    device: &str,
    skip_encoding: bool,
) -> Result<String> {
    let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let sanitized_device_name = device.replace(['/', '\\'], "_");
    let file_path = PathBuf::from(output_path)
        .join(format!("{}_{}.mp4", sanitized_device_name, new_file_name))
        .to_str()
        .expect("Failed to create valid path")
        .to_string();
    let file_path_clone = file_path.clone();
    // Run FFmpeg in a separate task
    if !skip_encoding {
        encode_single_audio(
            bytemuck::cast_slice(audio),
            sample_rate,
            1,
            &file_path.into(),
        )?;
    }
    Ok(file_path_clone)
}
