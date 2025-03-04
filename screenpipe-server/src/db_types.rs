use chrono::{DateTime, Utc};
use oasgen::OaSchema;
use screenpipe_audio::DeviceType;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::error::Error as StdError;
use std::fmt::{self, Display};

#[derive(OaSchema, Debug)]
pub struct DatabaseError(pub String);

impl fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Database error: {}", self.0)
    }
}

impl StdError for DatabaseError {}

#[derive(OaSchema, Debug, Serialize, Deserialize)]
pub enum SearchResult {
    OCR(OCRResult),
    Audio(AudioResult),
    UI(UiContent),
}

#[derive(FromRow, Debug)]
pub struct Frame {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub browser_url: String,
    pub app_name: String,
    pub window_name: String,
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
    pub browser_url: Option<String>,
    pub focused: Option<bool>,
}

#[derive(OaSchema, Debug, Serialize, Deserialize)]
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
    pub browser_url: Option<String>,
    pub focused: Option<bool>,
}

#[derive(OaSchema, Debug, Deserialize, PartialEq, Default, Clone)]
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

#[derive(OaSchema, Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Speaker {
    pub id: i64,
    pub name: String,
    pub metadata: String,
}

#[derive(OaSchema, Debug, Serialize, Deserialize)]
pub struct AudioResult {
    pub audio_chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub transcription_engine: String,
    pub tags: Vec<String>,
    pub device_name: String,
    pub device_type: DeviceType,
    pub speaker: Option<Speaker>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
}

#[derive(OaSchema, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TagContentType {
    Vision,
    Audio,
}

#[derive(OaSchema, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct UiContent {
    pub id: i64,
    #[sqlx(rename = "text_output")]
    pub text: String,
    pub timestamp: DateTime<Utc>,
    #[sqlx(rename = "app_name")]
    pub app_name: String,
    #[sqlx(rename = "window_name")]
    pub window_name: String,
    pub initial_traversal_at: Option<DateTime<Utc>>,
    pub file_path: String,
    pub offset_index: i64,
    pub frame_name: Option<String>,
    pub browser_url: Option<String>,
}

#[derive(OaSchema, Debug, Clone)]
pub struct FrameData {
    pub frame_id: i64,
    pub timestamp: DateTime<Utc>,
    pub offset_index: i64,
    pub ocr_entries: Vec<OCREntry>,
    pub audio_entries: Vec<AudioEntry>,
}

#[derive(OaSchema, Debug, Clone)]
pub struct OCREntry {
    pub text: String,
    pub app_name: String,
    pub window_name: String,
    pub device_name: String,
    pub video_file_path: String,
}

#[derive(OaSchema, Debug, Clone)]
pub struct AudioEntry {
    pub transcription: String,
    pub device_name: String,
    pub is_input: bool,
    pub audio_file_path: String,
    pub duration_secs: f64,
}

#[derive(OaSchema, Debug, Clone)]
pub struct TimeSeriesChunk {
    pub frames: Vec<FrameData>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

#[derive(OaSchema, Debug, Clone, Copy, PartialEq, Eq)]
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

#[derive(OaSchema, Debug, FromRow)]
pub struct AudioChunk {
    pub id: i64,
    pub file_path: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(OaSchema, Debug, FromRow)]
pub struct AudioChunksResponse {
    pub audio_chunk_id: i64,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub file_path: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OcrTextBlock {
    pub block_num: String,
    pub conf: String,
    pub page_num: String,
    pub left: String,
    pub height: String,
    pub level: String,
    pub text: String,
    pub par_num: String,
    pub top: String,
    pub word_num: String,
    pub width: String,
    pub line_num: String,
}

#[derive(OaSchema, Debug, Serialize, Clone)]
pub struct TextPosition {
    pub text: String,
    pub confidence: f32,
    pub bounds: TextBounds,
}

#[derive(OaSchema, Debug, Serialize, Clone)]
pub struct TextBounds {
    pub left: f32,
    pub top: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(OaSchema, Serialize)]
pub struct SearchMatch {
    pub frame_id: i64,
    pub timestamp: DateTime<Utc>,
    pub text_positions: Vec<TextPosition>,
    pub app_name: String,
    pub window_name: String,
    pub confidence: f32,
    // pub context: Option<String>,
    pub text: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct FrameRow {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub url: String,
    pub app_name: String,
    pub window_name: String,
    pub ocr_text: String,
    pub text_json: String,
}

#[derive(Deserialize, OaSchema, PartialEq, Default)]
pub enum Order {
    #[serde(rename = "ascending")]
    Ascending,
    #[serde(rename = "descending")]
    #[default]
    Descending,
}
