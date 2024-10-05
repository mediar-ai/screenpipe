use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json as JsonResponse,
    routing::{get, post},
    serve, Router,
};
use crossbeam::queue::SegQueue;
use futures::future::{try_join, try_join_all};
use screenpipe_vision::monitor::list_monitors;

use crate::{
    db::TagContentType,
    pipe_manager::{PipeInfo, PipeManager},
    video_utils::{merge_videos, MergeVideosRequest, MergeVideosResponse},
    ContentType, DatabaseManager, SearchResult,
};
use crate::{plugin::ApiPluginLayer, video_utils::extract_frame};
use chrono::{DateTime, Utc};
use log::{debug, error, info};
use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, AudioDevice, DeviceControl,
    DeviceType,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
    time::Duration,
};

use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tower_http::{cors::CorsLayer, trace::DefaultMakeSpan};

pub struct AppState {
    pub db: Arc<DatabaseManager>,
    pub vision_control: Arc<AtomicBool>,
    pub audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    pub devices_status: HashMap<AudioDevice, DeviceControl>,
    pub app_start_time: DateTime<Utc>,
    pub screenpipe_dir: PathBuf,
    pub pipe_manager: Arc<PipeManager>,
    pub vision_disabled: bool,
    pub audio_disabled: bool,
}

// Update the SearchQuery struct
#[derive(Deserialize)]
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
    include_frames: bool,
    #[serde(default)]
    min_length: Option<usize>,
    #[serde(default)]
    max_length: Option<usize>,
}

#[derive(Deserialize)]
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

#[derive(Serialize, Deserialize)]
pub struct PaginationInfo {
    pub limit: u32,
    pub offset: u32,
    pub total: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "content")]
pub enum ContentItem {
    OCR(OCRContent),
    Audio(AudioContent),
    FTS(FTSContent),
}

