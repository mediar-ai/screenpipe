pub mod audio_processing;
mod core;
pub mod deepgram;
pub mod encode;
mod multilingual;
pub mod pcm_decode;
pub mod pyannote;
mod segments;
pub mod stt;
mod tokenizer;
pub mod vad_engine;
pub mod whisper;
pub use audio_processing::resample;
pub use core::{
    default_input_device, default_output_device, get_device_and_config, list_audio_devices,
    parse_audio_device, record_and_transcribe, start_realtime_recording, trigger_audio_permission,
    AudioStream, AudioTranscriptionEngine, LAST_AUDIO_CAPTURE,
};
pub mod realtime;
pub use encode::encode_single_audio;
pub use pcm_decode::pcm_decode;
pub use stt::{create_whisper_channel, stt, AudioInput, TranscriptionResult};
pub use vad_engine::VadEngineEnum;
