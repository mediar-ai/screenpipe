use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Json, Path, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Json as JsonResponse, Response},
    routing::get,
    serve, Router,
};
use oasgen::{oasgen, OaSchema, Server};

use screenpipe_db::{
    ContentType, DatabaseManager, FrameData, Order, SearchMatch, SearchResult, Speaker,
    TagContentType,
};
use tokio_util::io::ReaderStream;

use tokio::fs::File;

use futures::{
    future::{try_join, try_join_all},
    SinkExt, StreamExt,
};
use image::ImageFormat::{self};
use screenpipe_events::{send_event, subscribe_to_all_events, Event as ScreenpipeEvent};

use crate::{
    embedding::embedding_endpoint::create_embeddings,
    video::{finish_ffmpeg_process, start_ffmpeg_process, write_frame_to_ffmpeg, MAX_FPS},
    video_cache::{AudioEntry, DeviceFrame, FrameCache, FrameMetadata, TimeSeriesFrame},
    video_utils::{
        extract_frame, extract_frame_from_video, extract_high_quality_frame, merge_videos,
        validate_media, MergeVideosRequest, MergeVideosResponse, ValidateMediaParams,
    },
    PipeManager,
};
use chrono::{DateTime, Utc};
use screenpipe_audio::{
    audio_manager::AudioManager,
    core::device::{
        default_input_device, default_output_device, list_audio_devices, AudioDevice, DeviceType,
    },
};
use tracing::{debug, error, info};

use screenpipe_vision::monitor::{get_monitor_by_id, list_monitors};
use screenpipe_vision::OcrEngine;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use std::{
    net::SocketAddr,
    num::NonZeroUsize,
    path::PathBuf,
    sync::{atomic::Ordering, Arc},
    time::{Duration, Instant},
};

use lru::LruCache;

use tokio::{
    net::TcpListener,
    sync::{mpsc, Mutex},
    time::timeout,
};

use tower_http::{cors::Any, trace::TraceLayer};
use tower_http::{cors::CorsLayer, trace::DefaultMakeSpan};

// At the top of the file, add:
#[cfg(feature = "experimental")]
use enigo::{Enigo, Key, Settings};
use std::str::FromStr;

use crate::text_embeds::generate_embedding;

pub type FrameImageCache = LruCache<i64, (String, Instant)>;

pub struct AppState {
    pub db: Arc<DatabaseManager>,
    pub audio_manager: Arc<AudioManager>,
    pub app_start_time: DateTime<Utc>,
    pub screenpipe_dir: PathBuf,
    pub pipe_manager: Arc<PipeManager>,
    pub vision_disabled: bool,
    pub audio_disabled: bool,
    pub ui_monitoring_enabled: bool,
    pub frame_cache: Option<Arc<FrameCache>>,
    pub frame_image_cache: Option<Arc<Mutex<FrameImageCache>>>,
}

// Update the SearchQuery struct
#[derive(OaSchema, Deserialize)]
pub(crate) struct SearchQuery {
    q: Option<String>,
    #[serde(flatten)]
    pagination: PaginationQuery,
    #[serde(default)]
    content_type: ContentType,
    #[serde(default)]
    start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    end_time: Option<DateTime<Utc>>,
    #[serde(default)]
    app_name: Option<String>,
    #[serde(default)]
    window_name: Option<String>,
    #[serde(default)]
    frame_name: Option<String>,
    #[serde(default)]
    include_frames: bool,
    #[serde(default)]
    min_length: Option<usize>,
    #[serde(default)]
    max_length: Option<usize>,
    #[serde(
        deserialize_with = "from_comma_separated_array",
        default = "default_speaker_ids"
    )]
    speaker_ids: Option<Vec<i64>>,
    #[serde(default)]
    focused: Option<bool>,
    #[serde(default)]
    browser_url: Option<String>,
}

#[derive(OaSchema, Deserialize)]
pub(crate) struct PaginationQuery {
    #[serde(default = "default_limit")]
    #[serde(deserialize_with = "deserialize_number_from_string")]
    limit: u32,
    #[serde(default)]
    #[serde(deserialize_with = "deserialize_number_from_string")]
    offset: u32,
}

fn deserialize_number_from_string<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s: String = serde::Deserialize::deserialize(deserializer)?;
    s.parse().map_err(serde::de::Error::custom)
}

// Response structs
#[derive(Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: PaginationInfo,
}

#[derive(Serialize, OaSchema, Deserialize)]
pub struct PaginationInfo {
    pub limit: u32,
    pub offset: u32,
    pub total: i64,
}

#[derive(OaSchema, Serialize, Deserialize, Debug)]
pub struct UpdateSpeakerRequest {
    pub id: i64,
    pub name: Option<String>,
    pub metadata: Option<String>,
}

#[derive(OaSchema, Serialize, Deserialize, Debug)]
pub struct SearchSpeakersRequest {
    pub name: Option<String>,
}

#[derive(OaSchema, Serialize, Deserialize, Debug)]
pub struct DeleteSpeakerRequest {
    pub id: i64,
}

#[derive(OaSchema, Deserialize)]
struct MarkAsHallucinationRequest {
    speaker_id: i64,
}

#[derive(OaSchema, Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "content")]
pub enum ContentItem {
    OCR(OCRContent),
    Audio(AudioContent),
    UI(UiContent),
}

#[derive(OaSchema, Serialize, Deserialize, Debug)]
pub struct OCRContent {
    pub frame_id: i64,
    pub text: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub app_name: String,
    pub window_name: String,
    pub tags: Vec<String>,
    pub frame: Option<String>,
    pub frame_name: Option<String>,
    pub browser_url: Option<String>,
    pub focused: Option<bool>,
}

#[derive(OaSchema, Serialize, Deserialize, Debug)]
pub struct AudioContent {
    pub chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub tags: Vec<String>,
    pub device_name: String,
    pub device_type: DeviceType,
    pub speaker: Option<Speaker>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
}

#[derive(OaSchema, Serialize, Deserialize, Debug)]
pub struct UiContent {
    pub id: i64,
    pub text: String,
    pub timestamp: DateTime<Utc>,
    pub app_name: String,
    pub window_name: String,
    pub initial_traversal_at: Option<DateTime<Utc>>,
    pub file_path: String,
    pub offset_index: i64,
    pub frame_name: Option<String>,
    pub browser_url: Option<String>,
}

#[derive(OaSchema, Serialize)]
pub(crate) struct ListDeviceResponse {
    name: String,
    is_default: bool,
}

#[derive(OaSchema, Serialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_default: bool,
}

#[derive(OaSchema, Deserialize)]
pub struct AddTagsRequest {
    tags: Vec<String>,
}

#[derive(OaSchema, Serialize)]
pub struct AddTagsResponse {
    success: bool,
}

#[derive(OaSchema, Deserialize)]
pub struct RemoveTagsRequest {
    tags: Vec<String>,
}

#[derive(OaSchema, Serialize)]
pub struct RemoveTagsResponse {
    success: bool,
}

// Helper functions
fn default_limit() -> u32 {
    20
}

#[derive(Serialize, OaSchema, Deserialize)]
pub struct HealthCheckResponse {
    pub status: String,
    pub status_code: u16,
    pub last_frame_timestamp: Option<DateTime<Utc>>,
    pub last_audio_timestamp: Option<DateTime<Utc>>,
    pub last_ui_timestamp: Option<DateTime<Utc>>,
    pub frame_status: String,
    pub audio_status: String,
    pub ui_status: String,
    pub message: String,
    pub verbose_instructions: Option<String>,
}

#[derive(OaSchema, Serialize, Deserialize)]
pub struct SearchResponse {
    pub data: Vec<ContentItem>,
    pub pagination: PaginationInfo,
}

