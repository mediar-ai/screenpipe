pub mod batch;
pub mod streaming;

use lazy_static::lazy_static;
use std::env;
use screenpipe_envs::env::DEEPGRAM_API_URL as DEEPGRAM_API_URL_ENV;
use screenpipe_envs::env::DEEPGRAM_WEBSOCKET_URL as DEEPGRAM_WEBSOCKET_URL_ENV;
use screenpipe_envs::env::CUSTOM_DEEPGRAM_API_TOKEN as CUSTOM_DEEPGRAM_API_TOKEN_ENV;

lazy_static! {
    pub(crate) static ref DEEPGRAM_API_URL: String = env::var(DEEPGRAM_API_URL_ENV)
        .unwrap_or_else(|_| "https://api.deepgram.com/v1/listen".to_string());
    pub(crate) static ref DEEPGRAM_WEBSOCKET_URL: String =
        env::var(DEEPGRAM_WEBSOCKET_URL_ENV).unwrap_or_else(|_| String::new());
    pub(crate) static ref CUSTOM_DEEPGRAM_API_TOKEN: String =
        env::var(CUSTOM_DEEPGRAM_API_TOKEN_ENV).unwrap_or_else(|_| String::new());
}
