pub mod batch;
pub mod streaming;

use lazy_static::lazy_static;
use std::env;

lazy_static! {
    pub(crate) static ref DEEPGRAM_API_URL: String = env::var("DEEPGRAM_API_URL")
        .unwrap_or_else(|_| "https://api.deepgram.com/v1/listen".to_string());
    pub(crate) static ref DEEPGRAM_WEBSOCKET_URL: String =
        env::var("DEEPGRAM_WEBSOCKET_URL").unwrap_or_else(|_| String::new());
    pub(crate) static ref CUSTOM_DEEPGRAM_API_TOKEN: String =
        env::var("CUSTOM_DEEPGRAM_API_TOKEN").unwrap_or_else(|_| String::new());
}
