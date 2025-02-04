use chrono::{DateTime, Utc};
use screenpipe_core::AudioDeviceType;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::error::Error as StdError;
use std::fmt::{self, Display};

#[derive(Debug)]
pub struct DatabaseError(pub String);

impl fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Database error: {}", self.0)
    }
}

impl StdError for DatabaseError {}

#[derive(Debug, Serialize, Deserialize)]
pub enum SearchResult {
    OCR(OCRResult),
    Audio(AudioResult),
    UI(UiContent),
}

#[derive(FromRow, Debug)]
pub struct OCRResultRaw {
    pub frame_id: i64,
    pub ocr_text: String,
    pub text_json: String,
    pub frame_name: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub app_name: String,
    pub ocr_engine: String,
    pub window_name: String,
    pub tags: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OCRResult {
    pub frame_id: i64,
    pub frame_name: String,
    pub ocr_text: String,
    pub text_json: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub app_name: String,
    pub ocr_engine: String,
    pub window_name: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, PartialEq, Default, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    #[default]
    All,
    OCR,
    Audio,
    UI,
    #[serde(rename = "audio+ui")]
    #[serde(alias = "audio ui")]
    AudioAndUi,
    #[serde(rename = "ocr+ui")]
    #[serde(alias = "ocr ui")]
    OcrAndUi,
    #[serde(rename = "audio+ocr")]
    #[serde(alias = "audio ocr")]
    AudioAndOcr,
}

#[derive(FromRow)]
pub struct AudioResultRaw {
    pub audio_chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub transcription_engine: String,
    pub tags: Option<String>,
    pub device_name: String,
    pub is_input_device: bool,
    pub speaker_id: Option<i64>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Speaker {
    pub id: i64,
    pub name: String,
    pub metadata: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioResult {
    pub audio_chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub transcription_engine: String,
    pub tags: Vec<String>,
    pub device_name: String,
    pub device_type: AudioDeviceType,
    pub speaker: Option<Speaker>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TagContentType {
    Vision,
    Audio,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct UiContent {
    pub id: i64,
    #[sqlx(rename = "text_output")]
    pub text: String,
    pub timestamp: DateTime<Utc>,
    #[sqlx(rename = "app")]
    pub app_name: String,
    #[sqlx(rename = "window")]
    pub window_name: String,
    pub initial_traversal_at: Option<DateTime<Utc>>,
    pub file_path: String,
    pub offset_index: i64,
    pub frame_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FrameData {
    pub frame_id: i64,
    pub timestamp: DateTime<Utc>,
    pub offset_index: i64,
    pub ocr_entries: Vec<OCREntry>,
    pub audio_entries: Vec<AudioEntry>,
}

#[derive(Debug, Clone)]
pub struct OCREntry {
    pub text: String,
    pub app_name: String,
    pub window_name: String,
    pub device_name: String,
    pub video_file_path: String,
}

#[derive(Debug, Clone)]
pub struct AudioEntry {
    pub transcription: String,
    pub device_name: String,
    pub is_input: bool,
    pub audio_file_path: String,
    pub duration_secs: f64,
}

#[derive(Debug, Clone)]
pub struct TimeSeriesChunk {
    pub frames: Vec<FrameData>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentSource {
    Screen,
    Audio,
}

impl Display for ContentSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ContentSource::Screen => write!(f, "screen"),
            ContentSource::Audio => write!(f, "audio"),
        }
    }
}

#[derive(Debug, FromRow)]
pub struct AudioChunk {
    pub id: i64,
    pub file_path: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct AudioChunksResponse {
    pub audio_chunk_id: i64,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub file_path: String,
    pub timestamp: DateTime<Utc>,
}
