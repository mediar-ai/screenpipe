use super::detect_language;
use anyhow::Result;
use screenpipe_core::Language;
use std::sync::Arc;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};
/// Processes audio data using the Whisper model to generate transcriptions.
///
/// # Returns
/// A string containing the processed transcript
pub async fn process_with_whisper(
    audio: &[f32],
    languages: Vec<Language>,
    whisper_context: Arc<WhisperContext>,
) -> Result<String> {
    let mut whisper_state = whisper_context
        .create_state()
        .expect("failed to create key");

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });

    let mut audio = audio.to_vec();

    if audio.len() < 16000 {
        audio.resize(16000, 0.0);
    }

    // Edit params as needed.
    // Set the number of threads to use to 2.
    params.set_n_threads(2);
    // Disable anything that prints to stdout.
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // Enable token level timestamps
    params.set_token_timestamps(true);
    whisper_state.pcm_to_mel(&audio, 2)?;
    let (_, lang_tokens) = whisper_state.lang_detect(0, 2)?;
    let lang = detect_language(lang_tokens, languages);
    params.set_language(lang);
    params.set_debug_mode(false);
    params.set_logprob_thold(-2.0);
    params.set_translate(false);

    whisper_state
        .full(params, &audio)
        .expect("failed to run model");

    let num_segments = whisper_state
        .full_n_segments()
        .expect("failed to get number of segments");

    let mut transcript = String::new();

    for i in 0..num_segments {
        // Get the transcribed text and timestamps for the current segment.
        let segment = whisper_state
            .full_get_segment_text(i)
            .expect("failed to get segment");

        transcript.push_str(&segment);
    }

    Ok(transcript)
}