#[derive(Serialize, Deserialize, Debug)]
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
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AudioContent {
    pub chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub tags: Vec<String>,
    pub device_name: String,
    pub device_type: DeviceType,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FTSContent {
    pub text_id: i64,
    pub matched_text: String,
    pub frame_id: i64,
    pub timestamp: DateTime<Utc>,
    pub app_name: String,
    pub window_name: String,
    pub file_path: String,
    pub original_frame_text: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct ListDeviceResponse {
    name: String,
    is_default: bool,
}

#[derive(Serialize)]
pub struct MonitorInfo {
    id: u32,
    name: String,
    width: u32,
    height: u32,
    is_default: bool,
}

#[derive(Deserialize)]
pub struct AddTagsRequest {
    tags: Vec<String>,
}

#[derive(Serialize)]
pub struct AddTagsResponse {
    success: bool,
}

#[derive(Deserialize)]
pub struct RemoveTagsRequest {
    tags: Vec<String>,
}

#[derive(Serialize)]
pub struct RemoveTagsResponse {
    success: bool,
}

// Helper functions
fn default_limit() -> u32 {
    20
}

#[derive(Serialize, Deserialize)]
pub struct HealthCheckResponse {
    pub status: String,
    pub last_frame_timestamp: Option<DateTime<Utc>>,
    pub last_audio_timestamp: Option<DateTime<Utc>>,
    pub frame_status: String,
    pub audio_status: String,
    pub message: String,
    pub verbose_instructions: Option<String>,
}

// Update the search function
pub(crate) async fn search(
    Query(query): Query<SearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<
    JsonResponse<PaginatedResponse<ContentItem>>,
    (StatusCode, JsonResponse<serde_json::Value>),
> {
    info!(
        "received search request: query='{}', content_type={:?}, limit={}, offset={}, start_time={:?}, end_time={:?}, app_name={:?}, window_name={:?}, min_length={:?}, max_length={:?}",
        query.q.as_deref().unwrap_or(""),
        query.content_type,
        query.pagination.limit,
        query.pagination.offset,
        query.start_time,
        query.end_time,
        query.app_name,
        query.window_name,
        query.min_length,
        query.max_length
    );

    let query_str = query.q.as_deref().unwrap_or("");

    // If app_name or window_name is specified, force content_type to OCR
    let content_type = if query.app_name.is_some() || query.window_name.is_some() {
        ContentType::OCR
    } else {
        query.content_type
    };

    let (results, total) = try_join(
        state.db.search(
            query_str,
            content_type,
            query.pagination.limit,
            query.pagination.offset,
            query.start_time,
            query.end_time,
            query.app_name.as_deref(),
            query.window_name.as_deref(),
            query.min_length,
            query.max_length,
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
            }),
            SearchResult::Audio(audio) => ContentItem::Audio(AudioContent {
                chunk_id: audio.audio_chunk_id,
                transcription: audio.transcription.clone(),
                timestamp: audio.timestamp,
                file_path: audio.file_path.clone(),
                offset_index: audio.offset_index,
                tags: audio.tags.clone(),
                device_name: audio.device_name.clone(),
                device_type: audio.device_type.clone(),
            }),
            SearchResult::FTS(fts) => ContentItem::FTS(FTSContent {
                text_id: fts.text_id,
                matched_text: fts.matched_text.clone(),
                frame_id: fts.frame_id,
                timestamp: fts.frame_timestamp,
                app_name: fts.app_name.clone(),
                window_name: fts.window_name.clone(),
                file_path: fts.video_file_path.clone(),
                original_frame_text: fts.original_frame_text.clone(),
                tags: fts.tags.clone(),
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
    Ok(JsonResponse(PaginatedResponse {
        data: content_items,
        pagination: PaginationInfo {
            limit: query.pagination.limit,
            offset: query.pagination.offset,
            total: total as i64,
        },
    }))
}

pub(crate) async fn api_list_audio_devices(
    State(_state): State<Arc<AppState>>,
) -> Result<JsonResponse<Vec<ListDeviceResponse>>, (StatusCode, JsonResponse<serde_json::Value>)> {
    let default_input_device = default_input_device().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(json!({"error": format!("Failed to get default input device: {}", e)})),
        )
    })?;

    let default_output_device = default_output_device().await.map_err(|e| {
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

pub async fn api_list_monitors(
) -> Result<JsonResponse<Vec<MonitorInfo>>, (StatusCode, JsonResponse<serde_json::Value>)> {
    let monitors = list_monitors().await;
    let monitor_info: Vec<MonitorInfo> = monitors
        .into_iter()
        .map(|monitor| MonitorInfo {
            id: monitor.id(),
            name: monitor.name().to_string(),
            width: monitor.width(),
            height: monitor.height(),
            is_default: monitor.is_primary(),
        })
        .collect();

    if monitor_info.is_empty() {
        Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "No monitors found"})),
        ))
    } else {
        Ok(JsonResponse(monitor_info))
    }
}

