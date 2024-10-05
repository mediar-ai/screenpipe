use clap::{Parser, Subcommand};
use screenpipe_audio::{vad_engine::VadSensitivity, AudioTranscriptionEngine as CoreAudioTranscriptionEngine};
use screenpipe_vision::utils::OcrEngine as CoreOcrEngine;
use clap::ValueEnum;
use screenpipe_audio::vad_engine::VadEngineEnum;

#[derive(Clone, Debug, ValueEnum, PartialEq)]
pub enum CliAudioTranscriptionEngine {
    #[clap(name = "deepgram")]
    Deepgram,
    #[clap(name = "whisper-tiny")]
    WhisperTiny,
    #[clap(name = "whisper-large")]
    WhisperDistilLargeV3,
}

impl From<CliAudioTranscriptionEngine> for CoreAudioTranscriptionEngine {
    fn from(cli_engine: CliAudioTranscriptionEngine) -> Self {
        match cli_engine {
            CliAudioTranscriptionEngine::Deepgram => CoreAudioTranscriptionEngine::Deepgram,
            CliAudioTranscriptionEngine::WhisperTiny => CoreAudioTranscriptionEngine::WhisperTiny,
            CliAudioTranscriptionEngine::WhisperDistilLargeV3 => {
                CoreAudioTranscriptionEngine::WhisperDistilLargeV3
            }
        }
    }
}

#[derive(Clone, Debug, ValueEnum, PartialEq)]
pub enum CliOcrEngine {
    Unstructured,
    #[cfg(not(target_os = "macos"))]
    Tesseract,
    #[cfg(target_os = "windows")]
    WindowsNative,
    #[cfg(target_os = "macos")]
    AppleNative,
}

impl From<CliOcrEngine> for CoreOcrEngine {
    fn from(cli_engine: CliOcrEngine) -> Self {
        match cli_engine {
            CliOcrEngine::Unstructured => CoreOcrEngine::Unstructured,
            #[cfg(not(target_os = "macos"))]
            CliOcrEngine::Tesseract => CoreOcrEngine::Tesseract,
            #[cfg(target_os = "windows")]
            CliOcrEngine::WindowsNative => CoreOcrEngine::WindowsNative,
            #[cfg(target_os = "macos")]
            CliOcrEngine::AppleNative => CoreOcrEngine::AppleNative,
        }
    }
}
#[derive(Clone, Debug, ValueEnum, PartialEq)]
pub enum CliVadEngine {
    #[clap(name = "webrtc")]
    WebRtc,
    #[clap(name = "silero")]
    Silero,
}

impl From<CliVadEngine> for VadEngineEnum {
    fn from(cli_engine: CliVadEngine) -> Self {
        match cli_engine {
            CliVadEngine::WebRtc => VadEngineEnum::WebRtc,
            CliVadEngine::Silero => VadEngineEnum::Silero,
        }
    }
}

#[derive(Clone, Debug, ValueEnum, PartialEq)]
pub enum CliVadSensitivity {
    Low,
    Medium,
    High,
}

impl From<CliVadSensitivity> for VadSensitivity {
    fn from(cli_sensitivity: CliVadSensitivity) -> Self {
        match cli_sensitivity {
            CliVadSensitivity::Low => VadSensitivity::Low,
            CliVadSensitivity::Medium => VadSensitivity::Medium,
            CliVadSensitivity::High => VadSensitivity::High,
        }
    }
}

#[derive(Parser)]
#[command(
    author, 
    version,
    about, 
    long_about = None,
    name = "screenpipe"
)]
pub struct Cli {
    /// FPS for continuous recording
    /// 1 FPS = 30 GB / month
    /// 5 FPS = 150 GB / month
    /// Optimise based on your needs.
    /// Your screen rarely change more than 1 times within a second, right?
    #[cfg_attr(not(target_os = "macos"), arg(short, long, default_value_t = 1.0))]
    #[cfg_attr(target_os = "macos", arg(short, long, default_value_t = 0.2))] 
    pub fps: f64, // ! not crazy about this (inconsistent behaviour across platforms) see https://github.com/mediar-ai/screenpipe/issues/173
    
    /// Audio chunk duration in seconds
    #[arg(short = 'd', long, default_value_t = 30)]
    pub audio_chunk_duration: u64,

    /// Port to run the server on
    #[arg(short = 'p', long, default_value_t = 3030)]
    pub port: u16,

    /// Disable audio recording
    #[arg(long, default_value_t = false)]
    pub disable_audio: bool,

    /// Audio devices to use (can be specified multiple times)
    #[arg(short = 'i', long)]
    pub audio_device: Vec<String>,

    /// List available audio devices
    #[arg(long)]
    pub list_audio_devices: bool,

    /// Data directory. Default to $HOME/.screenpipe
    #[arg(long)]
    pub data_dir: Option<String>,

    /// Enable debug logging for screenpipe modules
    #[arg(long)]
    pub debug: bool,