// Update the search function
#[oasgen]
pub(crate) async fn search(
    Query(query): Query<SearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<JsonResponse<SearchResponse>, (StatusCode, JsonResponse<serde_json::Value>)> {
    info!(
        "received search request: query='{}', content_type={:?}, limit={}, offset={}, start_time={:?}, end_time={:?}, app_name={:?}, window_name={:?}, min_length={:?}, max_length={:?}, speaker_ids={:?}, frame_name={:?}, browser_url={:?}, focused={:?}",
        query.q.as_deref().unwrap_or(""),
        query.content_type,
        query.pagination.limit,
        query.pagination.offset,
        query.start_time,
        query.end_time,
        query.app_name,
        query.window_name,
        query.min_length,
        query.max_length,
        query.speaker_ids,
        query.frame_name,
        query.browser_url,
        query.focused,
    );

    let query_str = query.q.as_deref().unwrap_or("");

    let content_type = query.content_type.clone();

    let (results, total) = try_join(
        state.db.search(
            query_str,
            content_type.clone(),
            query.pagination.limit,
            query.pagination.offset,
            query.start_time,
            query.end_time,
            query.app_name.as_deref(),
            query.window_name.as_deref(),
            query.min_length,
            query.max_length,
            query.speaker_ids.clone(),
            query.frame_name.as_deref(),
            query.browser_url.as_deref(),
            query.focused,
        ),
        state.db.count_search_results(
            query_str,
            content_type,
            query.start_time,
            query.end_time,
            query.app_name.as_deref(),
            query.window_name.as_deref(),
            query.min_length,
            query.max_length,
            query.speaker_ids.clone(),
            query.frame_name.as_deref(),
            query.browser_url.as_deref(),
            query.focused,
        ),
    )
    .await
    .map_err(|e| {
        error!("failed to perform search operations: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("failed to perform search operations: {}", e)})),
        )
    })?;

    let mut content_items: Vec<ContentItem> = results
        .iter()
        .map(|result| match result {
            SearchResult::OCR(ocr) => ContentItem::OCR(OCRContent {
                frame_id: ocr.frame_id,
                text: ocr.ocr_text.clone(),
                timestamp: ocr.timestamp,
                file_path: ocr.file_path.clone(),
                offset_index: ocr.offset_index,
                app_name: ocr.app_name.clone(),
                window_name: ocr.window_name.clone(),
                tags: ocr.tags.clone(),
                frame: None,
                frame_name: Some(ocr.frame_name.clone()),
                browser_url: ocr.browser_url.clone(),
                focused: ocr.focused,
            }),
            SearchResult::Audio(audio) => ContentItem::Audio(AudioContent {
                chunk_id: audio.audio_chunk_id,
                transcription: audio.transcription.clone(),
                timestamp: audio.timestamp,
                file_path: audio.file_path.clone(),
                offset_index: audio.offset_index,
                tags: audio.tags.clone(),
                device_name: audio.device_name.clone(),
                device_type: audio.device_type.clone().into(),
                speaker: audio.speaker.clone(),
                start_time: audio.start_time,
                end_time: audio.end_time,
            }),
            SearchResult::UI(ui) => ContentItem::UI(UiContent {
                id: ui.id,
                text: ui.text.clone(),
                timestamp: ui.timestamp,
                app_name: ui.app_name.clone(),
                window_name: ui.window_name.clone(),
                initial_traversal_at: ui.initial_traversal_at,
                file_path: ui.file_path.clone(),
                offset_index: ui.offset_index,
                frame_name: ui.frame_name.clone(),
                browser_url: ui.browser_url.clone(),
            }),
        })
        .collect();

    if query.include_frames {
        debug!("extracting frames for ocr content");
        let frame_futures: Vec<_> = content_items
            .iter()
            .filter_map(|item| {
                if let ContentItem::OCR(ocr_content) = item {
                    Some(extract_frame(
                        &ocr_content.file_path,
                        ocr_content.offset_index,
                    ))
                } else {
                    None
                }
            })
            .collect();

        let frames = try_join_all(frame_futures).await.unwrap(); // TODO: handle error

        for (item, frame) in content_items.iter_mut().zip(frames.into_iter()) {
            if let ContentItem::OCR(ref mut ocr_content) = item {
                ocr_content.frame = Some(frame);
            }
        }
    }

    info!("search completed: found {} results", total);
    Ok(JsonResponse(SearchResponse {
        data: content_items,
        pagination: PaginationInfo {
            limit: query.pagination.limit,
            offset: query.pagination.offset,
            total: total as i64,
        },
    }))
}

#[oasgen]
pub(crate) async fn api_list_audio_devices(
    State(_state): State<Arc<AppState>>,
) -> Result<JsonResponse<Vec<ListDeviceResponse>>, (StatusCode, JsonResponse<serde_json::Value>)> {
    let default_input_device = default_input_device().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("Failed to get default input device: {}", e)})),
        )
    })?;

    let default_output_device = default_output_device().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("Failed to get default output device: {}", e)})),
        )
    })?;

    let devices = list_audio_devices().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("Failed to list audio devices: {}", e)})),
        )
    })?;

    let response: Vec<ListDeviceResponse> = devices
        .into_iter()
        .map(|device| {
            let is_default = device == default_input_device || device == default_output_device;
            ListDeviceResponse {
                name: device.to_string(),
                is_default,
            }
        })
        .collect();

    if response.is_empty() {
        Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "No audio devices found"})),
        ))
    } else {
        Ok(JsonResponse(response))
    }
}

#[oasgen]
pub async fn api_list_monitors(
) -> Result<JsonResponse<Vec<MonitorInfo>>, (StatusCode, JsonResponse<serde_json::Value>)> {
    let monitors = list_monitors().await;
    let monitor_info = futures::future::join_all(monitors.into_iter().map(|monitor| async move {
        let monitor_id = monitor.id();
        match get_monitor_by_id(monitor_id).await {
            Some(monitor) => MonitorInfo {
                id: monitor.id(),
                name: monitor.name().to_string(),
                width: monitor.width(),
                height: monitor.height(),
                is_default: monitor.is_primary(),
            },
            None => MonitorInfo {
                id: monitor_id,
                name: "Unknown".to_string(),
                width: 0,
                height: 0,
                is_default: false,
            },
        }
    }))
    .await;

    if monitor_info.is_empty() {
        Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "No monitors found"})),
        ))
    } else {
        Ok(JsonResponse(monitor_info))
    }
}

#[oasgen]
pub(crate) async fn add_tags(
    State(state): State<Arc<AppState>>,
    Path((content_type, id)): Path<(String, i64)>,
    JsonResponse(payload): JsonResponse<AddTagsRequest>,
) -> Result<Json<AddTagsResponse>, (StatusCode, JsonResponse<Value>)> {
    let content_type = match content_type.as_str() {
        "vision" => TagContentType::Vision,
        "audio" => TagContentType::Audio,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                JsonResponse(json!({"error": "Invalid content type"})),
            ))
        }
    };

    match state.db.add_tags(id, content_type, payload.tags).await {
        Ok(_) => Ok(JsonResponse(AddTagsResponse { success: true })),
        Err(e) => {
            error!("Failed to add tags: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            ))
        }
    }
}

#[oasgen]
pub(crate) async fn remove_tags(
    State(state): State<Arc<AppState>>,
    Path((content_type, id)): Path<(String, i64)>,
    JsonResponse(payload): JsonResponse<RemoveTagsRequest>,
) -> Result<Json<RemoveTagsResponse>, (StatusCode, JsonResponse<Value>)> {
    let content_type = match content_type.as_str() {
        "vision" => TagContentType::Vision,
        "audio" => TagContentType::Audio,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                JsonResponse(json!({"error": "Invalid content type"})),
            ))
        }
    };

    match state.db.remove_tags(id, content_type, payload.tags).await {
        Ok(_) => Ok(JsonResponse(RemoveTagsResponse { success: true })),
        Err(e) => {
            error!("Failed to remove tag: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            ))
        }
    }
}

#[oasgen]
pub async fn health_check(State(state): State<Arc<AppState>>) -> JsonResponse<HealthCheckResponse> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let app_uptime = (now as i64) - (state.app_start_time.timestamp());
    let grace_period = 120; // 2 minutes in seconds

    let last_capture = screenpipe_audio::core::LAST_AUDIO_CAPTURE.load(Ordering::Relaxed);
    let audio_active = if app_uptime < grace_period {
        true // Consider active during grace period
    } else {
        now - last_capture < 5 // Consider active if captured in last 5 seconds
    };

    let (last_frame, audio, last_ui) = match state.db.get_latest_timestamps().await {
        Ok((frame, audio, ui)) => (frame, audio, ui),
        Err(e) => {
            error!("failed to get latest timestamps: {}", e);
            (None, None, None)
        }
    };

    let now = Utc::now();
    let threshold = Duration::from_secs(3600); // 1 hour

    let frame_status = if state.vision_disabled {
        "disabled"
    } else {
        match last_frame {
            Some(timestamp)
                if now.signed_duration_since(timestamp)
                    < chrono::Duration::from_std(threshold).unwrap() =>
            {
                "ok"
            }
            Some(_) => "stale",
            None => "no data",
        }
    };

    let audio_status = if state.audio_disabled {
        "disabled"
    } else if audio_active {
        "ok"
    } else {
        "stale"
    };

    let ui_status = if !state.ui_monitoring_enabled {
        "disabled"
    } else {
        match last_ui {
            Some(timestamp)
                if now.signed_duration_since(timestamp)
                    < chrono::Duration::from_std(threshold).unwrap() =>
            {
                "ok"
            }
            Some(_) => "stale",
            None => "no data",
        }
    };

    let (overall_status, message, verbose_instructions, status_code) = if (frame_status == "ok"
        || frame_status == "disabled")
        && (audio_status == "ok" || audio_status == "disabled")
        && (ui_status == "ok" || ui_status == "disabled")
    {
        (
            "healthy",
            "all systems are functioning normally.".to_string(),
            None,
            200,
        )
    } else {
        let mut unhealthy_systems = Vec::new();
        if frame_status != "ok" && frame_status != "disabled" {
            unhealthy_systems.push("vision");
        }
        if audio_status != "ok" && audio_status != "disabled" {
            unhealthy_systems.push("audio");
        }
        if ui_status != "ok" && ui_status != "disabled" {
            unhealthy_systems.push("ui monitoring");
        }

        (
            "unhealthy",
            format!("some systems are not functioning properly: {}. frame status: {}, audio status: {}, ui status: {}",
                    unhealthy_systems.join(", "), frame_status, audio_status, ui_status),
            Some("if you're experiencing issues, please try contacting us on discord".to_string()),
            500,
        )
    };

    JsonResponse(HealthCheckResponse {
        status: overall_status.to_string(),
        status_code,
        last_frame_timestamp: last_frame,
        last_audio_timestamp: audio,
        last_ui_timestamp: last_ui,
        frame_status: frame_status.to_string(),
        audio_status: audio_status.to_string(),
        ui_status: ui_status.to_string(),
        message,
        verbose_instructions,
    })
}
// Request and response structs
#[derive(OaSchema, Deserialize)]
struct DownloadPipeRequest {
    url: String,
}

#[derive(OaSchema, Deserialize)]
struct DownloadPipePrivateRequest {
    url: String,
    pipe_name: String,
    pipe_id: String,
}

#[derive(OaSchema, Deserialize)]
struct RunPipeRequest {
    pipe_id: String,
}

#[derive(OaSchema, Deserialize)]
struct UpdatePipeConfigRequest {
    pipe_id: String,
    config: serde_json::Value,
}

#[derive(OaSchema, Deserialize)]
struct UpdatePipeVersionRequest {
    pipe_id: String,
    source: String,
}

#[oasgen]
async fn download_pipe_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<DownloadPipeRequest>,
) -> Result<JsonResponse<serde_json::Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("Downloading pipe: {}", payload.url);
    match state.pipe_manager.download_pipe(&payload.url).await {
        Ok(pipe_dir) => Ok(JsonResponse(json!({
            "data": {
                "pipe_id": pipe_dir,
                "message": "pipe downloaded successfully"
            },
            "success": true
        }))),
        Err(e) => {
            error!("Failed to download pipe: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({
                    "error": format!("failed to download pipe: {}", e),
                    "success": false
                })),
            ))
        }
    }
}