pub(crate) async fn add_tags(
    State(state): State<Arc<AppState>>,
    Path((content_type, id)): Path<(String, i64)>,
    JsonResponse(payload): JsonResponse<AddTagsRequest>,
) -> Result<JsonResponse<AddTagsResponse>, (StatusCode, JsonResponse<Value>)> {
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

pub(crate) async fn remove_tags(
    State(state): State<Arc<AppState>>,
    Path((content_type, id)): Path<(String, i64)>,
    JsonResponse(payload): JsonResponse<RemoveTagsRequest>,
) -> Result<JsonResponse<RemoveTagsResponse>, (StatusCode, JsonResponse<Value>)> {
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

pub async fn health_check(State(state): State<Arc<AppState>>) -> JsonResponse<HealthCheckResponse> {
    let (last_frame, last_audio) = match state.db.get_latest_timestamps().await {
        Ok((frame, audio)) => (frame, audio),
        Err(e) => {
            error!("failed to get latest timestamps: {}", e);
            (None, None)
        }
    };
    debug!("last frame timestamp: {:?}", last_frame);
    debug!("last audio timestamp: {:?}", last_audio);

    let now = Utc::now();
    let threshold = Duration::from_secs(60);

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
    } else {
        match last_audio {
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

    let (overall_status, message, verbose_instructions) = if (frame_status == "ok"
        || frame_status == "disabled")
        && (audio_status == "ok" || audio_status == "disabled")
    {
        (
            "healthy",
            "all systems are functioning normally.".to_string(),
            None,
        )
    } else {
        let mut unhealthy_systems = Vec::new();
        if frame_status != "ok" && frame_status != "disabled" {
            unhealthy_systems.push("vision");
        }
        if audio_status != "ok" && audio_status != "disabled" {
            unhealthy_systems.push("audio");
        }

        (
            "unhealthy",
            format!("some systems are not functioning properly: {}. frame status: {}, audio status: {}", 
                    unhealthy_systems.join(", "), frame_status, audio_status),
            Some("if you're experiencing issues, please try the following steps:\n\
                  1. restart the application.\n\
                  2. if using a desktop app, reset your screenpipe os audio/screen recording permissions.\n\
                  3. if the problem persists, please contact support with the details of this health check at louis@screenpi.pe.\n\
                  4. last, here are some faq to help you troubleshoot: https://github.com/mediar-ai/screenpipe/blob/main/content/docs/notes.md".to_string())
        )
    };

    JsonResponse(HealthCheckResponse {
        status: overall_status.to_string(),
        last_frame_timestamp: last_frame,
        last_audio_timestamp: last_audio,
        frame_status: frame_status.to_string(),
        audio_status: audio_status.to_string(),
        message,
        verbose_instructions,
    })
}

// Request and response structs
#[derive(Deserialize)]
struct DownloadPipeRequest {
    url: String,
}

#[derive(Deserialize)]
struct RunPipeRequest {
    pipe_id: String,
}

#[derive(Deserialize)]
struct UpdatePipeConfigRequest {
    pipe_id: String,
    config: serde_json::Value,
}

// Handler functions
async fn download_pipe_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<DownloadPipeRequest>,
) -> Result<JsonResponse<serde_json::Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("Downloading pipe: {}", payload.url);
    match state.pipe_manager.download_pipe(&payload.url).await {
        Ok(pipe_dir) => Ok(JsonResponse(json!({
            "message": format!("Pipe {} downloaded successfully", pipe_dir),
            "pipe_id": pipe_dir
        }))),
        Err(e) => {
            error!("Failed to download pipe: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": e.to_string()})),
            ))
        }
    }
}

async fn run_pipe_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<RunPipeRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, JsonResponse<Value>)> {
    debug!("Starting pipe: {}", payload.pipe_id);

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
            "message": format!("Pipe {} started", payload.pipe_id),
            "pipe_id": payload.pipe_id
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({"error": e.to_string()})),
        )),
    }
}

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
            "message": format!("Pipe {} stopped", payload.pipe_id),
            "pipe_id": payload.pipe_id
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({"error": e.to_string()})),
        )),
    }
}

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
            "message": format!("Pipe {} config updated", payload.pipe_id),
            "pipe_id": payload.pipe_id
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            JsonResponse(json!({"error": e.to_string()})),
        )),
    }
}

async fn get_pipe_info_handler(
    State(state): State<Arc<AppState>>,
    Path(pipe_id): Path<String>,
) -> Result<JsonResponse<PipeInfo>, (StatusCode, JsonResponse<Value>)> {
    debug!("Getting pipe info for: {}", pipe_id);
    match state.pipe_manager.get_pipe_info(&pipe_id).await {
        Some(info) => Ok(JsonResponse(info)),
        None => Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "Pipe not found"})),
        )),
    }
}

async fn list_pipes_handler(State(state): State<Arc<AppState>>) -> JsonResponse<Vec<PipeInfo>> {
    debug!("Listing pipes");
    JsonResponse(state.pipe_manager.list_pipes().await)
}

pub struct Server {
    db: Arc<DatabaseManager>,
    addr: SocketAddr,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    screenpipe_dir: PathBuf,
    pipe_manager: Arc<PipeManager>,
    vision_disabled: bool,
    audio_disabled: bool,
}

