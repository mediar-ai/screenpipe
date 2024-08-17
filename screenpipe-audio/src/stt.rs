use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Error as E, Result};
use candle::{Device, IndexOp, Tensor};
use candle_nn::{ops::softmax, VarBuilder};
use hf_hub::{api::sync::Api, Repo, RepoType};
use log::{debug, error, info};
use rand::{distributions::Distribution, SeedableRng};
use tokenizers::Tokenizer;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use candle_transformers::models::whisper::{self as m, audio, Config};
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};

use crate::{multilingual, pcm_decode::pcm_decode, AudioTranscriptionEngine};

use webrtc_vad::{Vad, VadMode};

use hound::{WavSpec, WavWriter};
use std::io::Cursor;

#[derive(Clone)]
pub struct WhisperModel {
    pub model: Model,
    pub tokenizer: Tokenizer,
    pub device: Device,
}

impl WhisperModel {
    pub fn new(engine: Arc<AudioTranscriptionEngine>) -> Result<Self> {
        debug!("Initializing WhisperModel");
        let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));
        info!("device = {:?}", device);

        debug!("Fetching model files");
        let (config_filename, tokenizer_filename, weights_filename) = {
            let api = Api::new()?;
            let repo = match engine.as_ref() {
                AudioTranscriptionEngine::WhisperTiny => Repo::with_revision(
                    "openai/whisper-tiny".to_string(),
                    RepoType::Model,
                    "main".to_string(),
                ),
                AudioTranscriptionEngine::WhisperDistilLargeV3 => Repo::with_revision(
                    "distil-whisper/distil-large-v3".to_string(),
                    RepoType::Model,
                    "main".to_string(),
                ),
                _ => Repo::with_revision(
                    "openai/whisper-tiny".to_string(),
                    RepoType::Model,
                    "main".to_string(),
                ),
                // ... other engine options ...
            };
            let api_repo = api.repo(repo);
            let config = api_repo.get("config.json")?;
            let tokenizer = api_repo.get("tokenizer.json")?;
            let model = api_repo.get("model.safetensors")?;
            (config, tokenizer, model)
        };

        debug!("Parsing config and tokenizer");
        let config: Config = serde_json::from_str(&std::fs::read_to_string(config_filename)?)?;
        let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(E::msg)?;

        debug!("Loading model weights");
        let vb =
            unsafe { VarBuilder::from_mmaped_safetensors(&[weights_filename], m::DTYPE, &device)? };
        let model = Model::Normal(m::model::Whisper::load(&vb, config.clone())?);
        debug!("WhisperModel initialization complete");
        Ok(Self {
            model,
            tokenizer,
            device,
        })
    }
}

#[derive(Debug, Clone)]
pub enum Model {
    Normal(m::model::Whisper),
    Quantized(m::quantized_model::Whisper),
}

impl Model {
    pub fn config(&self) -> &Config {
        match self {
            Self::Normal(m) => &m.config,
            Self::Quantized(m) => &m.config,
        }
    }

    pub fn encoder_forward(&mut self, x: &Tensor, flush: bool) -> candle::Result<Tensor> {
        match self {
            Self::Normal(m) => m.encoder.forward(x, flush),
            Self::Quantized(m) => m.encoder.forward(x, flush),
        }
    }

    pub fn decoder_forward(
        &mut self,
        x: &Tensor,
        xa: &Tensor,
        flush: bool,
    ) -> candle::Result<Tensor> {
        match self {
            Self::Normal(m) => m.decoder.forward(x, xa, flush),
            Self::Quantized(m) => m.decoder.forward(x, xa, flush),
        }
    }

    pub fn decoder_final_linear(&self, x: &Tensor) -> candle::Result<Tensor> {
        match self {
            Self::Normal(m) => m.decoder.final_linear(x),
            Self::Quantized(m) => m.decoder.final_linear(x),
        }
    }
}

#[derive(Debug, Clone)]
struct DecodingResult {
    tokens: Vec<u32>,
    text: String,
    avg_logprob: f64,
    no_speech_prob: f64,
    #[allow(dead_code)]
    temperature: f64,
    compression_ratio: f64,
}

#[derive(Debug, Clone)]
struct Segment {
    start: f64,
    duration: f64,
    dr: DecodingResult,
}

struct Decoder<'a> {
    model: &'a mut Model,
    rng: rand::rngs::StdRng,
    task: Option<Task>,
    timestamps: bool,
    verbose: bool,
    tokenizer: &'a Tokenizer,
    suppress_tokens: Tensor,
    sot_token: u32,
    transcribe_token: u32,
    translate_token: u32,
    eot_token: u32,
    no_speech_token: u32,
    no_timestamps_token: u32,
    language_token: Option<u32>,
}

