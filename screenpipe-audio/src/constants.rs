use once_cell::sync::Lazy;
use std::env;
use std::sync::Arc;

// Audio Processing Constants
pub static CONFIG: Lazy<Config> = Lazy::new(|| Config::from_env());

// But add a thread-local dynamic config for testing
thread_local! {
    pub static TESTING_CONFIG: std::cell::RefCell<Option<Arc<Config>>> = std::cell::RefCell::new(None);
}

// Helper function to get the active config
pub fn get_config() -> Arc<Config> {
    TESTING_CONFIG.with(|test_config| {
        if let Some(config) = test_config.borrow().clone() {
            config
        } else {
            Arc::new(CONFIG.clone())
        }
    })
}

#[derive(Debug, Clone)]
pub struct Config {
    // Audio processing settings
    pub target_rms: f32,
    pub target_peak: f32,
    pub window_size: usize,
    pub frame_size: usize,
    pub whisper_sample_rate: u32,
    pub chunk_duration_ms: f32,

    // Overlap settings
    pub overlap_seconds: usize,
    pub overlap_samples: usize,

    // VAD settings
    pub frame_history: usize,
    pub speech_threshold: f32,
    pub silence_threshold: f32,
    pub speech_frame_threshold: usize,
    pub chunk_size: usize,
    pub speech_duration_threshold_ms: u64,
    pub silence_duration_threshold_ms: u64,

    // VAD sensitivity settings
    pub vad_sensitivity_low_threshold: f32,
    pub vad_sensitivity_medium_threshold: f32,
    pub vad_sensitivity_high_threshold: f32,
    pub vad_sensitivity_low_speech_ratio: f32,
    pub vad_sensitivity_medium_speech_ratio: f32,
    pub vad_sensitivity_high_speech_ratio: f32,