#[oasgen]
async fn download_pipe_private_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<DownloadPipePrivateRequest>,
) -> Result<JsonResponse<serde_json::Value>, (StatusCode, JsonResponse<Value>)> {
    match state
        .pipe_manager
        .download_pipe_private(&payload.url, &payload.pipe_name, &payload.pipe_id)
        .await
    {
        Ok(pipe_dir) => Ok(JsonResponse(json!({
            "data": {
                "pipe_id": pipe_dir,
                "message": "pipe downloaded successfully"
            },
            "success": true
        }))),
        Err(e) => {
            error!("Failed to download pipe: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({
                    "error": format!("failed to download pipe: {}", e),
                    "success": false
                })),
            ))
        }
    }
}

#[oasgen]
async fn run_pipe_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<RunPipeRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("starting pipe: {}", payload.pipe_id);

    match state
        .pipe_manager
        .update_config(
            &payload.pipe_id,
            serde_json::json!({
                "enabled": true,
            }),
        )
        .await
    {
        Ok(_) => Ok(JsonResponse(json!({
            "data": {
                "pipe_id": payload.pipe_id,
                "message": "pipe started"
            },
            "success": true
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({
                "error": format!("failed to start pipe: {}", e),
                "success": false
            })),
        )),
    }
}

#[oasgen]
async fn stop_pipe_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<RunPipeRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("Stopping pipe: {}", payload.pipe_id);
    match state
        .pipe_manager
        .update_config(
            &payload.pipe_id,
            serde_json::json!({
                "enabled": false,
            }),
        )
        .await
    {
        Ok(_) => Ok(JsonResponse(json!({
            "data": {
                "pipe_id": payload.pipe_id,
                "message": "pipe stopped"
            },
            "success": true
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({
                "error": format!("failed to stop pipe: {}", e),
                "success": false
            })),
        )),
    }
}

#[oasgen]
async fn update_pipe_config_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<UpdatePipeConfigRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("Updating pipe config for: {}", payload.pipe_id);
    match state
        .pipe_manager
        .update_config(&payload.pipe_id, payload.config)
        .await
    {
        Ok(_) => Ok(JsonResponse(json!({
            "data": {
                "pipe_id": payload.pipe_id,
                "message": "pipe config updated"
            },
            "success": true
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({
                "error": format!("failed to update pipe config: {}", e),
                "success": false
            })),
        )),
    }
}

#[oasgen]
async fn update_pipe_version_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<UpdatePipeVersionRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("Updating pipe version for: {}", payload.pipe_id);
    match state
        .pipe_manager
        .update_pipe_version(&payload.pipe_id, &payload.source)
        .await
    {
        Ok(_) => Ok(JsonResponse(json!({
            "data": {
                "pipe_id": payload.pipe_id,
                "message": "pipe version updated"
            },
            "success": true
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({
                "error": format!("failed to update pipe version: {}", e),
                "success": false
            })),
        )),
    }
}

#[oasgen]
async fn get_pipe_info_handler(
    State(state): State<Arc<AppState>>,
    Path(pipe_id): Path<String>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("Getting pipe info for: {}", pipe_id);
    match state.pipe_manager.get_pipe_info(&pipe_id).await {
        Some(info) => Ok(JsonResponse(json!({
            "data": info,
            "success": true
        }))),
        None => Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({
                "error": "pipe not found",
                "success": false
            })),
        )),
    }
}

#[oasgen]
async fn list_pipes_handler(State(state): State<Arc<AppState>>) -> JsonResponse<Value> {
    let pipes = state.pipe_manager.list_pipes().await;
    JsonResponse(json!({
        "data": pipes,
        "success": true
    }))
}

pub struct SCServer {
    db: Arc<DatabaseManager>,
    addr: SocketAddr,
    audio_manager: Arc<AudioManager>,
    screenpipe_dir: PathBuf,
    pipe_manager: Arc<PipeManager>,
    vision_disabled: bool,
    audio_disabled: bool,
    ui_monitoring_enabled: bool,
}

impl SCServer {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        db: Arc<DatabaseManager>,
        addr: SocketAddr,
        screenpipe_dir: PathBuf,
        pipe_manager: Arc<PipeManager>,
        vision_disabled: bool,
        audio_disabled: bool,
        ui_monitoring_enabled: bool,
        audio_manager: Arc<AudioManager>,
    ) -> Self {
        SCServer {
            db,
            addr,
            screenpipe_dir,
            pipe_manager,
            vision_disabled,
            audio_disabled,
            ui_monitoring_enabled,
            audio_manager,
        }
    }

    pub async fn start(self, enable_frame_cache: bool) -> Result<(), std::io::Error> {
        // Create the OpenAPI server
        let app = self.create_router(enable_frame_cache).await;

        #[cfg(feature = "experimental")]
        let app = app.route("/experimental/input_control", post(input_control_handler));

        // Create the listener
        let listener = TcpListener::bind(&self.addr).await?;
        info!("Server listening on {}", self.addr);

        // Start serving
        serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        Ok(())
    }

    pub async fn create_router(&self, enable_frame_cache: bool) -> Router {
        let app_state = Arc::new(AppState {
            db: self.db.clone(),
            audio_manager: self.audio_manager.clone(),
            app_start_time: Utc::now(),
            screenpipe_dir: self.screenpipe_dir.clone(),
            pipe_manager: self.pipe_manager.clone(),
            vision_disabled: self.vision_disabled,
            audio_disabled: self.audio_disabled,
            ui_monitoring_enabled: self.ui_monitoring_enabled,
            frame_cache: if enable_frame_cache {
                Some(Arc::new(
                    FrameCache::new(self.screenpipe_dir.clone().join("data"), self.db.clone())
                        .await
                        .unwrap(),
                ))
            } else {
                None
            },
            frame_image_cache: if enable_frame_cache {
                Some(Arc::new(Mutex::new(LruCache::new(
                    NonZeroUsize::new(100).unwrap(),
                ))))
            } else {
                None
            },
        });

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
            .expose_headers([
                axum::http::header::CONTENT_TYPE,
                axum::http::header::CACHE_CONTROL,
            ]);
        let server = Server::axum()
            .get("/search", search)
            .get("/audio/list", api_list_audio_devices)
            .get("/vision/list", api_list_monitors)
            .post("/tags/:content_type/:id", add_tags)
            .delete("/tags/:content_type/:id", remove_tags)
            .get("/pipes/info/:pipe_id", get_pipe_info_handler)
            .get("/pipes/list", list_pipes_handler)
            .post("/pipes/download", download_pipe_handler)
            .post("/pipes/download-private", download_pipe_private_handler)
            .post("/pipes/enable", run_pipe_handler)
            .post("/pipes/disable", stop_pipe_handler)
            .post("/pipes/update", update_pipe_config_handler)
            .post("/pipes/update-version", update_pipe_version_handler)
            .post("/pipes/delete", delete_pipe_handler)
            .post("/pipes/purge", purge_pipe_handler)
            .get("/frames/:frame_id", get_frame_data)
            .get("/health", health_check)
            .post("/raw_sql", execute_raw_sql)
            .post("/add", add_to_database)
            .get("/speakers/unnamed", get_unnamed_speakers_handler)
            .post("/speakers/update", update_speaker_handler)
            .get("/speakers/search", search_speakers_handler)
            .post("/speakers/delete", delete_speaker_handler)
            .post("/speakers/hallucination", mark_as_hallucination_handler)
            .post("/speakers/merge", merge_speakers_handler)
            .get("/speakers/similar", get_similar_speakers_handler)
            .post("/experimental/frames/merge", merge_frames_handler)
            .get("/experimental/validate/media", validate_media_handler)
            .post("/audio/start", start_audio)
            .post("/audio/stop", stop_audio)
            .get("/semantic-search", semantic_search_handler)
            .get("/pipes/build-status/:pipe_id", get_pipe_build_status)
            .get("/search/keyword", keyword_search_handler)
            .post("/v1/embeddings", create_embeddings)
            .post("/audio/device/start", start_audio_device)
            .post("/audio/device/stop", stop_audio_device)
            // .post("/vision/start", start_vision_device)
            // .post("/vision/stop", stop_vision_device)
            // .post("/audio/restart", restart_audio_devices)
            // .post("/vision/restart", restart_vision_devices)
            .route_yaml_spec("/openapi.yaml")
            .route_json_spec("/openapi.json")
            .freeze();

        // Build the main router with all routes
        Router::new()
            .merge(server.into_router())
            // NOTE: websockerts and sse is not supported by openapi so we move it down here
            .route("/stream/frames", get(stream_frames_handler))
            .route("/ws/events", get(ws_events_handler))
            .route("/ws/health", get(ws_health_handler))
            .route("/frames/export", get(handle_video_export_ws))
            .with_state(app_state)
            .layer(cors)
            .layer(TraceLayer::new_for_http().make_span_with(DefaultMakeSpan::default()))
    }
}

