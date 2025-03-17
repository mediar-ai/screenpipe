use anyhow::Result;
use std::{collections::HashSet, env, path::PathBuf, sync::Arc, time::Duration};

use screenpipe_core::Language;
use screenpipe_db::DatabaseManager;

use crate::{
    core::{
        device::{default_input_device, default_output_device},
        engine::AudioTranscriptionEngine,
    },
    transcription::deepgram::CUSTOM_DEEPGRAM_API_TOKEN,
    vad::{VadEngineEnum, VadSensitivity},
};

use crate::audio_manager::AudioManager;

#[derive(Clone)]
pub struct AudioManagerOptions {
    pub transcription_engine: Arc<AudioTranscriptionEngine>,
    pub vad_engine: VadEngineEnum,
    pub languages: Vec<Language>,
    pub deepgram_api_key: Option<String>,
    pub enable_diarization: bool,
    pub enable_realtime: bool,
    pub audio_chunk_duration: Duration,
    pub vad_sensitivity: VadSensitivity,
    pub health_check_grace_period: u64,
    pub enabled_devices: HashSet<String>,
    pub use_all_devices: bool,
    pub db_path: Option<String>,
    pub deepgram_url: Option<String>,
    pub deepgram_websocket_url: Option<String>,
    pub output_path: Option<PathBuf>,
}

impl Default for AudioManagerOptions {
    fn default() -> Self {
        let deepgram_api_key = env::var("DEEPGRAM_API_KEY").ok();
        let deepgram_websocket_url = env::var("DEEPGRAM_WEBSOCKET_URL").ok();
        let deepgram_url = env::var("DEEPGRAM_API_URL").ok();
        let enabled_devices = HashSet::new();
        Self {
            output_path: None,
            transcription_engine: Arc::new(AudioTranscriptionEngine::default()),
            vad_engine: VadEngineEnum::Silero,
            languages: vec![],
            deepgram_api_key,
            enable_diarization: true,
            enable_realtime: false,
            audio_chunk_duration: Duration::from_secs(30),
            vad_sensitivity: VadSensitivity::High,
            health_check_grace_period: 15,
            enabled_devices,
            use_all_devices: false,
            db_path: None,
            deepgram_url,
            deepgram_websocket_url,
        }
    }
}

#[derive(Default)]
pub struct AudioManagerBuilder {
    options: AudioManagerOptions,
}

impl AudioManagerBuilder {
    pub fn new() -> Self {
        Self {
            options: AudioManagerOptions::default(),
        }
    }

    pub fn transcription_engine(mut self, transcription_engine: AudioTranscriptionEngine) -> Self {
        self.options.transcription_engine = Arc::new(transcription_engine);
        self
    }

    pub fn vad_engine(mut self, vad_engine: VadEngineEnum) -> Self {
        self.options.vad_engine = vad_engine;
        self
    }

    pub fn languages(mut self, languages: Vec<Language>) -> Self {
        self.options.languages = languages;
        self
    }

    pub fn deepgram_api_key(mut self, deepgram_api_key: Option<String>) -> Self {
        self.options.deepgram_api_key = deepgram_api_key;
        self
    }

    pub fn diarization(mut self, enable_diarization: bool) -> Self {
        self.options.enable_diarization = enable_diarization;
        self
    }

    pub fn realtime(mut self, enable_realtime: bool) -> Self {
        self.options.enable_realtime = enable_realtime;
        self
    }

    pub fn audio_chunk_duration(mut self, audio_chunk_duration: Duration) -> Self {
        self.options.audio_chunk_duration = audio_chunk_duration;
        self
    }

    pub fn vad_sensitivity(mut self, vad_sensitivity: VadSensitivity) -> Self {
        self.options.vad_sensitivity = vad_sensitivity;
        self
    }

    pub fn health_check_grace_period(mut self, health_check_grace_period: u64) -> Self {
        self.options.health_check_grace_period = health_check_grace_period;
        self
    }

    pub fn enabled_devices(mut self, enabled_devices: Vec<String>) -> Self {
        self.options.enabled_devices = HashSet::from_iter(enabled_devices);
        self
    }

    pub fn use_all_devices(mut self, use_all_devices: bool) -> Self {
        self.options.use_all_devices = use_all_devices;
        self
    }

    pub fn deepgram_url(mut self, deepgram_url: Option<String>) -> Self {
        self.options.deepgram_url = deepgram_url;
        self
    }

    pub fn deepgram_websocket_url(mut self, deepgram_websocket_url: Option<String>) -> Self {
        self.options.deepgram_websocket_url = deepgram_websocket_url;
        self
    }

    pub async fn build(&mut self, db: Arc<DatabaseManager>) -> Result<AudioManager> {
        self.validate_options()?;
        let options = &mut self.options;

        if options.enabled_devices.is_empty() {
            options.enabled_devices = HashSet::from_iter(vec![
                default_input_device()?.to_string(),
                default_output_device().await?.to_string(),
            ]);
        }

        AudioManager::new(options.clone(), db).await
    }

    pub fn output_path(mut self, output_path: PathBuf) -> Self {
        self.options.output_path = Some(output_path);
        self
    }

    // TODO: Make sure the custom urls work
    pub fn validate_options(&self) -> Result<()> {
        if self.options.transcription_engine == Arc::new(AudioTranscriptionEngine::Deepgram)
            && (self.options.deepgram_api_key.is_none() && CUSTOM_DEEPGRAM_API_TOKEN.is_empty())
        {
            return Err(anyhow::anyhow!(
                "Deepgram API key is required for Deepgram transcription engine"
            ));
        }

        if self.options.output_path.is_none() {
            return Err(anyhow::anyhow!("Output path is required for audio manager"));
        }

        if self.options.enable_realtime
            && (self.options.deepgram_api_key.is_none() && CUSTOM_DEEPGRAM_API_TOKEN.is_empty())
        {
            return Err(anyhow::anyhow!(
                "Deepgram API key is required for realtime transcription"
            ));
        }

        Ok(())
    }
}