    // Add a name field to identify configurations
    pub name: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self::new("default".to_string())
    }

    pub fn new(name: String) -> Self {
        let whisper_sample_rate = env::var("AUDIO_WHISPER_SAMPLE_RATE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(16000);

        let overlap_seconds = env::var("OVERLAP_SECONDS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1);

        Self {
            // Audio settings
            target_rms: env::var("AUDIO_TARGET_RMS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.2),
            target_peak: env::var("AUDIO_TARGET_PEAK")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.95),
            window_size: env::var("AUDIO_WINDOW_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1600),
            frame_size: env::var("AUDIO_FRAME_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1600),
            whisper_sample_rate,
            chunk_duration_ms: env::var("AUDIO_CHUNK_DURATION_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000.0),

            // Overlap settings
            overlap_seconds,
            overlap_samples: overlap_seconds * whisper_sample_rate as usize,

            // VAD settings
            frame_history: env::var("VAD_FRAME_HISTORY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(15),
            speech_threshold: env::var("VAD_SPEECH_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.55),
            silence_threshold: env::var("VAD_SILENCE_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.3),
            speech_frame_threshold: env::var("VAD_SPEECH_FRAME_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4),
            chunk_size: env::var("VAD_CHUNK_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1600),
            speech_duration_threshold_ms: env::var("VAD_SPEECH_DURATION_THRESHOLD_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(700),
            silence_duration_threshold_ms: env::var("VAD_SILENCE_DURATION_THRESHOLD_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1500),

            // VAD sensitivity settings
            vad_sensitivity_low_threshold: env::var("VAD_SENSITIVITY_LOW_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.25),
            vad_sensitivity_medium_threshold: env::var("VAD_SENSITIVITY_MEDIUM_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.55),
            vad_sensitivity_high_threshold: env::var("VAD_SENSITIVITY_HIGH_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.75),
            vad_sensitivity_low_speech_ratio: env::var("VAD_SENSITIVITY_LOW_SPEECH_RATIO")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.02),
            vad_sensitivity_medium_speech_ratio: env::var("VAD_SENSITIVITY_MEDIUM_SPEECH_RATIO")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.07),
            vad_sensitivity_high_speech_ratio: env::var("VAD_SENSITIVITY_HIGH_SPEECH_RATIO")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.3),

            name,
        }
    }

    // Add factory methods for different configurations
    #[cfg(test)]
    pub fn generate_test_configs() -> Vec<Self> {
        vec![
            Self {
                name: "quick_detection".to_string(),
                speech_threshold: 0.6,
                silence_threshold: 0.3,
                speech_duration_threshold_ms: 500, // Detect speech faster (500ms)
                silence_duration_threshold_ms: 1000, // End segments faster (1s)
                overlap_seconds: 2,                // 2s overlap for context
                chunk_duration_ms: 2000.0,         // 2s chunks
                ..Self::new("quick_detection".to_string())
            },
            Self {
                name: "careful_detection".to_string(),
                speech_threshold: 0.5,
                silence_threshold: 0.35,
                speech_duration_threshold_ms: 1000, // More careful speech detection (1s)
                silence_duration_threshold_ms: 2000, // Longer silence needed (2s)
                overlap_seconds: 3,                 // 3s overlap for safety
                chunk_duration_ms: 3000.0,          // 3s chunks
                ..Self::new("careful_detection".to_string())
            },
            Self {
                name: "max_context".to_string(),
                speech_threshold: 0.45,
                silence_threshold: 0.4,
                speech_duration_threshold_ms: 700, // Default speech detection
                silence_duration_threshold_ms: 1500, // Default silence
                overlap_seconds: 4,                // Maximum context preservation
                chunk_duration_ms: 4000.0,         // Longer chunks
                ..Self::new("max_context".to_string())
            },
            Self {
                name: "minimal_overlap".to_string(),
                speech_threshold: 0.55,
                silence_threshold: 0.3,
                speech_duration_threshold_ms: 600,
                silence_duration_threshold_ms: 1200,
                overlap_seconds: 1,        // Minimum overlap
                chunk_duration_ms: 2500.0, // Standard chunk size
                ..Self::new("minimal_overlap".to_string())
            },
        ]
    }

    #[cfg(test)]
    pub fn set_as_active(self) -> Arc<Self> {
        let config = Arc::new(self);
        TESTING_CONFIG.with(|test_config| {
            *test_config.borrow_mut() = Some(config.clone());
        });
        config
    }
}

// API Constants
pub static DEEPGRAM_API_KEY: Lazy<String> = Lazy::new(|| {
    env::var("DEEPGRAM_API_KEY")
        .unwrap_or_else(|_| "7ed2a159a094337b01fd8178b914b7ae0e77822d".to_string())
});

pub static TRANSCRIPTION_PROCESSING_MODEL: Lazy<String> = Lazy::new(|| {
    env::var("TRANSCRIPTION_PROCESSING_MODEL")
        .unwrap_or_else(|_| "llama3.2:1b-instruct-q4_K_M".to_string())
});

pub static TRANSCRIPTION_PROCESSING_URL: Lazy<String> = Lazy::new(|| {
    env::var("TRANSCRIPTION_PROCESSING_MODEL_URL")
        .unwrap_or_else(|_| "http://localhost:11434/v1/chat/completions".to_string())
});

// System Prompts
pub const TRANSCRIPT_SPLITTER_PROMPT: &str = r#"You are a transcript splitter specialized in handling overlapping speech segments from technical conversations. Your task is to:

1. Find the overlap point between two segments
2. Split them optimally to maintain context and readability
3. Handle special cases:
   - Repeated words/phrases (like "yeah yeah yeah")
   - Technical terms and numbers
   - Incomplete sentences and interruptions
   - Background noise markers [noise]
   - Non-native speaker patterns
   - Short utterances and filler words

Output format: JSON object with two fields:
- "previous": cleaned previous segment (keep meaningful content)
- "current": cleaned current segment (avoid duplicating content)

Rules:
1. Keep repeated words together in one segment
2. Preserve technical terms in their entirety
3. Split at natural pause points
4. Maintain context in both segments
5. Remove noise markers from final output
6. Keep short utterances intact if they're meaningful

Example:
Input: Previous: "yeah yeah yeah so basically the API" Current: "the API needs authentication"
Output: {"previous": "yeah yeah yeah so basically", "current": "the API needs authentication"}
"#;