#[oasgen]
async fn merge_frames_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<MergeVideosRequest>,
) -> Result<JsonResponse<MergeVideosResponse>, (StatusCode, JsonResponse<Value>)> {
    let output_dir = state.screenpipe_dir.join("videos");

    match merge_videos(payload, output_dir).await {
        Ok(response) => Ok(JsonResponse(response)),
        Err(e) => {
            error!("Failed to merge frames: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            ))
        }
    }
}

#[oasgen]
async fn validate_media_handler(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<ValidateMediaParams>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match validate_media(&params.file_path).await {
        Ok(_) => Ok(Json(json!({"status": "valid media file"}))),
        Err(e) => Err((
            StatusCode::EXPECTATION_FAILED,
            Json(json!({"status": e.to_string()})),
        )),
    }
}

#[derive(OaSchema, Deserialize)]
struct RawSqlQuery {
    query: String,
}

#[oasgen]
async fn execute_raw_sql(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<RawSqlQuery>,
) -> Result<JsonResponse<serde_json::Value>, (StatusCode, JsonResponse<serde_json::Value>)> {
    match state.db.execute_raw_sql(&payload.query).await {
        Ok(result) => Ok(JsonResponse(result)),
        Err(e) => {
            error!("Failed to execute raw SQL query: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            ))
        }
    }
}

#[derive(OaSchema, Deserialize)]
pub struct AddContentRequest {
    pub device_name: String,     // Moved device_name to the top level
    pub content: AddContentData, // The actual content (either Frame or Transcription)
}

#[derive(OaSchema, Deserialize)]
pub struct AddContentData {
    pub content_type: String,
    pub data: ContentData,
}

#[derive(OaSchema, Deserialize)]
#[serde(untagged)]
pub enum ContentData {
    Frames(Vec<FrameContent>),
    Transcription(AudioTranscription),
}

#[derive(OaSchema, Deserialize)]
pub struct FrameContent {
    pub file_path: String,
    pub timestamp: Option<DateTime<Utc>>,
    pub app_name: Option<String>,
    pub window_name: Option<String>,
    pub ocr_results: Option<Vec<OCRResult>>,
    pub tags: Option<Vec<String>>,
}

#[derive(Serialize, OaSchema, Deserialize, Debug)]
pub struct OCRResult {
    pub text: String,
    pub text_json: Option<String>,
    pub ocr_engine: Option<String>,
    pub focused: Option<bool>,
}

#[derive(OaSchema, Deserialize)]
pub struct AudioTranscription {
    pub transcription: String,
    pub transcription_engine: String,
}

#[derive(OaSchema, Serialize)]
pub struct AddContentResponse {
    pub success: bool,
    pub message: Option<String>,
}

async fn add_frame_to_db(
    state: &AppState,
    frame: &FrameContent,
    device_name: &str,
) -> Result<(), anyhow::Error> {
    let db = &state.db;

    let frame_id = db
        .insert_frame(
            device_name,
            Some(frame.timestamp.unwrap_or_else(Utc::now)),
            None,
            frame.app_name.as_deref(),
            frame.window_name.as_deref(),
            false,
        )
        .await?;

    if let Some(ocr_results) = &frame.ocr_results {
        for ocr in ocr_results {
            db.insert_ocr_text(
                frame_id,
                &ocr.text,
                ocr.text_json.as_deref().unwrap_or(""),
                Arc::new(OcrEngine::default().into()), // Ideally could pass any str as ocr_engine since can be run outside of screenpipe
            )
            .await?;
        }
    }

    if let Some(tags) = &frame.tags {
        db.add_tags(frame_id, TagContentType::Vision, tags.clone())
            .await?;
    }

    Ok(())
}

fn encode_frame_from_file_path(file_path: &str) -> Result<Vec<u8>, anyhow::Error> {
    let image = image::open(file_path)?;
    let mut buffer = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut buffer), ImageFormat::Png)?;
    Ok(buffer)
}

async fn write_frames_to_video(
    frames: &Vec<FrameContent>,
    video_file_path: &str,
    fps: f64,
) -> Result<(), anyhow::Error> {
    let mut ffmpeg_child = start_ffmpeg_process(video_file_path, fps).await?;
    let mut ffmpeg_stdin = ffmpeg_child
        .stdin
        .take()
        .expect("Failed to open stdin for FFmpeg");

    for frame in frames {
        let encoded_frame = encode_frame_from_file_path(&frame.file_path)?;
        if let Err(e) = write_frame_to_ffmpeg(&mut ffmpeg_stdin, &encoded_frame).await {
            error!("Failed to write frame to FFmpeg: {}", e);
            return Err(e);
        }
    }

    finish_ffmpeg_process(ffmpeg_child, Some(ffmpeg_stdin)).await;
    Ok(())
}

async fn add_transcription_to_db(
    state: &AppState,
    transcription: &AudioTranscription,
    device_name: &str,
) -> Result<(), anyhow::Error> {
    let db = &state.db;

    let dummy_audio_chunk_id = db.insert_audio_chunk("").await?;

    db.insert_audio_transcription(
        dummy_audio_chunk_id, // No associated audio chunk
        &transcription.transcription,
        -1,
        &transcription.transcription_engine,
        &screenpipe_db::AudioDevice {
            name: device_name.to_string(),
            device_type: DeviceType::Input.into(),
        },
        None,
        None,
        None,
    )
    .await?;

    Ok(())
}

#[oasgen]
pub(crate) async fn add_to_database(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddContentRequest>,
) -> Result<Json<AddContentResponse>, (StatusCode, Json<serde_json::Value>)> {
    let device_name = payload.device_name.clone();
    let mut success_messages = Vec::new();

    match payload.content.content_type.as_str() {
        "frames" => {
            if let ContentData::Frames(frames) = &payload.content.data {
                if !frames.is_empty() {
                    let output_dir = state.screenpipe_dir.join("data");
                    let time = Utc::now();
                    let formatted_time = time.format("%Y-%m-%d_%H-%M-%S").to_string();
                    let video_file_path = output_dir
                        .join(format!("{}_{}.mp4", device_name, formatted_time))
                        .to_str()
                        .expect("Failed to create valid path")
                        .to_string();

                    if let Err(e) = state
                        .db
                        .insert_video_chunk(&video_file_path, &device_name)
                        .await
                    {
                        error!(
                            "Failed to insert video chunk for device {}: {}",
                            device_name, e
                        );
                        return Err((
                            StatusCode::INTERNAL_SERVER_ERROR,
                            JsonResponse(
                                json!({"error": format!("Failed to insert video chunk: {}", e)}),
                            ),
                        ));
                    }

                    if let Err(e) = write_frames_to_video(frames, &video_file_path, MAX_FPS).await {
                        error!(
                            "Failed to write frames to video file {}: {}",
                            video_file_path, e
                        );
                        return Err((
                            StatusCode::INTERNAL_SERVER_ERROR,
                            JsonResponse(
                                json!({"error": format!("Failed to write frames to video: {}", e)}),
                            ),
                        ));
                    }

                    for frame in frames {
                        if let Err(e) = add_frame_to_db(&state, frame, &device_name).await {
                            error!(
                                "Failed to add frame content for device {}: {}",
                                device_name, e
                            );
                        }
                    }

                    success_messages.push("Frames added successfully".to_string());
                }
            }
        }
        "transcription" => {
            if let ContentData::Transcription(transcription) = &payload.content.data {
                if let Err(e) = add_transcription_to_db(&state, transcription, &device_name).await {
                    error!(
                        "Failed to add transcription for device {}: {}",
                        device_name, e
                    );
                    return Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        JsonResponse(
                            json!({"error": format!("Failed to add transcription: {}", e)}),
                        ),
                    ));
                }

                success_messages.push("Transcription added successfully".to_string());
            }
        }
        _ => {
            error!("Unknown content type: {}", payload.content.content_type);
            return Err((
                StatusCode::BAD_REQUEST,
                JsonResponse(json!({"error": "Unsupported content type"})),
            ));
        }
    }

    Ok(JsonResponse(AddContentResponse {
        success: true,
        message: Some(success_messages.join(", ")),
    }))
}

#[cfg(feature = "experimental")]
async fn input_control_handler(
    JsonResponse(payload): JsonResponse<InputControlRequest>,
) -> Result<JsonResponse<InputControlResponse>, (StatusCode, JsonResponse<Value>)> {
    use enigo::{Keyboard, Mouse};

    info!("input control handler {:?}", payload);
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("failed to initialize enigo: {}", e)})),
        )
    })?;

    match payload.action {
        InputAction::KeyPress(key) => {
            let _ = enigo.key(key_from_string(&key).unwrap(), enigo::Direction::Press);
        }
        InputAction::MouseMove { x, y } => {
            let _ = enigo.move_mouse(x, y, enigo::Coordinate::Abs);
        }
        InputAction::MouseClick(button) => {
            let _ = enigo.button(
                mouse_button_from_string(&button).unwrap(),
                enigo::Direction::Press,
            );
        }
        InputAction::WriteText(text) => {
            let _ = enigo.text(&text);
        }
    }

    Ok(JsonResponse(InputControlResponse { success: true }))
}

#[cfg(feature = "experimental")]
fn key_from_string(key: &str) -> Result<Key, (StatusCode, JsonResponse<Value>)> {
    match key {
        "enter" => Ok(Key::Return),
        "space" => Ok(Key::Space),
        // Add more key mappings as needed
        _ => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({"error": format!("Unsupported key: {}", key)})),
        )),
    }
}

#[cfg(feature = "experimental")]
fn mouse_button_from_string(
    button: &str,
) -> Result<enigo::Button, (StatusCode, JsonResponse<Value>)> {
    match button {
        "left" => Ok(enigo::Button::Left),
        "right" => Ok(enigo::Button::Right),
        // Add more button mappings as needed
        _ => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({"error": format!("Unsupported mouse button: {}", button)})),
        )),
    }
}

// Add these new structs:
#[cfg(feature = "experimental")]
#[derive(Deserialize, Debug)]
struct InputControlRequest {
    action: InputAction,
}

#[cfg(feature = "experimental")]
#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "data")]
enum InputAction {
    KeyPress(String),
    MouseMove { x: i32, y: i32 },
    MouseClick(String),
    WriteText(String),
}

#[cfg(feature = "experimental")]
#[derive(Serialize)]
struct InputControlResponse {
    success: bool,
}

// Add this new struct
#[derive(Deserialize)]
pub struct StreamFramesRequest {
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    #[serde(rename = "order")]
    #[serde(default = "Order::default")]
    order: Order,
}

#[derive(Debug, Serialize)]
pub struct StreamTimeSeriesResponse {
    pub timestamp: DateTime<Utc>,
    pub devices: Vec<DeviceFrameResponse>,
}