impl<'a> Decoder<'a> {
    #[allow(clippy::too_many_arguments)]
    fn new(
        model: &'a mut Model,
        tokenizer: &'a Tokenizer,
        seed: u64,
        device: &Device,
        language_token: Option<u32>,
        task: Option<Task>,
        timestamps: bool,
        verbose: bool,
    ) -> Result<Self> {
        let no_timestamps_token = token_id(&tokenizer, m::NO_TIMESTAMPS_TOKEN)?;
        let suppress_tokens: Vec<f32> = (0..model.config().vocab_size as u32)
            .map(|i| {
                if model.config().suppress_tokens.contains(&i)
                    || timestamps && i == no_timestamps_token
                {
                    f32::NEG_INFINITY
                } else {
                    0f32
                }
            })
            .collect();
        let suppress_tokens = Tensor::new(suppress_tokens.as_slice(), device)?;
        let sot_token = token_id(&tokenizer, m::SOT_TOKEN)?;
        let transcribe_token = token_id(&tokenizer, m::TRANSCRIBE_TOKEN)?;
        let translate_token = token_id(&tokenizer, m::TRANSLATE_TOKEN)?;
        let eot_token = token_id(&tokenizer, m::EOT_TOKEN)?;
        let no_speech_token = m::NO_SPEECH_TOKENS
            .iter()
            .find_map(|token| token_id(&tokenizer, token).ok());
        let no_speech_token = match no_speech_token {
            None => anyhow::bail!("unable to find any non-speech token"),
            Some(n) => n,
        };
        Ok(Self {
            model,
            rng: rand::rngs::StdRng::seed_from_u64(seed),
            tokenizer,
            task,
            timestamps,
            verbose,
            suppress_tokens,
            sot_token,
            transcribe_token,
            translate_token,
            eot_token,
            no_speech_token,
            language_token,
            no_timestamps_token,
        })
    }

    fn decode(&mut self, mel: &Tensor, t: f64) -> Result<DecodingResult> {
        let audio_features = self.model.encoder_forward(mel, true)?;
        if self.verbose {
            info!("audio features: {:?}", audio_features.dims());
        }
        let sample_len = self.model.config().max_target_positions / 2;
        let mut no_speech_prob = f64::NAN;
        let mut tokens = vec![self.sot_token];
        if let Some(language_token) = self.language_token {
            tokens.push(language_token);
        }
        match self.task {
            None | Some(Task::Transcribe) => tokens.push(self.transcribe_token),
            Some(Task::Translate) => tokens.push(self.translate_token),
        }
        if !self.timestamps {
            tokens.push(self.no_timestamps_token);
        }

        let mut sum_logprob = 0f64;
        let mut last_token_was_timestamp = false;

        for i in 0..sample_len {
            let tokens_t = Tensor::new(tokens.as_slice(), mel.device())?;
            let tokens_t = tokens_t.unsqueeze(0)?;
            let ys = self
                .model
                .decoder_forward(&tokens_t, &audio_features, i == 0)?;

            if i == 0 {
                let logits = self.model.decoder_final_linear(&ys.i(..1)?)?.i(0)?.i(0)?;
                no_speech_prob = softmax(&logits, 0)?
                    .i(self.no_speech_token as usize)?
                    .to_scalar::<f32>()? as f64;
            }

            let (_, seq_len, _) = ys.dims3()?;
            let logits = self
                .model
                .decoder_final_linear(&ys.i((..1, seq_len - 1..))?)?
                .i(0)?
                .i(0)?;

            let logits = logits.broadcast_add(&self.suppress_tokens)?;

            let logits = if last_token_was_timestamp {
                let mask = Tensor::zeros_like(&logits)?;
                let eot_mask = mask.get(self.eot_token as usize)?;
                logits.broadcast_add(&eot_mask)?
            } else {
                logits
            };
            let next_token = if t > 0f64 {
                let prs = softmax(&(&logits / t)?, 0)?;
                let logits_v: Vec<f32> = prs.to_vec1()?;
                let distr = rand::distributions::WeightedIndex::new(&logits_v)?;
                distr.sample(&mut self.rng) as u32
            } else {
                let logits_v: Vec<f32> = logits.to_vec1()?;
                logits_v
                    .iter()
                    .enumerate()
                    .max_by(|(_, u), (_, v)| u.total_cmp(v))
                    .map(|(i, _)| i as u32)
                    .unwrap()
            };

            tokens.push(next_token);
            let prob = softmax(&logits, candle::D::Minus1)?
                .i(next_token as usize)?
                .to_scalar::<f32>()? as f64;

            sum_logprob += prob.ln();

            if next_token == self.eot_token
                || tokens.len() > self.model.config().max_target_positions
            {
                break;
            }

            last_token_was_timestamp = next_token > self.no_timestamps_token;
        }

        let text = self.tokenizer.decode(&tokens, true).map_err(E::msg)?;
        let avg_logprob = sum_logprob / tokens.len() as f64;

        Ok(DecodingResult {
            tokens,
            text,
            avg_logprob,
            no_speech_prob,
            temperature: t,
            compression_ratio: f64::NAN,
        })
    }