impl Server {
    pub fn new(
        db: Arc<DatabaseManager>,
        addr: SocketAddr,
        vision_control: Arc<AtomicBool>,
        audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
        screenpipe_dir: PathBuf,
        pipe_manager: Arc<PipeManager>,
        vision_disabled: bool,
        audio_disabled: bool,
    ) -> Self {
        Server {
            db,
            addr,
            vision_control,
            audio_devices_control,
            screenpipe_dir,
            pipe_manager,
            vision_disabled,
            audio_disabled,
        }
    }

    pub async fn start<F>(
        self,
        device_status: HashMap<AudioDevice, DeviceControl>,
        api_plugin: F,
    ) -> Result<(), std::io::Error>
    where
        F: Fn(&axum::http::Request<axum::body::Body>) + Clone + Send + Sync + 'static,
    {
        let app_state = Arc::new(AppState {
            db: self.db,
            vision_control: self.vision_control,
            audio_devices_control: self.audio_devices_control,
            devices_status: device_status,
            app_start_time: Utc::now(),
            screenpipe_dir: self.screenpipe_dir.clone(),
            pipe_manager: self.pipe_manager,
            vision_disabled: self.vision_disabled,
            audio_disabled: self.audio_disabled,
        });

        let app = create_router()
            .layer(ApiPluginLayer::new(api_plugin))
            .layer(CorsLayer::permissive())
            .layer(
                TraceLayer::new_for_http()
                    .make_span_with(DefaultMakeSpan::new().include_headers(true)),
            )
            .with_state(app_state);

        info!("Server starting on {}", self.addr);

        match serve(TcpListener::bind(self.addr).await?, app.into_make_service()).await {
            Ok(_) => {
                info!("Server stopped gracefully");
                Ok(())
            }
            Err(e) => {
                error!("Server error: {}", e);
                Err(e)
            }
        }
    }
}

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

#[derive(Deserialize)]
struct RawSqlQuery {
    query: String,
}

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

pub fn create_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/search", get(search))
        .route("/audio/list", get(api_list_audio_devices))
        .route("/vision/list", post(api_list_monitors))
        .route(
            "/tags/:content_type/:id",
            post(add_tags).delete(remove_tags),
        )
        .route("/pipes/info/:pipe_id", get(get_pipe_info_handler))
        .route("/pipes/list", get(list_pipes_handler))
        .route("/pipes/download", post(download_pipe_handler))
        .route("/pipes/enable", post(run_pipe_handler))
        .route("/pipes/disable", post(stop_pipe_handler))
        .route("/pipes/update", post(update_pipe_config_handler))
        .route("/experimental/frames/merge", post(merge_frames_handler))
        .route("/health", get(health_check))
        .route("/raw_sql", post(execute_raw_sql))
}