#[derive(Debug, Serialize)]
pub struct DeviceFrameResponse {
    pub device_id: String,
    // pub frame: String, // base64 encoded image
    pub frame_id: i64,
    pub metadata: DeviceMetadata,
    pub audio: Vec<AudioData>,
}

#[derive(Debug, Serialize)]
pub struct DeviceMetadata {
    pub file_path: String,
    pub app_name: String,
    pub window_name: String,
    pub ocr_text: String,
}

#[derive(Debug, Serialize)]
pub struct AudioData {
    pub device_name: String,
    pub is_input: bool,
    pub transcription: String,
    pub audio_file_path: String,
    pub duration_secs: f64,
    pub start_offset: f64, // offset from frame timestamp
}

impl From<TimeSeriesFrame> for StreamTimeSeriesResponse {
    fn from(frame: TimeSeriesFrame) -> Self {
        StreamTimeSeriesResponse {
            timestamp: frame.timestamp,
            devices: frame
                .frame_data
                .into_iter()
                .map(|device_frame| {
                    DeviceFrameResponse {
                        device_id: device_frame.device_id,
                        // frame: BASE64_STANDARD.encode(&device_frame.image_data),
                        frame_id: device_frame.frame_id,
                        metadata: DeviceMetadata {
                            file_path: device_frame.metadata.file_path,
                            app_name: device_frame.metadata.app_name,
                            window_name: device_frame.metadata.window_name,
                            ocr_text: device_frame.metadata.ocr_text,
                        },
                        audio: device_frame
                            .audio_entries
                            .into_iter()
                            .map(|audio| {
                                AudioData {
                                    device_name: audio.device_name,
                                    is_input: audio.is_input,
                                    transcription: audio.transcription,
                                    audio_file_path: audio.audio_file_path,
                                    duration_secs: audio.duration_secs,
                                    start_offset: 0.0, // calculate based on audio timestamp vs frame timestamp
                                }
                            })
                            .collect(),
                    }
                })
                .collect(),
        }
    }
}

#[derive(OaSchema, Deserialize, Debug)]
pub struct GetUnnamedSpeakersRequest {
    limit: u32,
    offset: u32,
    // comma separated list of speaker ids to include
    #[serde(
        deserialize_with = "from_comma_separated_array",
        default = "default_speaker_ids"
    )]
    speaker_ids: Option<Vec<i64>>,
}

fn default_speaker_ids() -> Option<Vec<i64>> {
    None
}

#[derive(OaSchema, Deserialize, Debug)]
pub struct GetSimilarSpeakersRequest {
    speaker_id: i64,
    limit: u32,
}

fn from_comma_separated_array<'de, D>(deserializer: D) -> Result<Option<Vec<i64>>, D::Error>
where
    D: Deserializer<'de>,
{
    let s = Option::<String>::deserialize(deserializer).unwrap_or(None);
    let s = match s {
        None => return Ok(None),
        Some(s) => s,
    };
    s.split(',')
        .map(|i| i64::from_str(i).map_err(serde::de::Error::custom))
        .collect::<Result<Vec<_>, _>>()
        .map(Some)
}

#[oasgen]
async fn get_unnamed_speakers_handler(
    State(state): State<Arc<AppState>>,
    Query(request): Query<GetUnnamedSpeakersRequest>,
) -> Result<JsonResponse<Vec<Speaker>>, (StatusCode, JsonResponse<Value>)> {
    let speakers = state
        .db
        .get_unnamed_speakers(request.limit, request.offset, request.speaker_ids)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            )
        })?;

    // convert metadata to json
    let speakers = speakers
        .into_iter()
        .map(|speaker| {
            let mut metadata: Value = serde_json::from_str(&speaker.metadata).unwrap();
            if let Some(audio_samples) = metadata.get("audio_samples").and_then(|v| v.as_array()) {
                metadata["audio_samples"] = serde_json::to_value(audio_samples).unwrap();
            }
            Speaker {
                metadata: metadata.to_string(),
                ..speaker
            }
        })
        .collect();

    Ok(JsonResponse(speakers))
}

#[oasgen]
async fn update_speaker_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateSpeakerRequest>,
) -> Result<JsonResponse<Speaker>, (StatusCode, JsonResponse<Value>)> {
    let speaker_id = payload.id;

    if let Some(name) = payload.name {
        if let Err(e) = state.db.update_speaker_name(speaker_id, &name).await {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            ));
        }
    }

    if let Some(metadata) = payload.metadata {
        if let Err(e) = state
            .db
            .update_speaker_metadata(speaker_id, &metadata)
            .await
        {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            ));
        }
    }

    Ok(JsonResponse(
        state.db.get_speaker_by_id(speaker_id).await.unwrap(),
    ))
}

#[oasgen]
async fn search_speakers_handler(
    State(state): State<Arc<AppState>>,
    Query(request): Query<SearchSpeakersRequest>,
) -> Result<JsonResponse<Vec<Speaker>>, (StatusCode, JsonResponse<Value>)> {
    let search_prefix = request.name.unwrap_or_default();
    Ok(JsonResponse(
        state.db.search_speakers(&search_prefix).await.unwrap(),
    ))
}

#[oasgen]
async fn delete_speaker_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<DeleteSpeakerRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    // get audio_chunks for this speaker
    let audio_chunks = state
        .db
        .get_audio_chunks_for_speaker(payload.id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            )
        })?;

    state.db.delete_speaker(payload.id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": e.to_string()})),
        )
    })?;

    // delete all audio chunks from the file system
    for audio_chunk in audio_chunks {
        if audio_chunk.start_time.is_some() && audio_chunk.end_time.is_some() {
            std::fs::remove_file(audio_chunk.file_path).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    JsonResponse(json!({"error": e.to_string()})),
                )
            })?;
        }
    }

    Ok(JsonResponse(json!({"success": true})))
}

#[oasgen]
async fn mark_as_hallucination_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<MarkAsHallucinationRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    let speaker_id = payload.speaker_id;

    state
        .db
        .mark_speaker_as_hallucination(speaker_id)
        .await
        .unwrap();

    Ok(JsonResponse(json!({"success": true})))
}

#[oasgen]
async fn merge_speakers_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<MergeSpeakersRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    let speaker_to_keep_id = payload.speaker_to_keep_id;
    let speaker_to_merge_id = payload.speaker_to_merge_id;

    state
        .db
        .merge_speakers(speaker_to_keep_id, speaker_to_merge_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string(), "speaker_to_keep_id": speaker_to_keep_id, "speaker_to_merge_id": speaker_to_merge_id})),
            )
        })?;

    Ok(JsonResponse(json!({"success": true})))
}

#[oasgen]
async fn get_similar_speakers_handler(
    State(state): State<Arc<AppState>>,
    Query(request): Query<GetSimilarSpeakersRequest>,
) -> Result<JsonResponse<Vec<Speaker>>, (StatusCode, JsonResponse<Value>)> {
    let speaker_id = request.speaker_id;
    let limit = request.limit;

    let similar_speakers = state
        .db
        .get_similar_speakers(speaker_id, limit)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            )
        })?;

    Ok(JsonResponse(similar_speakers))
}
// #[derive(OaSchema, Deserialize)]
// pub struct AudioDeviceControlRequest {
//     device_name: String,
//     #[serde(default)]
//     device_type: Option<DeviceType>,
// }

#[derive(Debug, OaSchema, Serialize)]
pub struct AudioDeviceControlResponse {
    success: bool,
    message: String,
}

// Add these new handler functions before create_router()
// async fn start_audio_device(
//     State(state): State<Arc<AppState>>,
//     Json(payload): Json<AudioDeviceControlRequest>,
// ) -> Result<JsonResponse<AudioDeviceControlResponse>, (StatusCode, JsonResponse<Value>)> {
//     let device = AudioDevice {
//         name: payload.device_name.clone(),
//         device_type: payload.device_type.unwrap_or(AudioDeviceType::Input),
//     };

//     // Validate device exists
//     let available_devices = list_audio_devices().await.map_err(|e| {
//         (
//             StatusCode::INTERNAL_SERVER_ERROR,
//             JsonResponse(json!({
//                 "error": format!("failed to list audio devices: {}", e),
//                 "success": false
//             })),
//         )
//     })?;

//     if !available_devices.contains(&device) {
//         return Err((
//             StatusCode::BAD_REQUEST,
//             JsonResponse(json!({
//                 "error": format!("device not found: {}", device.name),
//                 "success": false
//             })),
//         ));
//     }

//     let control = DeviceControl {
//         device: screenpipe_core::DeviceType::Audio(device.clone()),
//         is_running: true,
//         is_paused: false,
//     };

//     let _ = state.device_manager.update_device(control).await;

//     Ok(JsonResponse(AudioDeviceControlResponse {
//         success: true,
//         message: format!("started audio device: {}", device.name),
//     }))
// }

// async fn stop_audio_device(
//     State(state): State<Arc<AppState>>,
//     Json(payload): Json<AudioDeviceControlRequest>,
// ) -> Result<JsonResponse<AudioDeviceControlResponse>, (StatusCode, JsonResponse<Value>)> {
//     let device = AudioDevice {
//         name: payload.device_name.clone(),
//         device_type: payload.device_type.unwrap_or(AudioDeviceType::Input),
//     };

//     // Validate device exists
//     let available_devices = list_audio_devices().await.map_err(|e| {
//         (
//             StatusCode::INTERNAL_SERVER_ERROR,
//             JsonResponse(json!({
//                 "error": format!("failed to list audio devices: {}", e),
//                 "success": false
//             })),
//         )
//     })?;

//     if !available_devices.contains(&device) {
//         return Err((
//             StatusCode::BAD_REQUEST,
//             JsonResponse(json!({
//                 "error": format!("device not found: {}", device.name),
//                 "success": false
//             })),
//         ));
//     }

//     let _ = state
//         .device_manager
//         .update_device(DeviceControl {
//             device: screenpipe_core::DeviceType::Audio(device.clone()),
//             is_running: false,
//             is_paused: false,
//         })
//         .await;

