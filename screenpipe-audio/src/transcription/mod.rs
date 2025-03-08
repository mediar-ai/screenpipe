use std::sync::Arc;

use crate::core::device::AudioDevice;

pub mod deepgram;
pub mod stt;
pub mod whisper;

#[derive(Debug, Clone)]
pub struct AudioInput {
    pub data: Arc<Vec<f32>>,
    pub sample_rate: u32,
    pub channels: u16,
    pub device: Arc<AudioDevice>,
}

mod text_utils;

mod transcription_result;

pub use transcription_result::process_transcription_result;
pub use transcription_result::TranscriptionResult;
mod handle_new_transcript;
pub use handle_new_transcript::handle_new_transcript;
