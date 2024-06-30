mod audio;
mod core;
mod db;
mod embed;
mod video;

pub use audio::{start_audio_recording, AudioHandle, start_chunked_audio_recording};
pub use core::start_recording;
pub use core::CaptureHandles;
pub use db::DatabaseManager;
pub use video::{extract_all_frames_from_video, extract_frames_from_video};
