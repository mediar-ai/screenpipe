use clap::Parser;
use screenpipe_audio::AudioTranscriptionEngine as CoreAudioTranscriptionEngine;
use screenpipe_vision::utils::OcrEngine as CoreOcrEngine;
use clap::ValueEnum;

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
    pub fps: f64, // ! not crazy about this (unconsistent behaviour across platforms) see https://github.com/mediar-ai/screenpipe/issues/173
    
    /// Audio chunk duration in seconds
    #[arg(short = 'd', long, default_value_t = 30)]
    pub audio_chunk_duration: u64,

    /// Port to run the server on
    #[arg(short = 'p', long, default_value_t = 3030)]
    pub port: u16,

    /// Disable audio recording
    #[arg(long, default_value_t = false)]
    pub disable_audio: bool,

    /// EXPERIMENTAL: Enable self healing when detecting unhealthy state based on /health endpoint.
    /// This feature will automatically restart the recording tasks while keeping the API alive.
    #[arg(long, default_value_t = false)]
    pub self_healing: bool,

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
        not(target_os = "macos"),
        arg(short = 'o', long, value_enum, default_value_t = CliOcrEngine::Tesseract)
    )]
    pub ocr_engine: CliOcrEngine,

    /// UID key for sending data to friend wearable (if not provided, data won't be sent)
    #[arg(long)]
    pub friend_wearable_uid: Option<String>,

    /// List available monitors, then you can use --monitor-id to select one (with the ID)
    #[arg(long)]
    pub list_monitors: bool,

    /// Monitor ID to use, this will be used to select the monitor to record
    #[arg(short = 'm', long)]
    pub monitor_id: Option<u32>,

    #[cfg(feature = "pipes")]
    /// File path for the pipe
    #[arg(long)]
    pub pipe: Vec<String>,

    /// Enable PII removal from OCR text property that is saved to db and returned in search results
    #[arg(long, default_value_t = false)]
    pub use_pii_removal: bool,

    /// Restart recording process every X minutes (0 means no periodic restart) - NOT RECOMMENDED
    #[arg(long, default_value_t = 0)]
    pub restart_interval: u64,
}