//     Ok(JsonResponse(AudioDeviceControlResponse {
//         success: true,
//         message: format!("stopped audio device: {}", device.name),
//     }))
// }

#[derive(OaSchema, Deserialize)]
struct EventsQuery {
    images: Option<bool>,
}

#[derive(Debug, OaSchema, Deserialize)]
struct SemanticSearchQuery {
    text: String,
    limit: Option<u32>,
    threshold: Option<f32>,
}

#[oasgen]
async fn semantic_search_handler(
    Query(query): Query<SemanticSearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<JsonResponse<Vec<screenpipe_db::OCRResult>>, (StatusCode, JsonResponse<Value>)> {
    let limit = query.limit.unwrap_or(10);
    let threshold = query.threshold.unwrap_or(0.3);

    debug!(
        "semantic search for '{}' with limit {} and threshold {}",
        query.text, limit, threshold
    );

    // Generate embedding for search text
    let embedding = match generate_embedding(&query.text, 0).await {
        Ok(emb) => emb,
        Err(e) => {
            error!("failed to generate embedding: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("failed to generate embedding: {}", e)})),
            ));
        }
    };

    // Search database for similar embeddings
    match state
        .db
        .search_similar_embeddings(embedding, limit, threshold)
        .await
    {
        Ok(results) => {
            debug!("found {} similar results", results.len());
            Ok(JsonResponse(results))
        }
        Err(e) => {
            error!("failed to search embeddings: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("failed to search embeddings: {}", e)})),
            ))
        }
    }
}

#[derive(Serialize, OaSchema, Deserialize)]
pub struct VisionDeviceControlRequest {
    device_id: u32,
}

// impl VisionDeviceControlRequest {
//     pub fn new(device_id: u32) -> Self {
//         Self { device_id }
//     }
// }

#[derive(Serialize)]
pub struct VisionDeviceControlResponse {
    success: bool,
    message: String,
}

// async fn start_vision_device(
//     State(state): State<Arc<AppState>>,
//     Json(payload): Json<VisionDeviceControlRequest>,
// ) -> Result<JsonResponse<VisionDeviceControlResponse>, (StatusCode, JsonResponse<Value>)> {
//     debug!("starting vision device: {}", payload.device_id);
//     // Validate device exists
//     let monitors = list_monitors().await;
//     if !monitors.iter().any(|m| m.id() == payload.device_id) {
//         return Err((
//             StatusCode::BAD_REQUEST,
//             JsonResponse(json!({
//                 "error": format!("monitor not found: {}", payload.device_id),
//                 "success": false
//             })),
//         ));
//     }

//     debug!("starting vision device: {}", payload.device_id);
//     let _ = state
//         .device_manager
//         .update_device(DeviceControl {
//             device: screenpipe_core::DeviceType::Vision(payload.device_id),
//             is_running: true,
//             is_paused: false,
//         })
//         .await;

//     Ok(JsonResponse(VisionDeviceControlResponse {
//         success: true,
//         message: format!("started vision device: {}", payload.device_id),
//     }))
// }

// async fn stop_vision_device(
//     State(state): State<Arc<AppState>>,
//     Json(payload): Json<VisionDeviceControlRequest>,
// ) -> Result<JsonResponse<VisionDeviceControlResponse>, (StatusCode, JsonResponse<Value>)> {
//     debug!("stopping vision device: {}", payload.device_id);
//     // Validate device exists
//     let monitors = list_monitors().await;
//     if !monitors.iter().any(|m| m.id() == payload.device_id) {
//         return Err((
//             StatusCode::BAD_REQUEST,
//             JsonResponse(json!({
//                 "error": format!("monitor not found: {}", payload.device_id),
//                 "success": false
//             })),
//         ));
//     }

//     debug!("stopping vision device: {}", payload.device_id);

//     let _ = state
//         .device_manager
//         .update_device(DeviceControl {
//             device: screenpipe_core::DeviceType::Vision(payload.device_id),
//             is_running: false,
//             is_paused: false,
//         })
//         .await;

//     Ok(JsonResponse(VisionDeviceControlResponse {
//         success: true,
//         message: format!("stopped vision device: {}", payload.device_id),
//     }))
// }

// websocket events handler
async fn ws_events_handler(ws: WebSocketUpgrade, query: Query<EventsQuery>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, query))
}

async fn handle_socket(socket: WebSocket, query: Query<EventsQuery>) {
    let (mut sender, mut receiver) = socket.split();

    let incoming = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(t) = msg {
                if let Ok(event) = serde_json::from_str::<ScreenpipeEvent>(&t) {
                    let _ = send_event(&event.name, event.data);
                }
            }
        }
    });
    // Handle the WebSocket connection here
    // You can add your logic to handle messages, upgrades, etc.

    let outgoing = tokio::spawn(async move {
        let mut stream = subscribe_to_all_events();
        loop {
            tokio::select! {
                event = stream.next() => {
                    if let Some(mut event) = event {
                        if !query.images.unwrap_or(false) && (event.name == "ocr_result" || event.name == "ui_frame") {
                            if let Some(data) = event.data.as_object_mut() {
                                data.remove("image");
                            }
                        }
                        if let Err(e) = sender
                            .send(Message::Text(
                                serde_json::to_string(&event).unwrap_or_default(),
                            ))
                            .await
                        {
                            tracing::error!("Failed to send websocket message: {}", e);
                            break;
                        }
                    }
                }
                _ = tokio::time::sleep(Duration::from_secs(1)) => {
                    let _ = sender.send(Message::Ping(vec![])).await;
                }
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = incoming => {}
        _ = outgoing => {}
    }

    debug!("WebSocket connection closed");
}

async fn ws_health_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(move |socket| handle_health_socket(socket, state))
}

async fn handle_health_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));

    loop {
        tokio::select! {
        _ = interval.tick() => {
            let health_response = health_check(State(state.clone())).await;
            let health_status = serde_json::to_string(&health_response.0).unwrap_or_default();
            if let Err(e) = socket.send(Message::Text(health_status)).await {
                error!("Failed to send health status: {}", e);
                break;
            }
        }
            result = socket.recv() => {
                if result.is_none() {
                    break;
                }
            }
        }
    }

    debug!("WebSocket connection closed gracefully");
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VideoExportRequest {
    #[serde(deserialize_with = "deserialize_frame_ids")]
    frame_ids: Vec<i64>,
    fps: f64,
}

#[derive(OaSchema, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct AudioDeviceControlRequest {
    device_name: String,
}

#[oasgen]
async fn start_audio_device(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AudioDeviceControlRequest>,
) -> Result<Json<AudioDeviceControlResponse>, (StatusCode, JsonResponse<Value>)> {
    let device_name = payload.device_name.clone();
    let device: AudioDevice;
    // todo Better handling error
    match AudioDevice::from_name(&payload.device_name) {
        Ok(audio_device) => device = audio_device,
        Err(e) => {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                JsonResponse(
                    json!({"success": false, "message": format!("device {} not found: {}", device_name.clone(), e)}),
                ),
            ))
        }
    };

    if let Err(e) = state.audio_manager.start_device(&device).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({
                "success": false,
                "message": format!("Failed to start recording device {}: {}", device_name.clone(), e)
            })),
        ));
    }

    Ok(Json(AudioDeviceControlResponse {
        success: true,
        message: format!("started device: {}", device_name),
    }))
}

#[oasgen]
async fn stop_audio_device(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AudioDeviceControlRequest>,
) -> Result<Json<AudioDeviceControlResponse>, (StatusCode, JsonResponse<Value>)> {
    let device_name = payload.device_name.clone();

    if let Err(e) = state.audio_manager.stop_device(&device_name).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({
                "success": false,
                "message": format!("Failed to stop recording device {}: {}", device_name.clone(), e)
            })),
        ));
    }

    Ok(Json(AudioDeviceControlResponse {
        success: true,
        message: format!("stopped recording audio device: {}", device_name),
    }))
}

fn deserialize_frame_ids<'de, D>(deserializer: D) -> Result<Vec<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s: String = String::deserialize(deserializer)?;
    Ok(s.split(',').filter_map(|id| id.parse().ok()).collect())
}

#[derive(Debug, Serialize)]
struct ExportProgress {
    status: String,
    progress: f32,
    video_data: Option<Vec<u8>>,
    error: Option<String>,
}

#[oasgen]
async fn start_audio(
    State(state): State<Arc<AppState>>,
) -> Result<Response, (StatusCode, JsonResponse<Value>)> {
    match state.audio_manager.start().await {
        Ok(_) => Ok(Response::builder().status(200).body(Body::empty()).unwrap()),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({
                "success": false,
                "message": format!("Failed to start audio processing: {}", e),
            })),
        )),
    }
}

#[oasgen]
async fn stop_audio(
    State(state): State<Arc<AppState>>,
) -> Result<Response, (StatusCode, JsonResponse<Value>)> {
    match state.audio_manager.stop().await {
        Ok(_) => Ok(Response::builder().status(200).body(Body::empty()).unwrap()),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({
                "success": false,
                "message": format!("Failed to start audio processing: {}", e),
            })),
        )),
    }
}

pub async fn handle_video_export_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(payload): Query<VideoExportRequest>,
) -> impl IntoResponse {
    if payload.frame_ids.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "No valid frame IDs provided" })),
        )
            .into_response();
    }

    ws.on_upgrade(move |socket| async move { handle_video_export(socket, state, payload).await })
}

