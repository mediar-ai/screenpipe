use super::decoder::token_id;
use super::languages::LANGUAGES;
use super::model::Model;
use candle::IndexOp;
use candle::{Result, Tensor, D};
use candle_transformers::models::whisper::SOT_TOKEN;
use screenpipe_core::Language;
use tokenizers::Tokenizer;
use tracing::debug;

/// Detects the spoken language in the audio using Whisper's language detection model.
///
/// # Arguments
/// * `model` - The Whisper model instance
/// * `tokenizer` - The tokenizer for converting text to tokens
/// * `mel` - The mel spectrogram tensor of the audio
/// * `allowed_languages` - Optional list of languages to restrict detection to
///
/// # Returns
/// The token ID of the detected language
pub fn detect_language(
    model: &mut Model,
    tokenizer: &Tokenizer,
    mel: &Tensor,
    allowed_languages: Vec<Language>,
) -> Result<u32> {
    let (_bsize, _, seq_len) = mel.dims3()?;
    let mel = mel.narrow(
        2,
        0,
        usize::min(seq_len, model.config().max_source_positions),
    )?;

    // Get language tokens based on allowed languages or all languages
    let language_tokens = if allowed_languages.is_empty() {
        LANGUAGES
            .iter()
            .map(|(code, _)| token_id(tokenizer, &format!("<|{code}|>")))
            .collect::<Result<Vec<_>>>()?
    } else {
        allowed_languages
            .iter()
            .map(|lang| token_id(tokenizer, &format!("<|{}|>", lang.as_lang_code())))
            .collect::<Result<Vec<_>>>()?
    };

    let device = mel.device();
    let sot_token = token_id(tokenizer, SOT_TOKEN)?;

    // Generate audio features and get language probabilities
    let audio_features = model.encoder_forward(&mel, true)?;
    let tokens = Tensor::new(&[[sot_token]], device)?;
    let language_token_ids = Tensor::new(language_tokens.as_slice(), device)?;
    let decoder_output = model.decoder_forward(&tokens, &audio_features, true)?;
    let logits = model
        .decoder_final_linear(&decoder_output.i(..1)?)?
        .i(0)?
        .i(0)?;
    let logits = logits.index_select(&language_token_ids, 0)?;
    let probs = candle_nn::ops::softmax(&logits, D::Minus1)?.to_vec1::<f32>()?;

    // Map probabilities to language codes
    let language_probs: Vec<(&str, f32)> = if allowed_languages.is_empty() {
        LANGUAGES.iter().map(|(code, _)| *code).zip(probs).collect()
    } else {
        allowed_languages
            .iter()
            .map(|l| l.as_lang_code())
            .zip(probs)
            .collect()
    };

    // Find the most likely language
    let (detected_lang, _) = language_probs
        .into_iter()
        .max_by(|(_, p1), (_, p2)| p1.total_cmp(p2))
        .unwrap();

    debug!("detected language: {}", detected_lang);
    token_id(tokenizer, &format!("<|{detected_lang}|>"))
}
