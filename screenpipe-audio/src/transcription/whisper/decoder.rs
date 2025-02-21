use super::model::Model;
use anyhow::{Error as E, Result};
use candle::{Device, IndexOp, Tensor};
use candle_nn::ops::softmax;
use candle_transformers::models::whisper as m;
use rand::{distributions::Distribution, SeedableRng};
use tokenizers::Tokenizer;
use tracing::{debug, error, info};

#[derive(Debug, Clone)]
pub struct DecodingResult {
    // tokens: Vec<u32>,
    pub text: String,
    avg_logprob: f64,
    no_speech_prob: f64,
    #[allow(dead_code)]
    temperature: f64,
    compression_ratio: f64,
}

impl DecodingResult {
    pub fn needs_fallback(&self) -> bool {
        self.compression_ratio > m::COMPRESSION_RATIO_THRESHOLD
            || self.avg_logprob < m::LOGPROB_THRESHOLD
    }

    pub fn is_no_speech(&self) -> bool {
        self.no_speech_prob > m::NO_SPEECH_THRESHOLD
    }
}

#[derive(Debug, Clone)]
pub struct Segment {
    pub start: f64,
    pub duration: f64,
    pub dr: DecodingResult,
}

pub struct Decoder<'a> {
    pub model: &'a mut Model,
    rng: rand::rngs::StdRng,
    timestamps: bool,
    verbose: bool,
    tokenizer: &'a Tokenizer,
    suppress_tokens: Tensor,
    token_values: TokenValues,
}

struct TokenValues {
    sot_token: u32,
    transcribe_token: u32,
    eot_token: u32,
    no_speech_token: u32,
    no_timestamps_token: u32,
    language_token: Option<u32>,
}

