mod core;
mod multilingual;
mod pcm_decode;
mod stt;
pub use core::{
    default_input_device, default_output_device, list_audio_devices, parse_device_spec,
    record_and_transcribe, AudioCaptureResult, AudioDevice, DeviceSpec, DeviceControl
};
pub use stt::{create_whisper_channel, stt, AudioInput, TranscriptionResult, WhisperModel};