async fn handle_video_export(
    mut socket: WebSocket,
    state: Arc<AppState>,
    payload: VideoExportRequest,
) {
    let temp_dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(e) => {
            let _ = socket
                .send(Message::Text(
                    serde_json::to_string(&ExportProgress {
                        status: "error".to_string(),
                        progress: 0.0,
                        video_data: None,
                        error: Some(format!("Failed to create temp directory: {}", e)),
                    })
                    .unwrap(),
                ))
                .await;
            return;
        }
    };

    let frames_dir = temp_dir.path().join("frames");
    if let Err(e) = tokio::fs::create_dir_all(&frames_dir).await {
        let _ = socket
            .send(Message::Text(
                serde_json::to_string(&ExportProgress {
                    status: "error".to_string(),
                    progress: 0.0,
                    video_data: None,
                    error: Some(format!("Failed to create frames directory: {}", e)),
                })
                .unwrap(),
            ))
            .await;
        return;
    }

    let output_filename = format!(
        "screenpipe_export_{}.mp4",
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let output_path = temp_dir.path().join(&output_filename);

    let mut frames = Vec::new();
    let mut skipped_frames = Vec::new();

    // Send initial status
    let _ = socket
        .send(Message::Text(
            serde_json::to_string(&ExportProgress {
                status: "extracting".to_string(),
                progress: 0.0,
                video_data: None,
                error: None,
            })
            .unwrap(),
        ))
        .await;

    // Process frames
    for (index, frame_id) in payload.frame_ids.iter().enumerate() {
        let progress = (index as f32 / payload.frame_ids.len() as f32) * 0.5;
        let _ = socket
            .send(Message::Text(
                serde_json::to_string(&ExportProgress {
                    status: "extracting".to_string(),
                    progress,
                    video_data: None,
                    error: None,
                })
                .unwrap(),
            ))
            .await;

        match state.db.get_frame(*frame_id).await {
            Ok(Some((file_path, offset_index))) => {
                match extract_high_quality_frame(&file_path, offset_index, &frames_dir).await {
                    Ok(frame_path) => {
                        frames.push(FrameContent {
                            file_path: frame_path,
                            timestamp: Some(chrono::Utc::now()),
                            window_name: None,
                            app_name: None,
                            ocr_results: None,
                            tags: None,
                        });
                    }
                    Err(e) => {
                        error!("Failed to extract frame {}: {}", frame_id, e);
                        skipped_frames.push(*frame_id);
                    }
                }
            }
            Ok(None) => {
                error!("Frame {} not found in database", frame_id);
                skipped_frames.push(*frame_id);
            }
            Err(e) => {
                error!("Database error for frame {}: {}", frame_id, e);
                skipped_frames.push(*frame_id);
            }
        }
    }

    if frames.is_empty() {
        let _ = socket
            .send(Message::Text(
                serde_json::to_string(&ExportProgress {
                    status: "error".to_string(),
                    progress: 0.0,
                    video_data: None,
                    error: Some("No valid frames to process".to_string()),
                })
                .unwrap(),
            ))
            .await;
        return;
    }

    // Send encoding status
    let _ = socket
        .send(Message::Text(
            serde_json::to_string(&ExportProgress {
                status: "encoding".to_string(),
                progress: 0.5,
                video_data: None,
                error: None,
            })
            .unwrap(),
        ))
        .await;

    // Create video
    match write_frames_to_video(&frames, output_path.to_str().unwrap(), payload.fps).await {
        Ok(_) => match tokio::fs::read(&output_path).await {
            Ok(video_data) => {
                let _ = socket
                    .send(Message::Text(
                        serde_json::to_string(&ExportProgress {
                            status: "completed".to_string(),
                            progress: 1.0,
                            video_data: Some(video_data),
                            error: None,
                        })
                        .unwrap(),
                    ))
                    .await;
            }
            Err(e) => {
                let _ = socket
                    .send(Message::Text(
                        serde_json::to_string(&ExportProgress {
                            status: "error".to_string(),
                            progress: 1.0,
                            video_data: None,
                            error: Some(format!("Failed to read video file: {}", e)),
                        })
                        .unwrap(),
                    ))
                    .await;
            }
        },
        Err(e) => {
            let _ = socket
                .send(Message::Text(
                    serde_json::to_string(&ExportProgress {
                        status: "error".to_string(),
                        progress: 1.0,
                        video_data: None,
                        error: Some(format!("Failed to create video: {}", e)),
                    })
                    .unwrap(),
                ))
                .await;
        }
    }

    // Cleanup
    if let Err(e) = tokio::fs::remove_dir_all(&temp_dir).await {
        error!("Failed to clean up temp directory: {}", e);
    }
}

#[oasgen]
async fn get_pipe_build_status(
    Path(pipe_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    let pipe_dir = state.screenpipe_dir.join("pipes").join(&pipe_id);
    let temp_dir = pipe_dir.with_extension("_temp");

    // First check temp directory if it exists
    if temp_dir.exists() {
        let temp_pipe_json = temp_dir.join("pipe.json");
        if temp_pipe_json.exists() {
            let pipe_json = tokio::fs::read_to_string(&temp_pipe_json)
                .await
                .map_err(|e| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        JsonResponse(
                            json!({"error": format!("Failed to read temp pipe config: {}", e)}),
                        ),
                    )
                })?;

            let pipe_config: Value = serde_json::from_str(&pipe_json).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    JsonResponse(
                        json!({"error": format!("Failed to parse temp pipe config: {}", e)}),
                    ),
                )
            })?;

            info!("{:?}", pipe_config);
            let build_status = pipe_config.get("buildStatus").unwrap_or(&Value::Null);
            return Ok(JsonResponse(json!({ "buildStatus": build_status })));
        }
    }

    // If no temp directory or no pipe.json in temp, check the main pipe directory
    let pipe_json_path = pipe_dir.join("pipe.json");
    if !pipe_json_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "Pipe not found"})),
        ));
    }

    let pipe_json = tokio::fs::read_to_string(&pipe_json_path)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("Failed to read pipe config: {}", e)})),
            )
        })?;

    let pipe_config: Value = serde_json::from_str(&pipe_json).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("Failed to parse pipe config: {}", e)})),
        )
    })?;

    let build_status = pipe_config.get("buildStatus").unwrap_or(&Value::Null);
    Ok(JsonResponse(json!({ "buildStatus": build_status })))
}

#[oasgen]
async fn keyword_search_handler(
    Query(query): Query<KeywordSearchRequest>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<SearchMatch>>, (StatusCode, JsonResponse<Value>)> {
    let matches = state
        .db
        .search_with_text_positions(
            &query.query,
            query.limit,
            query.offset,
            query.start_time,
            query.end_time,
            query.fuzzy_match,
            query.order,
            query.app_names,
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            )
        })?;

    Ok(JsonResponse(matches))
}

fn from_comma_separated_string<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    let s: Option<String> = Option::deserialize(deserializer)?;
    Ok(s.map(|s| s.split(',').map(String::from).collect()))
}

#[derive(OaSchema, Deserialize)]
pub struct KeywordSearchRequest {
    query: String,
    #[serde(default = "default_limit")]
    limit: u32,
    #[serde(default)]
    offset: u32,
    #[serde(default)]
    start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    end_time: Option<DateTime<Utc>>,
    #[serde(default)]
    fuzzy_match: bool,
    #[serde(default)]
    order: Order,
    #[serde(default)]
    #[serde(deserialize_with = "from_comma_separated_string")]
    app_names: Option<Vec<String>>,
}

#[oasgen]
pub async fn get_frame_data(
    State(state): State<Arc<AppState>>,
    Path(frame_id): Path<i64>,
) -> Result<Response<Body>, (StatusCode, JsonResponse<Value>)> {
    let start_time = Instant::now();

    match timeout(Duration::from_secs(5), async {
        // Try to get frame from cache if enabled
        if let Some(cache) = &state.frame_image_cache {
            let cache_result = cache.try_lock();
            match cache_result {
                Ok(mut cache) => {
                    if let Some((file_path, timestamp)) = cache.get(&frame_id) {
                        if timestamp.elapsed() < Duration::from_secs(300) {
                            debug!(
                                "Cache hit for frame_id: {}. Retrieved in {:?}",
                                frame_id,
                                start_time.elapsed()
                            );
                            return serve_file(file_path).await;
                        }
                        cache.pop(&frame_id);
                    }
                }
                Err(_) => {
                    debug!("Cache lock contention for frame_id: {}", frame_id);
                }
            }
        }

        // If not in cache or cache disabled, get from database
        match state.db.get_frame(frame_id).await {
            Ok(Some((file_path, offset_index))) => {
                match extract_frame_from_video(&file_path, offset_index).await {
                    Ok(frame_path) => {
                        // Store in cache if enabled and we can get the lock
                        if let Some(cache) = &state.frame_image_cache {
                            if let Ok(mut cache) = cache.try_lock() {
                                cache.put(frame_id, (frame_path.clone(), Instant::now()));
                            }
                        }

                        debug!("Frame {} extracted in {:?}", frame_id, start_time.elapsed());
                        serve_file(&frame_path).await
                    }
                    Err(e) => {
                        error!("Failed to extract frame {}: {}", frame_id, e);
                        Err((
                            StatusCode::INTERNAL_SERVER_ERROR,
                            JsonResponse(json!({
                                "error": format!("Failed to extract frame: {}", e),
                                "frame_id": frame_id,
                                "file_path": file_path
                            })),
                        ))
                    }
                }
            }
            Ok(None) => Err((
                StatusCode::NOT_FOUND,
                JsonResponse(json!({
                    "error": "Frame not found",
                    "frame_id": frame_id
                })),
            )),
            Err(e) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({
                    "error": format!("Database error: {}", e),
                    "frame_id": frame_id
                })),
            )),
        }
    })
    .await
    {
        Ok(result) => result,
        Err(_) => {
            error!("Request timeout for frame_id: {}", frame_id);
            Err((
                StatusCode::REQUEST_TIMEOUT,
                JsonResponse(json!({
                    "error": "Request timed out",
                    "frame_id": frame_id
                })),
            ))
        }
    }
}

async fn serve_file(path: &str) -> Result<Response, (StatusCode, JsonResponse<Value>)> {
    match File::open(path).await {
        Ok(file) => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            let response = Response::builder()
                .header("content-type", "image/jpeg")
                .header("cache-control", "public, max-age=604800") // Cache for 7 days
                .body(body)
                .map_err(|e| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        JsonResponse(json!({"error": format!("Failed to create response: {}", e)})),
                    )
                })?;

            Ok(response)
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("Failed to open file: {}", e)})),
        )),
    }
}