/*

Curl commands for reference:
# 1. Basic search query
curl "http://localhost:3030/search?q=test&limit=5&offset=0" | jq

# 2. Search with content type filter (OCR)
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=ocr" | jq

# 3. Search with content type filter (Audio)
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=audio" | jq

# 4. Search with pagination
curl "http://localhost:3030/search?q=test&limit=10&offset=20" | jq

# 6. Search with no query (should return all results)
curl "http://localhost:3030/search?limit=5&offset=0"

// list devices
// # curl "http://localhost:3030/audio/list" | jq


echo "Listing audio devices:"
curl "http://localhost:3030/audio/list" | jq


echo "Searching for content:"
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=all" | jq
curl "http://localhost:3030/search?limit=5&offset=0&content_type=ocr" | jq

curl "http://localhost:3030/search?q=libmp3&limit=5&offset=0&content_type=all" | jq

# last 5 w frames
curl "http://localhost:3030/search?limit=5&offset=0&content_type=all&include_frames=true&start_time=$(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ)" | jq

# 30 min to 25 min ago
curl "http://localhost:3030/search?limit=5&offset=0&content_type=all&include_frames=true&start_time=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-25M +%Y-%m-%dT%H:%M:%SZ)" | jq


curl "http://localhost:3030/search?limit=1&offset=0&content_type=all&include_frames=true&start_time=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-25M +%Y-%m-%dT%H:%M:%SZ)" | jq

curl "http://localhost:3030/search?limit=1&offset=0&content_type=all&include_frames=true&start_time=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-25M +%Y-%m-%dT%H:%M:%SZ)" | jq -r '.data[0].content.frame' | base64 --decode > /tmp/frame.png && open /tmp/frame.png

# Search for content from the last 30 minutes
curl "http://localhost:3030/search?limit=5&offset=0&content_type=all&start_time=$(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for content up to 1 hour ago
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=all&end_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for content between 2 hours ago and 1 hour ago
curl "http://localhost:3030/search?limit=5&offset=0&content_type=all&start_time=$(date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for OCR content from yesterday
curl "http://localhost:3030/search?limit=5&offset=0&content_type=ocr&start_time=$(date -u -v-1d -v0H -v0M -v0S +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-1d -v23H -v59M -v59S +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for audio content with a keyword from the beginning of the current month
curl "http://localhost:3030/search?q=libmp3&limit=5&offset=0&content_type=audio&start_time=$(date -u -v1d -v0H -v0M -v0S +%Y-%m-01T%H:%M:%SZ)" | jq

curl "http://localhost:3030/search?app_name=cursor"
curl "http://localhost:3030/search?content_type=audio&min_length=20"

curl 'http://localhost:3030/search?q=Matt&offset=0&limit=50&start_time=2024-08-12T04%3A00%3A00Z&end_time=2024-08-12T05%3A00%3A00Z' | jq .


curl "http://localhost:3030/search?limit=50&offset=0&content_type=all&start_time=$(date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" | jq

date -u -v-2H +%Y-%m-%dT%H:%M:%SZ
2024-08-12T06:51:54Z
date -u -v-1H +%Y-%m-%dT%H:%M:%SZ
2024-08-12T07:52:17Z

curl 'http://localhost:3030/search?limit=50&offset=0&content_type=all&start_time=2024-08-12T06:48:18Z&end_time=2024-08-12T07:48:34Z' | jq .


curl "http://localhost:3030/search?q=Matt&offset=0&limit=10&start_time=2024-08-12T04:00:00Z&end_time=2024-08-12T05:00:00Z&content_type=all" | jq .

curl "http://localhost:3030/search?q=Matt&offset=0&limit=10&start_time=2024-08-12T06:43:53Z&end_time=2024-08-12T08:43:53Z&content_type=all" | jq .

curl 'http://localhost:3030/search?offset=0&limit=10&start_time=2024-08-12T04%3A00%3A00Z&end_time=2024-08-12T05%3A00%3A00Z&content_type=all' | jq .




# First, search for Rust-related content
curl "http://localhost:3030/search?q=debug&limit=5&offset=0&content_type=ocr"

# Then, assuming you found a relevant item with id 123, tag it
curl -X POST "http://localhost:3030/tags/vision/626" \
     -H "Content-Type: application/json" \
     -d '{"tags": ["debug"]}'


# List all pipes
curl "http://localhost:3030/pipes/list" | jq

# Download a new pipe
curl -X POST "http://localhost:3030/pipes/download" \
     -H "Content-Type: application/json" \
     -d '{"url": "./examples/typescript/pipe-stream-ocr-text"}' | jq

curl -X POST "http://localhost:3030/pipes/download" \
     -H "Content-Type: application/json" \
     -d '{"url": "./examples/typescript/pipe-security-check"}' | jq


curl -X POST "http://localhost:3030/pipes/download" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-stream-ocr-text"}' | jq


# Get info for a specific pipe
curl "http://localhost:3030/pipes/info/pipe-stream-ocr-text" | jq

# Run a pipe
curl -X POST "http://localhost:3030/pipes/enable" \
     -H "Content-Type: application/json" \
     -d '{"pipe_id": "pipe-stream-ocr-text"}' | jq


     curl -X POST "http://localhost:3030/pipes/enable" \
     -H "Content-Type: application/json" \
     -d '{"pipe_id": "pipe-security-check"}' | jq

# Stop a pipe
curl -X POST "http://localhost:3030/pipes/disable" \
     -H "Content-Type: application/json" \
     -d '{"pipe_id": "pipe-stream-ocr-text"}' | jq

# Update pipe configuration
curl -X POST "http://localhost:3030/pipes/update" \
     -H "Content-Type: application/json" \
     -d '{
       "pipe_id": "pipe-stream-ocr-text",
       "config": {
         "key": "value",
         "another_key": "another_value"
       }
     }' | jq



# Basic search with min_length and max_length
curl "http://localhost:3030/search?q=test&limit=10&offset=0&min_length=5&max_length=50" | jq

# Search for OCR content with length constraints
curl "http://localhost:3030/search?q=code&content_type=ocr&limit=5&offset=0&min_length=20&max_length=100" | jq

# Search for audio content with length constraints
curl "http://localhost:3030/search?q=meeting&content_type=audio&limit=5&offset=0&min_length=50&max_length=200" | jq

# Search with time range and length constraints
curl "http://localhost:3030/search?q=project&limit=10&offset=0&min_length=10&max_length=100&start_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search with app_name and length constraints
curl "http://localhost:3030/search?app_name=cursor&limit=5&offset=0&min_length=15&max_length=150" | jq

# Search with window_name and length constraints
curl "http://localhost:3030/search?window_name=alacritty&min_length=5&max_length=50" | jq

# Search for very short content
curl "http://localhost:3030/search?q=&limit=10&offset=0&max_length=10" | jq

# Search for very long content
curl "http://localhost:3030/search?q=&limit=10&offset=0&min_length=500" | jq


curl "http://localhost:3030/search?limit=10&offset=0&min_length=500&content_type=audio" | jq


# read random data and generate a clip using the merge endpoint


# Perform the search and store the response

# First, let's search for some recent video content
SEARCH_RESPONSE1=$(curl -s "http://localhost:3030/search?q=&limit=5&offset=0&content_type=ocr&start_time=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-25M +%Y-%m-%dT%H:%M:%SZ)")
SEARCH_RESPONSE2=$(curl -s "http://localhost:3030/search?q=&limit=5&offset=0&content_type=ocr&start_time=$(date -u -v-40M +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-35M +%Y-%m-%dT%H:%M:%SZ)")
SEARCH_RESPONSE3=$(curl -s "http://localhost:3030/search?q=&limit=5&offset=0&content_type=ocr&start_time=$(date -u -v-50M +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-45M +%Y-%m-%dT%H:%M:%SZ)")

# Extract the file paths from the search results without creating JSON arrays
VIDEO_PATHS1=$(echo "$SEARCH_RESPONSE1" | jq -r '.data[].content.file_path' | sort -u)
VIDEO_PATHS2=$(echo "$SEARCH_RESPONSE2" | jq -r '.data[].content.file_path' | sort -u)
VIDEO_PATHS3=$(echo "$SEARCH_RESPONSE3" | jq -r '.data[].content.file_path' | sort -u)

# Merge the video paths and create a single JSON array
MERGED_VIDEO_PATHS=$(echo "$VIDEO_PATHS1"$'\n'"$VIDEO_PATHS2"$'\n'"$VIDEO_PATHS3" | sort -u | jq -R -s -c 'split("\n") | map(select(length > 0))')

# Create the JSON payload for merging videos
MERGE_PAYLOAD=$(jq -n \
  --argjson video_paths "$MERGED_VIDEO_PATHS" \
  '{
    video_paths: $video_paths
  }')

echo "Merge Payload: $MERGE_PAYLOAD"

# Send the merge request and store the response
MERGE_RESPONSE=$(curl -s -X POST "http://localhost:3030/experimental/frames/merge" \
  -H "Content-Type: application/json" \
  -d "$MERGE_PAYLOAD")

echo "Merge Response: $MERGE_RESPONSE"

# Extract the merged video path from the response
MERGED_VIDEO_PATH=$(echo "$MERGE_RESPONSE" | jq -r '.video_path')

echo "Merged Video Path: $MERGED_VIDEO_PATH"

*/
