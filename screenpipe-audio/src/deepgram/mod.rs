mod process_chunk;
mod realtime;
use lazy_static::lazy_static;
#[doc(hidden)]
pub use realtime::start_deepgram_stream;
pub use realtime::stream_transcription_deepgram;
use std::env;

lazy_static! {
    pub(crate) static ref DEEPGRAM_API_URL: String = env::var("DEEPGRAM_API_URL")
        .unwrap_or_else(|_| "https://api.deepgram.com/v1/listen".to_string());
    pub(crate) static ref DEEPGRAM_WEBSOCKET_URL: String = env::var("DEEPGRAM_WEBSOCKET_URL")
        .unwrap_or_else(|_| "wss://api.deepgram.com/v1/listen".to_string());
    pub(crate) static ref CUSTOM_DEEPGRAM_API_TOKEN: String =
        env::var("CUSTOM_DEEPGRAM_API_TOKEN").unwrap_or_else(|_| String::new());
}

pub use process_chunk::transcribe_with_deepgram;