    fn decode_with_fallback(&mut self, segment: &Tensor) -> Result<DecodingResult> {
        for (i, &t) in m::TEMPERATURES.iter().enumerate() {
            let dr: Result<DecodingResult> = self.decode(segment, t);
            if i == m::TEMPERATURES.len() - 1 {
                return dr;
            }
            match dr {
                Ok(dr) => {
                    let needs_fallback = dr.compression_ratio > m::COMPRESSION_RATIO_THRESHOLD
                        || dr.avg_logprob < m::LOGPROB_THRESHOLD;
                    if !needs_fallback || dr.no_speech_prob > m::NO_SPEECH_THRESHOLD {
                        return Ok(dr);
                    }
                }
                Err(err) => {
                    error!("Error running at {t}: {err}")
                }
            }
        }
        unreachable!()
    }

    fn run(&mut self, mel: &Tensor) -> Result<Vec<Segment>> {
        let (_, _, content_frames) = mel.dims3()?;
        let mut seek = 0;
        let mut segments = vec![];
        while seek < content_frames {
            let start = std::time::Instant::now();
            let time_offset = (seek * m::HOP_LENGTH) as f64 / m::SAMPLE_RATE as f64;
            let segment_size = usize::min(content_frames - seek, m::N_FRAMES);
            let mel_segment = mel.narrow(2, seek, segment_size)?;
            let segment_duration = (segment_size * m::HOP_LENGTH) as f64 / m::SAMPLE_RATE as f64;
            let dr = self.decode_with_fallback(&mel_segment)?;
            seek += segment_size;
            if dr.no_speech_prob > m::NO_SPEECH_THRESHOLD && dr.avg_logprob < m::LOGPROB_THRESHOLD {
                info!("no speech detected, skipping {seek} {dr:?}");
                continue;
            }
            let segment = Segment {
                start: time_offset,
                duration: segment_duration,
                dr,
            };
            if self.timestamps {
                info!(
                    "{:.1}s -- {:.1}s",
                    segment.start,
                    segment.start + segment.duration,
                );
                let mut tokens_to_decode = vec![];
                let mut prev_timestamp_s = 0f32;
                for &token in segment.dr.tokens.iter() {
                    if token == self.sot_token || token == self.eot_token {
                        continue;
                    }
                    if token > self.no_timestamps_token {
                        let timestamp_s = (token - self.no_timestamps_token + 1) as f32 / 50.;
                        if !tokens_to_decode.is_empty() {
                            let text = self
                                .tokenizer
                                .decode(&tokens_to_decode, true)
                                .map_err(E::msg)?;
                            info!("  {:.1}s-{:.1}s: {}", prev_timestamp_s, timestamp_s, text);
                            tokens_to_decode.clear()
                        }
                        prev_timestamp_s = timestamp_s;
                    } else {
                        tokens_to_decode.push(token)
                    }
                }
                if !tokens_to_decode.is_empty() {
                    let text = self
                        .tokenizer
                        .decode(&tokens_to_decode, true)
                        .map_err(E::msg)?;
                    if !text.is_empty() {
                        info!("  {:.1}s-...: {}", prev_timestamp_s, text);
                    }
                    tokens_to_decode.clear()
                }
            } else {
                info!(
                    "{:.1}s -- {:.1}s: {}",
                    segment.start,
                    segment.start + segment.duration,
                    segment.dr.text,
                )
            }
            if self.verbose {
                info!("{seek}: {segment:?}, in {:?}", start.elapsed());
            }
            segments.push(segment)
        }
        Ok(segments)
    }
}