impl<'a> Decoder<'a> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        model: &'a mut Model,
        tokenizer: &'a Tokenizer,
        seed: u64,
        device: &Device,
        language_token: Option<u32>,
        timestamps: bool,
        verbose: bool,
    ) -> Result<Self> {
        let token_values = get_token_values(tokenizer, language_token)?;

        let suppress_tokens = calculate_supress_tokens(
            model,
            device,
            timestamps,
            token_values.no_timestamps_token,
            model.config().vocab_size as u32,
        )?;

        Ok(Self {
            model,
            rng: rand::rngs::StdRng::seed_from_u64(seed),
            tokenizer,
            timestamps,
            verbose,
            suppress_tokens,
            token_values,
        })
    }

    fn decode(&mut self, mel: &Tensor, t: f64) -> Result<DecodingResult> {
        let audio_features = self.model.encoder_forward(mel, true)?;
        if self.verbose {
            info!("audio features: {:?}", audio_features.dims());
        }

        let mut sum_logprob = f64::NAN;
        let mut no_speech_prob = f64::NAN;
        let tokens = self.calculate_tokens(
            &audio_features,
            mel,
            t,
            &mut sum_logprob,
            &mut no_speech_prob,
        )?;

        let text = self.tokenizer.decode(&tokens, true).map_err(E::msg)?;
        let avg_logprob = sum_logprob / tokens.len() as f64;

        Ok(DecodingResult {
            // tokens,
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
                    if !dr.needs_fallback() || dr.is_no_speech() {
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

    pub fn reset_kv_cache(&mut self) {
        match &mut self.model {
            Model::Normal(m) => m.reset_kv_cache(),
            Model::Quantized(m) => m.reset_kv_cache(),
        }
    }

    pub fn set_language_token(&mut self, language_token: Option<u32>) {
        self.token_values.language_token = language_token;
    }

    fn initialize_tokens(&self) -> Result<Vec<u32>> {
        let mut tokens = vec![self.token_values.sot_token];
        if let Some(language_token) = self.token_values.language_token {
            tokens.push(language_token);
        }
        tokens.push(self.token_values.transcribe_token);

        if !self.timestamps {
            tokens.push(self.token_values.no_timestamps_token);
        }

        Ok(tokens)
    }

    pub fn run(&mut self, mel: &Tensor) -> Result<Vec<Segment>> {
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
                debug!("no speech detected, skipping {seek} {dr:?}");
                continue;
            }
            let segment = Segment {
                start: time_offset,
                duration: segment_duration,
                dr,
            };

            if self.verbose {
                info!("{seek}: {segment:?}, in {:?}", start.elapsed());
            }
            segments.push(segment)
        }
        Ok(segments)
    }

    fn get_next_token(&mut self, t: f64, logits_v: Vec<f32>, logits: &Tensor) -> Result<u32> {
        if t > 0f64 {
            let logits_tensor = Tensor::new(logits_v.as_slice(), logits.device())?;
            let scaled_logits = (&logits_tensor / t)?;
            let prs = softmax(&scaled_logits, 0)?;
            let prs_vec: Vec<f32> = prs.to_vec1()?;
            let distr = rand::distributions::WeightedIndex::new(&prs_vec)?;
            Ok(distr.sample(&mut self.rng) as u32)
        } else {
            Ok(logits_v
                .iter()
                .enumerate()
                .max_by(|(_, u), (_, v)| u.total_cmp(v))
                .map(|(i, _)| i as u32)
                .unwrap())
        }
    }

    fn calculate_logits(
        &self,
        ys: &Tensor,
        seq_len: usize,
        last_token_was_timestamp: bool,
    ) -> Result<Tensor> {
        let logits = self
            .model
            .decoder_final_linear(&ys.i((..1, seq_len - 1..))?)?
            .i(0)?
            .i(0)?;

        let logits = logits.broadcast_add(&self.suppress_tokens)?;

        let logits = if last_token_was_timestamp {
            let mask = Tensor::zeros_like(&logits)?;
            let eot_mask = mask.get(self.token_values.eot_token as usize)?;
            logits.broadcast_add(&eot_mask)?
        } else {
            logits
        };

        Ok(logits)
    }

    fn calculate_no_speech_prob(&self, ys: &Tensor) -> Result<f64> {
        let logits = self.model.decoder_final_linear(&ys.i(..1)?)?.i(0)?.i(0)?;
        Ok(softmax(&logits, 0)?
            .i(self.token_values.no_speech_token as usize)?
            .to_scalar::<f32>()? as f64)
    }

    fn calculate_ys(
        &mut self,
        tokens: &[u32],
        audio_features: &Tensor,
        mel: &Tensor,
        flush: bool,
    ) -> Result<Tensor> {
        let tokens_t = Tensor::new(tokens, mel.device())?;
        let tokens_t = tokens_t.unsqueeze(0)?;
        let ys = self
            .model
            .decoder_forward(&tokens_t, audio_features, flush)?;

        Ok(ys)
    }

    fn calculate_tokens(
        &mut self,
        audio_features: &Tensor,
        mel: &Tensor,
        t: f64,
        sum_logprob: &mut f64,
        no_speech_prob: &mut f64,
    ) -> Result<Vec<u32>> {
        let mut tokens = self.initialize_tokens()?;
        let mut token_history = Vec::new();
        let mut last_token_was_timestamp = false;

        *no_speech_prob = self.process_initial_state(audio_features, mel)?;

        let sample_len = self.model.config().max_target_positions / 2;
        for i in 0..sample_len {
            let next_token = self.process_next_token(
                &tokens,
                audio_features,
                mel,
                i == 0,
                last_token_was_timestamp,
                &token_history,
                t,
                sum_logprob,
            )?;

            if self.should_stop_decoding(next_token, tokens.len()) {
                break;
            }

            tokens.push(next_token);
            token_history.push(next_token);
            last_token_was_timestamp = next_token > self.token_values.no_timestamps_token;
        }

        Ok(tokens)
    }

    fn process_initial_state(&mut self, audio_features: &Tensor, mel: &Tensor) -> Result<f64> {
        let ys = self.calculate_ys(&self.initialize_tokens()?, audio_features, mel, true)?;
        self.calculate_no_speech_prob(&ys)
    }

    fn should_stop_decoding(&self, token: u32, current_length: usize) -> bool {
        token == self.token_values.eot_token
            || current_length > self.model.config().max_target_positions
    }

    #[allow(clippy::too_many_arguments)]
    fn process_next_token(
        &mut self,
        tokens: &[u32],
        audio_features: &Tensor,
        mel: &Tensor,
        is_first: bool,
        last_token_was_timestamp: bool,
        token_history: &[u32],
        temperature: f64,
        sum_logprob: &mut f64,
    ) -> Result<u32> {
        let ys = self.calculate_ys(tokens, audio_features, mel, is_first)?;
        let (_, seq_len, _) = ys.dims3()?;
        let logits = self.calculate_logits(&ys, seq_len, last_token_was_timestamp)?;

        let mut logits_v: Vec<f32> = logits.to_vec1()?;
        apply_repetition_penalty(&mut logits_v, token_history, 1.0);

        let next_token = self.get_next_token(temperature, logits_v, &logits)?;

        // Update probability
        let prob = softmax(&logits, candle::D::Minus1)?
            .i(next_token as usize)?
            .to_scalar::<f32>()? as f64;
        *sum_logprob += prob.ln();

        Ok(next_token)
    }
}

pub fn token_id(tokenizer: &Tokenizer, token: &str) -> candle::Result<u32> {
    match tokenizer.token_to_id(token) {
        None => candle::bail!("no token-id for {token}"),
        Some(id) => Ok(id),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Task {
    Transcribe,
    #[allow(dead_code)]
    Translate,
}

fn apply_repetition_penalty(logits: &mut [f32], token_history: &[u32], penalty: f32) {
    for &token in token_history {
        if let Some(logit) = logits.get_mut(token as usize) {
            *logit -= penalty;
        }
    }
}

fn calculate_supress_tokens(
    model: &Model,
    device: &Device,
    timestamps: bool,
    no_timestamps_token: u32,
    vocab_size: u32,
) -> Result<Tensor> {
    let suppress_tokens: Vec<f32> = (0..vocab_size)
        .map(|i| {
            if model.config().suppress_tokens.contains(&i) || timestamps && i == no_timestamps_token
            {
                f32::NEG_INFINITY
            } else {
                0f32
            }
        })
        .collect();
    Tensor::new(suppress_tokens.as_slice(), device).map_err(E::msg)
}

fn get_token_values(tokenizer: &Tokenizer, language_token: Option<u32>) -> Result<TokenValues> {
    let no_timestamps_token = token_id(tokenizer, m::NO_TIMESTAMPS_TOKEN)?;
    let sot_token = token_id(tokenizer, m::SOT_TOKEN)?;
    let transcribe_token = token_id(tokenizer, m::TRANSCRIBE_TOKEN)?;
    let eot_token = token_id(tokenizer, m::EOT_TOKEN)?;
    let no_speech_token = m::NO_SPEECH_TOKENS
        .iter()
        .find_map(|token| token_id(tokenizer, token).ok());
    let no_speech_token = match no_speech_token {
        None => anyhow::bail!("unable to find any non-speech token"),
        Some(n) => n,
    };

    Ok(TokenValues {
        sot_token,
        transcribe_token,
        eot_token,
        no_speech_token,
        no_timestamps_token,
        language_token,
    })
}
