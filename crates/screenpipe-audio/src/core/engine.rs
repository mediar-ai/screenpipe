use std::fmt;

#[derive(Clone, Debug, PartialEq, Default)]
pub enum AudioTranscriptionEngine {
    Deepgram,
    WhisperTiny,
    WhisperTinyQuantized,
    #[default]
    WhisperLargeV3Turbo,
    WhisperLargeV3TurboQuantized,
    WhisperLargeV3,
    WhisperLargeV3Quantized,
}

impl fmt::Display for AudioTranscriptionEngine {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AudioTranscriptionEngine::Deepgram => write!(f, "Deepgram"),
            AudioTranscriptionEngine::WhisperTiny => write!(f, "WhisperTiny"),
            AudioTranscriptionEngine::WhisperTinyQuantized => write!(f, "WhisperTinyQuantized"),
            AudioTranscriptionEngine::WhisperLargeV3 => write!(f, "WhisperLargeV3"),
            AudioTranscriptionEngine::WhisperLargeV3Quantized => {
                write!(f, "WhisperLargeV3Quantized")
            }
            AudioTranscriptionEngine::WhisperLargeV3Turbo => write!(f, "WhisperLargeV3Turbo"),
            AudioTranscriptionEngine::WhisperLargeV3TurboQuantized => {
                write!(f, "WhisperLargeV3TurboQuantized")
            }
        }
    }
}