pub fn token_id(tokenizer: &Tokenizer, token: &str) -> candle::Result<u32> {
    match tokenizer.token_to_id(token) {
        None => candle::bail!("no token-id for {token}"),
        Some(id) => Ok(id),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Task {
    Transcribe,
    #[allow(dead_code)]
    Translate,
}

use reqwest::blocking::Client;
use serde_json::Value;

// Replace the get_deepgram_api_key function with this:
fn get_deepgram_api_key() -> String {
    "7ed2a159a094337b01fd8178b914b7ae0e77822d".to_string()
}

// TODO: this should use async reqwest not blocking, cause crash issue because all our code is async
fn transcribe_with_deepgram(api_key: &str, audio_data: &[f32]) -> Result<String> {
    debug!("Starting Deepgram transcription");
    let client = Client::new();

    // Create a WAV file in memory
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = WavSpec {
            channels: 1,
            sample_rate: 16000,
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

    let response = client
        .post("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true")
        .header("Content-Type", "audio/wav")
        .header("Authorization", format!("Token {}", api_key))
        .body(wav_data)
        .send();

    match response {
        Ok(resp) => {
            debug!("Received response from Deepgram API");
            match resp.json::<Value>() {
                Ok(result) => {
                    debug!("Successfully parsed JSON response");
                    if let Some(err_code) = result.get("err_code") {
                        error!(
                            "Deepgram API error code: {:?}, result: {:?}",
                            err_code, result
                        );
                        return Err(anyhow::anyhow!("Deepgram API error: {:?}", result));
                    }
                    let transcription = result["results"]["channels"][0]["alternatives"][0]
                        ["transcript"]
                        .as_str()
                        .unwrap_or("");

                    if transcription.is_empty() {
                        info!("Transcription is empty. Full response: {:?}", result);
                    } else {
                        info!(
                            "Transcription successful. Length: {} characters",
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

pub fn stt(
    file_path: &str,
    whisper_model: &WhisperModel,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
) -> Result<String> {
    debug!("Starting speech to text for file: {}", file_path);
    let model = &whisper_model.model;
    let tokenizer = &whisper_model.tokenizer;
    let device = &whisper_model.device;

    debug!("Loading mel filters");
    let mel_bytes = match model.config().num_mel_bins {
        80 => include_bytes!("../models/whisper/melfilters.bytes").as_slice(),
        128 => include_bytes!("../models/whisper/melfilters128.bytes").as_slice(),
        nmel => anyhow::bail!("unexpected num_mel_bins {nmel}"),
    };
    let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
    <byteorder::LittleEndian as byteorder::ByteOrder>::read_f32_into(mel_bytes, &mut mel_filters);

    debug!("Decoding PCM data");
    let (mut pcm_data, sample_rate) = pcm_decode(file_path)?;
    if sample_rate != m::SAMPLE_RATE as u32 {
        info!(
            "Resampling from {} Hz to {} Hz",
            sample_rate,
            m::SAMPLE_RATE
        );
        pcm_data = resample(pcm_data, sample_rate, m::SAMPLE_RATE as u32)?;
    }

    // Initialize VAD
    debug!("VAD: Initializing VAD");
    let mut vad = Vad::new();
    vad.set_mode(VadMode::VeryAggressive); // Set mode to very aggressive

    // Filter out non-speech segments
    debug!("VAD: Filtering out non-speech segments");
    let frame_size = 160; // 10ms frame size for 16kHz audio
    let mut speech_frames = Vec::new();
    for (frame_index, chunk) in pcm_data.chunks(frame_size).enumerate() {
        // Convert f32 to i16
        let i16_chunk: Vec<i16> = chunk.iter().map(|&x| (x * 32767.0) as i16).collect();
        match vad.is_voice_segment(&i16_chunk) {
            Ok(is_voice) => {
                if is_voice {
                    // debug!("VAD: Speech detected in frame {}", frame_index);
                    speech_frames.extend_from_slice(chunk);
                } else {
                    // debug!("VAD: Non-speech frame {} filtered out", frame_index);
                }
            }
            Err(e) => {
                debug!("VAD failed for frame {}: {:?}", frame_index, e);
                // Optionally, you can choose to include the frame if VAD fails
                // speech_frames.extend_from_slice(chunk);
            }
        }
    }

    info!(
        "Total audio_frames processed: {}, frames that include speech: {}",
        pcm_data.len() / frame_size,
        speech_frames.len() / frame_size
    );

    // If no speech frames detected, skip processing
    if speech_frames.is_empty() {
        debug!("No speech detected using VAD, skipping audio processing");
        return Ok("".to_string()); // Return an empty string or consider a more specific "no speech" indicator
    }

    debug!(
        "Using {} speech frames out of {} total frames",
        speech_frames.len() / frame_size,
        pcm_data.len() / frame_size
    );

    if audio_transcription_engine == AudioTranscriptionEngine::Deepgram.into() {
        // Deepgram implementation
        let api_key = get_deepgram_api_key();
        match transcribe_with_deepgram(&api_key, &speech_frames) {
            Ok(transcription) => Ok(transcription),
            Err(e) => {
                error!(
                    "Deepgram transcription failed, falling back to Whisper: {:?}",
                    e
                );
                // Existing Whisper implementation
                debug!("Converting PCM to mel spectrogram");
                let mel = audio::pcm_to_mel(&model.config(), &speech_frames, &mel_filters);
                let mel_len = mel.len();
                debug!("Creating tensor from mel spectrogram");
                let mel = Tensor::from_vec(
                    mel,
                    (
                        1,
                        model.config().num_mel_bins,
                        mel_len / model.config().num_mel_bins,
                    ),
                    &device,
                )?;

                debug!("Detecting language");
                let language_token = Some(multilingual::detect_language(
                    &mut model.clone(),
                    &tokenizer,
                    &mel,
                )?);
                let mut model = model.clone();
                debug!("Initializing decoder");
                let mut dc = Decoder::new(
                    &mut model,
                    tokenizer,
                    42,
                    &device,
                    language_token,
                    Some(Task::Transcribe),
                    true,
                    false,
                )?;
                debug!("Starting decoding process");
                let segments = dc.run(&mel)?;
                debug!("Decoding complete");
                Ok(segments
                    .iter()
                    .map(|s| s.dr.text.clone())
                    .collect::<Vec<String>>()
                    .join("\n"))
            }
        }
    } else {
        // Existing Whisper implementation
        debug!("Starting Whisper transcription");
        debug!("Converting PCM to mel spectrogram");
        let mel = audio::pcm_to_mel(&model.config(), &speech_frames, &mel_filters);
        let mel_len = mel.len();
        debug!("Creating tensor from mel spectrogram");
        let mel = Tensor::from_vec(
            mel,
            (
                1,
                model.config().num_mel_bins,
                mel_len / model.config().num_mel_bins,
            ),
            &device,
        )?;

        debug!("Detecting language");
        let language_token = Some(multilingual::detect_language(
            &mut model.clone(),
            &tokenizer,
            &mel,
        )?);
        let mut model = model.clone();
        debug!("Initializing decoder");
        let mut dc = Decoder::new(
            &mut model,
            tokenizer,
            42,
            &device,
            language_token,
            Some(Task::Transcribe),
            true,
            false,
        )?;
        debug!("Starting decoding process");
        let segments = dc.run(&mel)?;
        debug!("Decoding complete");
        Ok(segments
            .iter()
            .map(|s| s.dr.text.clone())
            .collect::<Vec<String>>()
            .join("\n"))
    }
}

fn resample(input: Vec<f32>, from_sample_rate: u32, to_sample_rate: u32) -> Result<Vec<f32>> {
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

    let waves_in = vec![input];
    debug!("Performing resampling");
    let waves_out = resampler.process(&waves_in, None)?;
    debug!("Resampling complete");
    Ok(waves_out.into_iter().next().unwrap())
}

#[derive(Debug, Clone)]
pub struct AudioInput {
    pub path: String,
    pub device: String,
}

#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    pub input: AudioInput,
    pub transcription: Option<String>,
    pub timestamp: u64,
    pub error: Option<String>,
}
pub async fn create_whisper_channel(
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
) -> Result<(
    UnboundedSender<AudioInput>,
    UnboundedReceiver<TranscriptionResult>,
)> {
    let whisper_model = WhisperModel::new(audio_transcription_engine.clone())?;
    let (input_sender, mut input_receiver): (
        UnboundedSender<AudioInput>,
        UnboundedReceiver<AudioInput>,
    ) = unbounded_channel();
    let (output_sender, output_receiver): (
        UnboundedSender<TranscriptionResult>,
        UnboundedReceiver<TranscriptionResult>,
    ) = unbounded_channel();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(input) = input_receiver.recv() => {
                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .expect("Time went backwards")
                        .as_secs();

                    let transcription_result = match stt(&input.path, &whisper_model, audio_transcription_engine.clone()) {
                        Ok(transcription) => TranscriptionResult {
                            input: input.clone(),
                            transcription: Some(transcription),
                            timestamp,
                            error: None,
                        },
                        Err(e) => {
                            error!("STT error for input {}: {:?}", input.path, e);
                            TranscriptionResult {
                                input: input.clone(),
                                transcription: None,
                                timestamp,
                                error: Some(e.to_string()),
                            }
                        },
                    };

                    if output_sender.send(transcription_result).is_err() {
                        break;
                    }
                }
                else => break,
            }
        }
    });

    Ok((input_sender, output_receiver))
}