// Add these new functions before stream_frames_handler
async fn fetch_and_process_frames(
    db: Arc<DatabaseManager>,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    frame_tx: mpsc::Sender<TimeSeriesFrame>,
    is_descending: bool,
) -> Result<(), anyhow::Error> {
    let mut chunks = db.find_video_chunks(start_time, end_time).await?;

    // Sort chunks based on order
    if is_descending {
        chunks
            .frames
            .sort_by_key(|a| std::cmp::Reverse((a.timestamp, a.offset_index)));
    } else {
        chunks.frames.sort_by_key(|a| (a.timestamp, a.offset_index));
    }

    for chunk in chunks.frames {
        let frame = create_time_series_frame(chunk);
        frame_tx.send(frame).await?;
    }

    Ok(())
}

fn create_time_series_frame(chunk: FrameData) -> TimeSeriesFrame {
    TimeSeriesFrame {
        timestamp: chunk.timestamp,
        frame_data: chunk
            .ocr_entries
            .into_iter()
            .map(|device_data| DeviceFrame {
                device_id: device_data.device_name,
                frame_id: chunk.frame_id,
                image_data: vec![], // Empty since we don't need image data
                metadata: FrameMetadata {
                    file_path: device_data.video_file_path,
                    app_name: device_data.app_name,
                    window_name: device_data.window_name,
                    transcription: chunk
                        .audio_entries
                        .iter()
                        .map(|a| a.transcription.clone())
                        .collect::<Vec<_>>()
                        .join(" "),
                    ocr_text: device_data.text,
                },
                audio_entries: chunk
                    .audio_entries
                    .iter()
                    .map(|a| AudioEntry {
                        transcription: a.transcription.clone(),
                        device_name: a.device_name.clone(),
                        is_input: a.is_input,
                        audio_file_path: a.audio_file_path.clone(),
                        duration_secs: a.duration_secs,
                    })
                    .collect(),
            })
            .collect(),
        error: None,
    }
}

async fn handle_stream_frames_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let (frame_tx, mut frame_rx) = tokio::sync::mpsc::channel(100);
    let db = state.db.clone();

    // Create a buffer for batching frames
    let mut frame_buffer = Vec::with_capacity(100);
    let mut buffer_timer = tokio::time::interval(Duration::from_millis(100));

    // Handle incoming messages for time range requests
    let receive_handle = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                match serde_json::from_str::<StreamFramesRequest>(&text) {
                    Ok(request) => {
                        debug!(
                            "streaming frames from {} to {}",
                            request.start_time, request.end_time
                        );

                        let frame_tx = frame_tx.clone();
                        let db = db.clone();

                        tokio::spawn(async move {
                            if let Err(e) = fetch_and_process_frames(
                                db,
                                request.start_time,
                                request.end_time,
                                frame_tx,
                                request.order == Order::Descending,
                            )
                            .await
                            {
                                error!("frame fetching failed: {}", e);
                            }
                        });
                    }
                    Err(e) => {
                        error!("failed to parse stream request: {}", e);
                    }
                }
            }
        }
    });

    // Send frames to the client with batching
    let send_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                // Check for new frames
                frame = frame_rx.recv() => {
                    match frame {
                        Some(timeseries_frame) => {
                            if let Some(error) = timeseries_frame.error {
                                if let Err(e) = sender
                                    .send(Message::Text(format!("{{\"error\": \"{}\"}}", error)))
                                    .await
                                {
                                    error!("failed to send error message: {}", e);
                                    break;
                                }
                                continue;
                            }

                            // Add frame to buffer
                            frame_buffer.push(StreamTimeSeriesResponse::from(timeseries_frame));

                            // If buffer is full, send immediately
                            if frame_buffer.len() >= 100 {
                                if let Err(e) = send_batch(&mut sender, &mut frame_buffer).await {
                                    error!("failed to send batch: {}", e);
                                    break;
                                }
                            }
                        }
                        None => break,
                    }
                }
                // Timer for flushing partial batches
                _ = buffer_timer.tick() => {
                    if !frame_buffer.is_empty() {
                        if let Err(e) = send_batch(&mut sender, &mut frame_buffer).await {
                            error!("failed to send batch: {}", e);
                            break;
                        }
                    }
                }
            }
        }
    });

    // Wait for either handle to complete
    tokio::select! {
        _ = receive_handle => debug!("receive handle completed"),
        _ = send_handle => debug!("send handle completed"),
    }
}

// Helper function to send batched frames
async fn send_batch(
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    buffer: &mut Vec<StreamTimeSeriesResponse>,
) -> Result<(), Box<dyn std::error::Error>> {
    if buffer.is_empty() {
        return Ok(());
    }

    // Serialize the batch
    let json = serde_json::to_string(&buffer)?;
    sender.send(Message::Text(json)).await?;
    buffer.clear();
    Ok(())
}
async fn stream_frames_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_stream_frames_socket(socket, state))
}

#[oasgen]
pub async fn delete_pipe_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<DeletePipeRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    match state.pipe_manager.delete_pipe(&request.pipe_id).await {
        Ok(_) => Ok(JsonResponse(json!({
            "success": true,
            "message": "pipe deleted successfully"
        }))),
        Err(e) => {
            error!("failed to delete pipe: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({
                    "success": false,
                    "error": format!("failed to delete pipe: {}", e)
                })),
            ))
        }
    }
}

#[oasgen]
pub async fn purge_pipe_handler(
    State(state): State<Arc<AppState>>,
    Json(_request): Json<PurgePipeRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    match state.pipe_manager.purge_pipes().await {
        Ok(_) => Ok(JsonResponse(json!({
            "success": true,
            "message": "pipes purged successfully"
        }))),
        Err(e) => {
            error!("failed to purge pipes: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({
                    "success": false,
                    "error": format!("failed to purge pipes: {}", e)
                })),
            ))
        }
    }
}

// Add this struct for the request payload
#[derive(Debug, OaSchema, Deserialize)]
pub struct DeletePipeRequest {
    pipe_id: String,
}

#[derive(OaSchema, Deserialize, Debug)]
struct MergeSpeakersRequest {
    speaker_to_keep_id: i64,
    speaker_to_merge_id: i64,
}

#[derive(Serialize)]
pub struct RestartAudioDevicesResponse {
    success: bool,
    message: String,
    restarted_devices: Vec<String>,
}

#[derive(Debug, OaSchema, Deserialize)]
pub struct PurgePipeRequest {}

// async fn restart_audio_devices(
//     State(state): State<Arc<AppState>>,
// ) -> Result<JsonResponse<RestartAudioDevicesResponse>, (StatusCode, JsonResponse<Value>)> {
//     debug!("restarting active audio devices");

//     // Get currently active devices from device manager
//     let active_devices = state.device_manager.get_active_devices().await;
//     let mut restarted_devices = Vec::new();

//     for (_, control) in active_devices {
//         debug!("restarting audio device: {:?}", control.device);

//         let audio_device = match control.device {
//             DeviceType::Audio(device) => device,
//             _ => continue,
//         };
//         // Stop the device
//         let _ = state
//             .device_manager
//             .update_device(DeviceControl {
//                 device: screenpipe_core::DeviceType::Audio(audio_device.clone()),
//                 is_running: false,
//                 is_paused: false,
//             })
//             .await;

//         // Small delay to ensure clean shutdown
//         tokio::time::sleep(Duration::from_millis(1000)).await;

//         // Start the device again
//         let _ = state
//             .device_manager
//             .update_device(DeviceControl {
//                 device: screenpipe_core::DeviceType::Audio(audio_device.clone()),
//                 is_running: true,
//                 is_paused: false,
//             })
//             .await;

//         restarted_devices.push(audio_device.name.clone());
//     }

//     if restarted_devices.is_empty() {
//         Ok(JsonResponse(RestartAudioDevicesResponse {
//             success: true,
//             message: "no active audio devices to restart".to_string(),
//             restarted_devices,
//         }))
//     } else {
//         Ok(JsonResponse(RestartAudioDevicesResponse {
//             success: true,
//             message: format!("restarted {} audio devices", restarted_devices.len()),
//             restarted_devices,
//         }))
//     }
// }

#[derive(Serialize)]
pub struct RestartVisionDevicesResponse {
    success: bool,
    message: String,
    restarted_devices: Vec<u32>,
}
// async fn restart_vision_devices(
//     State(state): State<Arc<AppState>>,
// ) -> Result<JsonResponse<RestartVisionDevicesResponse>, (StatusCode, JsonResponse<Value>)> {
//     debug!("restarting active vision devices");

//     let active_devices = state.device_manager.get_active_devices().await;
//     let mut restarted_devices = Vec::new();

//     for (_, control) in active_devices {
//         let vision_device = match control.device {
//             DeviceType::Vision(device) => device,
//             _ => continue,
//         };

//         debug!("restarting vision device: {:?}", vision_device);

//         // Stop the device
//         let _ = state
//             .device_manager
//             .update_device(DeviceControl {
//                 device: screenpipe_core::DeviceType::Vision(vision_device.clone()),
//                 is_running: false,
//                 is_paused: false,
//             })
//             .await;

//         tokio::time::sleep(Duration::from_millis(1000)).await;

//         // Start the device again
//         let _ = state
//             .device_manager
//             .update_device(DeviceControl {
//                 device: screenpipe_core::DeviceType::Vision(vision_device.clone()),
//                 is_running: true,
//                 is_paused: false,
//             })
//             .await;

//         restarted_devices.push(vision_device.clone());
//     }

//     Ok(JsonResponse(RestartVisionDevicesResponse {
//         success: true,
//         message: if restarted_devices.is_empty() {
//             "no active vision devices to restart".to_string()
//         } else {
//             format!("restarted {} vision devices", restarted_devices.len())
//         },
//         restarted_devices,
//     }))
// }
