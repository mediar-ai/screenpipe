use screenpipe_core::Language;
use screenpipe_db::DatabaseManager;

use crate::{
    core::{device::AudioDevice, engine::AudioTranscriptionEngine},
    vad::{VadEngineEnum, VadSensitivity},
};

use super::audio_manager::AudioManager;

pub struct AudioManagerOptions<'a> {
    pub transcription_engine: AudioTranscriptionEngine,
    pub vad_engine: VadEngineEnum,
    pub languages: Option<&'a [Language]>,
    pub deepgram_api_key: Option<String>,
    pub enable_diarization: bool,
    pub enable_realtime: bool,
    pub audio_chunk_duration: usize,
    pub vad_sensitivity: VadSensitivity,
    pub health_check_grace_period: usize,
    pub enabled_devices: Option<&'a [AudioDevice]>,
    pub use_all_devices: bool,
    pub db_path: Option<String>,
}

impl Default for AudioManagerOptions<'_> {
    fn default() -> Self {
        Self {
            transcription_engine: AudioTranscriptionEngine::default(),
            vad_engine: VadEngineEnum::Silero,
            languages: None,
            deepgram_api_key: None,
            enable_diarization: true,
            enable_realtime: false,
            audio_chunk_duration: 30,
            vad_sensitivity: VadSensitivity::High,
            health_check_grace_period: 10,
            enabled_devices: None,
            use_all_devices: false,
            db_path: None,
        }
    }
}

pub struct AudioManagerBuilder {
    options: AudioManagerOptions<'static>,
}

impl AudioManagerBuilder {
    pub fn new() -> Self {
        Self {
            options: AudioManagerOptions::default(),
        }
    }

    pub fn transcription_engine(mut self, transcription_engine: AudioTranscriptionEngine) -> Self {
        self.options.transcription_engine = transcription_engine;
        self
    }

    pub fn vad_engine(mut self, vad_engine: VadEngineEnum) -> Self {
        self.options.vad_engine = vad_engine;
        self
    }

    pub fn languages(mut self, languages: &'static [Language]) -> Self {
        self.options.languages = Some(languages);
        self
    }

    pub fn deepgram_api_key(mut self, deepgram_api_key: String) -> Self {
        self.options.deepgram_api_key = Some(deepgram_api_key);
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

    pub fn audio_chunk_duration(mut self, audio_chunk_duration: usize) -> Self {
        self.options.audio_chunk_duration = audio_chunk_duration;
        self
    }

    pub fn vad_sensitivity(mut self, vad_sensitivity: VadSensitivity) -> Self {
        self.options.vad_sensitivity = vad_sensitivity;
        self
    }

    pub fn health_check_grace_period(mut self, health_check_grace_period: usize) -> Self {
        self.options.health_check_grace_period = health_check_grace_period;
        self
    }

    pub fn enabled_devices(mut self, enabled_devices: &'static [AudioDevice]) -> Self {
        self.options.enabled_devices = Some(enabled_devices);
        self
    }

    pub fn use_all_devices(mut self, use_all_devices: bool) -> Self {
        self.options.use_all_devices = use_all_devices;
        self
    }

    pub async fn build(self, db: DatabaseManager) -> AudioManager<'static> {
        AudioManager::new(self.options, db).await
    }
}