    /// Save text files
    #[arg(long, default_value_t = false)]
    pub save_text_files: bool,

    /// Audio transcription engine to use.
    /// Deepgram is a very high quality cloud-based transcription service (free of charge on us for now), recommended for high quality audio.
    /// WhisperTiny is a local, lightweight transcription model, recommended for high data privacy.
    /// WhisperDistilLargeV3 is a local, lightweight transcription model (--a whisper-large), recommended for higher quality audio than tiny.
    #[arg(short = 'a', long, value_enum, default_value_t = CliAudioTranscriptionEngine::WhisperDistilLargeV3)]
    pub audio_transcription_engine: CliAudioTranscriptionEngine,

    /// OCR engine to use.
    /// AppleNative is the default local OCR engine for macOS.
    /// WindowsNative is a local OCR engine for Windows.
    /// Unstructured is a cloud OCR engine (free of charge on us for now), recommended for high quality OCR.
    /// Tesseract is a local OCR engine (not supported on macOS)
    #[cfg_attr(
        target_os = "macos",
        arg(short = 'o', long, value_enum, default_value_t = CliOcrEngine::AppleNative)
    )]
    #[cfg_attr(
        target_os = "windows",
        arg(short = 'o', long, value_enum, default_value_t = CliOcrEngine::WindowsNative)
    )]
    #[cfg_attr(
        not(any(target_os = "macos", target_os = "windows")),
        arg(short = 'o', long, value_enum, default_value_t = CliOcrEngine::Tesseract)
    )]
    pub ocr_engine: CliOcrEngine,

    /// UID key for sending data to friend wearable (if not provided, data won't be sent)
    #[arg(long)]
    pub friend_wearable_uid: Option<String>,

    /// List available monitors, then you can use --monitor-id to select one (with the ID)
    #[arg(long)]
    pub list_monitors: bool,

    /// Monitor IDs to use, these will be used to select the monitors to record
    #[arg(short = 'm', long)]
    pub monitor_id: Vec<u32>,

    /// Enable PII removal from OCR text property that is saved to db and returned in search results
    #[arg(long, default_value_t = false)]
    pub use_pii_removal: bool,

    /// Disable vision recording
    #[arg(long, default_value_t = false)]
    pub disable_vision: bool,

    /// VAD engine to use for speech detection
    #[arg(long, value_enum, default_value_t = CliVadEngine::Silero)] // Silero or WebRtc
    pub vad_engine: CliVadEngine,

    /// List of windows to ignore (by title) for screen recording - we use contains to match, example:
    /// --ignored-windows "Spotify" --ignored-windows "Bit" will ignore both "Bitwarden" and "Bittorrent"
    /// --ignored-windows "porn" will ignore "pornhub" and "youporn"
    #[arg(long)]
    pub ignored_windows: Vec<String>,

    /// List of windows to include (by title) for screen recording - we use contains to match, example:
    /// --included-windows "Chrome" will include "Google Chrome"
    /// --included-windows "WhatsApp" will include "WhatsApp"
    #[arg(long)]
    pub included_windows: Vec<String>,

    /// Video chunk duration in seconds
    #[arg(long, default_value_t = 60)]
    pub video_chunk_duration: u64,

    /// Deepgram API Key for audio transcription
    #[arg(long = "deepgram-api-key")]
    pub deepgram_api_key: Option<String>,

    /// PID to watch for auto-destruction. If provided, screenpipe will stop when this PID is no longer running.
    #[arg(long)]
    pub auto_destruct_pid: Option<u32>,

    /// Voice activity detection sensitivity level
    #[arg(long, value_enum, default_value_t = CliVadSensitivity::High)]
    pub vad_sensitivity: CliVadSensitivity,

    /// Disable telemetry
    #[arg(long, default_value_t = false)]
    pub disable_telemetry: bool,

    #[command(subcommand)]
    pub command: Option<Command>,

}

#[derive(Subcommand)]
pub enum Command {
    /// Pipe management commands
    Pipe {
        #[command(subcommand)]
        subcommand: PipeCommand,
    },
    // ... (other top-level commands if any)
}


#[derive(Subcommand)]
pub enum PipeCommand {
    /// List all pipes
    List,
    /// Download a new pipe
    Download {
        /// URL of the pipe to download
        url: String,
    },
    /// Get info for a specific pipe
    Info {
        /// ID of the pipe
        id: String,
    },
    /// Enable a pipe
    Enable {
        /// ID of the pipe to enable
        id: String,
    },
    /// Disable a pipe
    Disable {
        /// ID of the pipe to disable
        id: String,
    },
    /// Update pipe configuration
    Update {
        /// ID of the pipe to update
        id: String,
        /// New configuration as a JSON string
        config: String,
    },
    /// Purge all pipes
    Purge {
        /// Automatically confirm purge without prompting
        #[arg(short = 'y', long)]
        yes: bool,
    },
}
