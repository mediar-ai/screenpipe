use crate::audio_processing::write_audio_to_file;
use crate::deepgram::transcribe_with_deepgram;
use crate::pyannote::models::{get_or_download_model, PyannoteModel};
use crate::pyannote::segment::SpeechSegment;
use crate::{resample, DeviceControl};
pub use crate::segments::prepare_segments;
use crate::{
    pyannote::{embedding::EmbeddingExtractor, identify::EmbeddingManager},
    vad_engine::{SileroVad, VadEngine, VadEngineEnum, VadSensitivity, WebRtcVad},
    whisper::{process_with_whisper, WhisperModel},
    AudioDevice, AudioTranscriptionEngine,
};
use anyhow::{anyhow, Result};
use candle_transformers::models::whisper as m;
use log::{debug, error, info};
#[cfg(target_os = "macos")]
use objc::rc::autoreleasepool;
use screenpipe_core::Language;
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    path::PathBuf,
    sync::Arc,
    sync::Mutex as StdMutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use dashmap::DashMap;

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

    transcription
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

pub async fn create_whisper_channel(
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    vad_engine: VadEngineEnum,
    deepgram_api_key: Option<String>,
    output_path: &PathBuf,
    vad_sensitivity: VadSensitivity,
    languages: Vec<Language>,
    audio_devices_control: Option<Arc<DashMap<AudioDevice, DeviceControl>>>,
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
                            // Check if device should be recording
                            if let Some(control) = audio_devices_control.as_ref().unwrap().get(&audio.device) {
                                if !control.is_running {
                                    debug!("Skipping audio processing for stopped device: {}", audio.device);
                                    continue;
                                }
                            } else {
                                debug!("Device not found in control list: {}", audio.device);
                                continue;
                            }

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
                                    #[cfg(target_os = "macos")]
                                    {
                                        let timestamp = timestamp + segment.start.round() as u64;
                                        autoreleasepool(|| {
                                            run_stt(segment, audio.device.clone(), &mut whisper_model, audio_transcription_engine.clone(), deepgram_api_key.clone(), languages.clone(), path, timestamp)
                                        })
                                    }
                                    #[cfg(not(target_os = "macos"))]
                                    {
                                        unreachable!("This code should not be reached on non-macOS platforms")
                                    }
                                } else {
                                    run_stt(segment, audio.device.clone(), &mut whisper_model, audio_transcription_engine.clone(), deepgram_api_key.clone(), languages.clone(), path, timestamp)
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

#[allow(clippy::too_many_arguments)]
pub fn run_stt(
    segment: SpeechSegment,
    device: Arc<AudioDevice>,
    whisper_model: &mut WhisperModel,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    deepgram_api_key: Option<String>,
    languages: Vec<Language>,
    path: String,
    timestamp: u64,
) -> TranscriptionResult {
    let audio = segment.samples.clone();
    let sample_rate = segment.sample_rate;
    match stt_sync(
        &audio,
        sample_rate,
        &device.to_string(),
        whisper_model,
        audio_transcription_engine.clone(),
        deepgram_api_key.clone(),
        languages.clone(),
    ) {
        Ok(transcription) => TranscriptionResult {
            input: AudioInput {
                data: Arc::new(audio),
                sample_rate,
                channels: 1,
                device: device.clone(),
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
            error!("STT error for input {}: {:?}", device, e);
            TranscriptionResult {
                input: AudioInput {
                    data: Arc::new(segment.samples),
                    sample_rate: segment.sample_rate,
                    channels: 1,
                    device: device.clone(),
                },
                transcription: None,
                path,
                timestamp,
                error: Some(e.to_string()),
                speaker_embedding: Vec::new(),
                start_time: segment.start,
                end_time: segment.end,
            }
        }
    }
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
