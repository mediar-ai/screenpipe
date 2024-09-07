use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json as JsonResponse,
    routing::{get, post},
    serve, Router,
};
use crossbeam::queue::SegQueue;
use futures::future::try_join_all;
use screenpipe_core::{download_pipe, run_pipe};
use screenpipe_vision::monitor::list_monitors;

use crate::plugin::ApiPluginLayer;
use crate::{db::TagContentType, ContentType, DatabaseManager, SearchResult};
use chrono::{DateTime, Utc};
use log::{debug, error, info};
use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, AudioDevice, DeviceControl,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    future::Future,
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
    app_name: Option<String>, // Add this line
    #[serde(default)]
    window_name: Option<String>, // Add this line
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
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AudioContent {
    pub chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FTSContent {
    pub text_id: i64,
    pub matched_text: String,
    pub frame_id: i64,
    pub timestamp: DateTime<Utc>,
    pub app_name: String,
    pub window_name: String, // Add this field
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

pub(crate) async fn search(
    Query(query): Query<SearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<
    JsonResponse<PaginatedResponse<ContentItem>>,
    (StatusCode, JsonResponse<serde_json::Value>),
> {
    info!(
        "Received search request: query='{}', content_type={:?}, limit={}, offset={}, start_time={:?}, end_time={:?}, app_name={:?}, window_name={:?}",
        query.q.as_deref().unwrap_or(""),
        query.content_type,
        query.pagination.limit,
        query.pagination.offset,
        query.start_time,
        query.end_time,
        query.app_name,
        query.window_name // Log window_name
    );

    let query_str = query.q.as_deref().unwrap_or("");

    // If app_name is specified, force content_type to OCR
    let content_type = if query.app_name.is_some() || query.window_name.is_some() {
        ContentType::OCR
    } else {
        query.content_type
    };

    let results = match state
        .db
        .search(
            query_str,
            content_type,
            query.pagination.limit,
            query.pagination.offset,
            query.start_time,
            query.end_time,
            query.app_name.as_deref(),
            query.window_name.as_deref(),
        )
        .await
    {
        Ok(results) => results,
        Err(e) => {
            error!("Failed to search for content: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("Failed to search for content: {}", e)})),
            ));
        }
    };

    let total = state
        .db
        .count_search_results(
            query_str,
            content_type,
            query.start_time,
            query.end_time,
            query.app_name.as_deref(),
            query.window_name.as_deref(), // Add window_name parameter
        )
        .await
        .map_err(|e| {
            error!("Failed to count search results: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("Failed to count search results: {}", e)})),
            )
        })?;

    info!("Search completed: found {} results", total);
    Ok(JsonResponse(PaginatedResponse {
        data: results.into_iter().map(into_content_item).collect(),
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
) -> Result<JsonResponse<AddTagsResponse>, (StatusCode, String)> {
    let content_type = match content_type.as_str() {
        "vision" => TagContentType::Vision,
        "audio" => TagContentType::Audio,
        _ => return Err((StatusCode::BAD_REQUEST, "Invalid content type".to_string())),
    };

    match state.db.add_tags(id, content_type, payload.tags).await {
        Ok(_) => Ok(JsonResponse(AddTagsResponse { success: true })),
        Err(e) => {
            error!("Failed to add tags: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

pub(crate) async fn remove_tags(
    State(state): State<Arc<AppState>>,
    Path((content_type, id)): Path<(String, i64)>,
    JsonResponse(payload): JsonResponse<RemoveTagsRequest>,
) -> Result<JsonResponse<RemoveTagsResponse>, (StatusCode, String)> {
    let content_type = match content_type.as_str() {
        "vision" => TagContentType::Vision,
        "audio" => TagContentType::Audio,
        _ => return Err((StatusCode::BAD_REQUEST, "Invalid content type".to_string())),
    };

    match state.db.remove_tags(id, content_type, payload.tags).await {
        Ok(_) => Ok(JsonResponse(RemoveTagsResponse { success: true })),
        Err(e) => {
            error!("Failed to remove tag: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

pub async fn health_check(State(state): State<Arc<AppState>>) -> JsonResponse<HealthCheckResponse> {
    let (last_frame, last_audio) = match state.db.get_latest_timestamps().await {
        Ok((frame, audio)) => (frame, audio),
        Err(e) => {
            error!("Failed to get latest timestamps: {}", e);
            (None, None)
        }
    };
    debug!("Last frame timestamp: {:?}", last_frame);
    debug!("Last audio timestamp: {:?}", last_audio);

    let now = Utc::now();
    let threshold = Duration::from_secs(60);
    let loading_threshold = Duration::from_secs(120);

    let app_start_time = state.app_start_time;
    let time_since_start = now.signed_duration_since(app_start_time);

    if time_since_start < chrono::Duration::from_std(loading_threshold).unwrap() {
        return JsonResponse(HealthCheckResponse {
            status: "Loading".to_string(),
            last_frame_timestamp: last_frame,
            last_audio_timestamp: last_audio,
            frame_status: "Loading".to_string(),
            audio_status: "Loading".to_string(),
            message: "The application is still initializing. Please wait...".to_string(),
            verbose_instructions: None,
        });
    }

    let frame_status = match last_frame {
        Some(timestamp)
            if now.signed_duration_since(timestamp)
                < chrono::Duration::from_std(threshold).unwrap() =>
        {
            "OK"
        }
        Some(_) => "Stale",
        None => "No data",
    };

    let audio_status = match last_audio {
        Some(timestamp)
            if now.signed_duration_since(timestamp)
                < chrono::Duration::from_std(threshold).unwrap() =>
        {
            "OK"
        }
        Some(_) => "Stale",
        None => "No data",
    };

    let (overall_status, message, verbose_instructions) = if frame_status == "OK"
        && audio_status == "OK"
    {
        (
            "Healthy",
            "All systems are functioning normally.".to_string(),
            None,
        )
    } else {
        (
            "Unhealthy",
            format!("Some systems are not functioning properly. Frame status: {}, Audio status: {}", frame_status, audio_status),
            Some("If you're experiencing issues, please try the following steps:\n\
                  1. Restart the application.\n\
                  2. If using a desktop app, reset your Screenpipe OS audio/screen recording permissions.\n\
                  3. If the problem persists, please contact support with the details of this health check at louis@screenpi.pe.\n\
                  4. Last, here are some FAQ to help you troubleshoot: https://github.com/mediar-ai/screenpipe/blob/main/content/docs/NOTES.md".to_string())
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

// New structs for pipe management
#[derive(Clone, Serialize)]
pub struct PipeInfo {
    pub id: String,
    pub enabled: bool,
    pub config: serde_json::Value,
}

pub struct PipeManager {
    screenpipe_dir: PathBuf,
}

impl PipeManager {
    pub fn new(screenpipe_dir: PathBuf) -> Self {
        PipeManager { screenpipe_dir }
    }

    pub async fn start_pipe(
        &self,
        id: &str,
    ) -> Result<impl Future<Output = Result<(), anyhow::Error>>, String> {
        let pipes = self.list_pipes().await;

        if let Some(_) = pipes.iter().find(|pipe| pipe.id == id) {
            let pipe_id = id.to_string();
            let screenpipe_dir = self.screenpipe_dir.clone();

            let future = run_pipe(pipe_id.clone(), screenpipe_dir);

            self.update_config(
                id,
                serde_json::json!({
                    "enabled": true,
                }),
            )
            .await?;

            Ok(future)
        } else {
            Err("Pipe not found".to_string())
        }
    }

    async fn update_config(&self, id: &str, new_config: Value) -> Result<(), String> {
        let mut pipes = self.list_pipes().await;
        if let Some(pipe_info) = pipes.iter_mut().find(|pipe| pipe.id == id) {
            if let Value::Object(existing_config) = &mut pipe_info.config {
                if let Value::Object(updates) = new_config {
                    for (key, value) in updates {
                        existing_config.insert(key, value);
                    }
                    Ok(())
                } else {
                    Err("New configuration must be an object".to_string())
                }
            } else {
                Err("Existing configuration is not an object".to_string())
            }
        } else {
            Err("Pipe not found".to_string())
        }
    }

    async fn get_pipe_info(&self, id: &str) -> Option<PipeInfo> {
        let pipes = self.list_pipes().await;
        pipes.iter().find(|pipe| pipe.id == id).cloned()
    }

    pub async fn list_pipes(&self) -> Vec<PipeInfo> {
        let pipe_dir = self.screenpipe_dir.join("pipes");
        let mut pipe_infos = Vec::new();

        if let Ok(mut entries) = tokio::fs::read_dir(pipe_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let pipe_id = entry.file_name().to_string_lossy().into_owned();
                let config_path = entry.path().join("pipe.json");
                pipe_infos.push(async move {
                    let config = tokio::fs::read_to_string(config_path).await?;
                    let config: Value = serde_json::from_str(&config)?;
                    debug!("Pipe config: {:?}", config);
                    Ok::<_, anyhow::Error>(PipeInfo {
                        id: pipe_id,
                        enabled: config
                            .get("enabled")
                            .unwrap_or(&Value::Bool(false))
                            .as_bool()
                            .unwrap_or(false),
                        config,
                    })
                });
            }
        }

        match try_join_all(pipe_infos).await {
            Ok(infos) => infos,
            Err(e) => {
                error!("Error listing pipes: {}", e);
                Vec::new()
            }
        }
    }
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
) -> Result<JsonResponse<serde_json::Value>, (StatusCode, String)> {
    debug!("Downloading pipe: {}", payload.url);
    match download_pipe(&payload.url, state.screenpipe_dir.clone()).await {
        Ok(pipe_dir) => {
            let pipe_id = pipe_dir.file_name().unwrap().to_string_lossy().into_owned();

            Ok(JsonResponse(json!({
                "message": format!("Pipe {} downloaded successfully", pipe_id),
                "pipe_id": pipe_id
            })))
        }
        Err(e) => {
            error!("Failed to download pipe: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

async fn run_pipe_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<RunPipeRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, String)> {
    debug!("Starting pipe: {}", payload.pipe_id);
    // match state.pipe_manager.start_pipe(&payload.pipe_id).await {
    //     Ok(_) => Ok(JsonResponse(json!({
    //         "message": format!("Pipe {} started", payload.pipe_id),
    //         "pipe_id": payload.pipe_id
    //     }))),
    //     Err(e) => Err((StatusCode::BAD_REQUEST, e)),
    // }

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
        Err(e) => Err((StatusCode::BAD_REQUEST, e)),
    }
}

async fn stop_pipe_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<RunPipeRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, String)> {
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
        Err(e) => Err((StatusCode::BAD_REQUEST, e)),
    }
}

async fn update_pipe_config_handler(
    State(state): State<Arc<AppState>>,
    JsonResponse(payload): JsonResponse<UpdatePipeConfigRequest>,
) -> Result<JsonResponse<Value>, (StatusCode, String)> {
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
        Err(e) => Err((StatusCode::BAD_REQUEST, e)),
    }
}

async fn get_pipe_info_handler(
    State(state): State<Arc<AppState>>,
    Path(pipe_id): Path<String>,
) -> Result<JsonResponse<PipeInfo>, (StatusCode, String)> {
    debug!("Getting pipe info for: {}", pipe_id);
    match state.pipe_manager.get_pipe_info(&pipe_id).await {
        Some(info) => Ok(JsonResponse(info)),
        None => Err((StatusCode::NOT_FOUND, "Pipe not found".to_string())),
    }
}

async fn list_pipes_handler(State(state): State<Arc<AppState>>) -> JsonResponse<Vec<PipeInfo>> {
    debug!("Listing pipes");
    JsonResponse(state.pipe_manager.list_pipes().await)
}

// Helper functions
fn into_content_item(result: SearchResult) -> ContentItem {
    match result {
        SearchResult::OCR(ocr) => ContentItem::OCR(OCRContent {
            frame_id: ocr.frame_id,
            text: ocr.ocr_text,
            timestamp: ocr.timestamp,
            file_path: ocr.file_path,
            offset_index: ocr.offset_index,
            app_name: ocr.app_name,
            window_name: ocr.window_name,
            tags: ocr.tags,
        }),
        SearchResult::Audio(audio) => ContentItem::Audio(AudioContent {
            chunk_id: audio.audio_chunk_id,
            transcription: audio.transcription,
            timestamp: audio.timestamp,
            file_path: audio.file_path,
            offset_index: audio.offset_index,
            tags: audio.tags,
        }),
        SearchResult::FTS(fts) => ContentItem::FTS(FTSContent {
            text_id: fts.text_id,
            matched_text: fts.matched_text,
            frame_id: fts.frame_id,
            timestamp: fts.frame_timestamp,
            app_name: fts.app_name,
            window_name: fts.window_name, // Ensure this field is included
            file_path: fts.video_file_path,
            original_frame_text: fts.original_frame_text,
            tags: fts.tags,
        }),
    }
}

pub struct Server {
    db: Arc<DatabaseManager>,
    addr: SocketAddr,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    screenpipe_dir: PathBuf,
    pipe_manager: Arc<PipeManager>,
}

impl Server {
    pub fn new(
        db: Arc<DatabaseManager>,
        addr: SocketAddr,
        vision_control: Arc<AtomicBool>,
        audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
        screenpipe_dir: PathBuf,
        pipe_manager: Arc<PipeManager>,
    ) -> Self {
        Server {
            db,
            addr,
            vision_control,
            audio_devices_control,
            screenpipe_dir,
            pipe_manager,
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
        // TODO could init w audio devices
        let app_state = Arc::new(AppState {
            db: self.db,
            vision_control: self.vision_control,
            audio_devices_control: self.audio_devices_control,
            devices_status: device_status,
            app_start_time: Utc::now(),
            screenpipe_dir: self.screenpipe_dir.clone(),
            pipe_manager: self.pipe_manager,
        });

        // https://github.com/tokio-rs/console
        let app = create_router()
            .layer(ApiPluginLayer::new(api_plugin))
            .layer(CorsLayer::permissive())
            .layer(
                // https://github.com/tokio-rs/axum/blob/main/examples/tracing-aka-logging/src/main.rs
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
        .route("/pipes/enable", post(run_pipe_handler)) // TODO ?
        .route("/pipes/disable", post(stop_pipe_handler))
        .route("/pipes/update", post(update_pipe_config_handler))
        .route("/health", get(health_check))
}

// Curl commands for reference:
// # 1. Basic search query
// # curl "http://localhost:3030/search?q=test&limit=5&offset=0"

// # 2. Search with content type filter (OCR)
// # curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=ocr"

// # 3. Search with content type filter (Audio)
// # curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=audio"

// # 4. Search with pagination
// # curl "http://localhost:3030/search?q=test&limit=10&offset=20"

// # 6. Search with no query (should return all results)
// # curl "http://localhost:3030/search?limit=5&offset=0"

// # 7. Start a device
// # curl -X POST "http://localhost:3030/audio/start" -H "Content-Type: application/json" -d '{"device_id": "device1"}'

// # 8. Stop a device
// # curl -X POST "http://localhost:3030/audio/stop" -H "Content-Type: application/json" -d '{"device_id": "device1"}'

// # 9. Get device status
// # curl "http://localhost:3030/audio/status" -H "Content-Type: application/json" -d '{"device_id": "device1"}'

// list devices
// # curl "http://localhost:3030/audio/list" | jq

// start the first device in the list that has "Microphone (input)"" in the id
// 1. list
// 2. start the first device in the list that has "Microphone (input)"" in the id
// DEVICE=$(curl "http://localhost:3030/audio/list" | grep "Microphone (input)" | jq -r '.[0].id')
// curl -X POST "http://localhost:3030/audio/start" -H "Content-Type: application/json" -d '{"device_id": "$DEVICE"}' | jq
// curl -X POST "http://localhost:3030/audio/stop" -H "Content-Type: application/json" -d '{"device_id": "$DEVICE"}' | jq

// # 10. Start recording
// # curl -X POST "http://localhost:3030/vision/start"

// # 11. Stop recording
// # curl -X POST "http://localhost:3030/vision/stop"

// # 12. Get recording status
// # curl "http://localhost:3030/vision/status"

/*

echo "Listing audio devices:"
curl "http://localhost:3030/audio/list" | jq

echo "Starting vision recording:"
curl -X POST "http://localhost:3030/vision/start" | jq

echo "Stopping all audio devices:"
DEVICES=$(curl "http://localhost:3030/audio/list" | jq -r '.[].id')
echo "$DEVICES" | while IFS= read -r DEVICE; do
    echo "Stopping device: $DEVICE"
    curl -X POST "http://localhost:3030/audio/stop" -H "Content-Type: application/json" -d "{\"device_id\": \"$DEVICE\"}" | jq
done

echo "Checking statuses:"
curl "http://localhost:3030/vision/status" | jq
echo "$DEVICES" | while IFS= read -r DEVICE; do
    echo "Checking status of device: $DEVICE"
    curl -X POST "http://localhost:3030/audio/status" -H "Content-Type: application/json" -d "{\"device_id\": \"$DEVICE\"}" | jq
done

echo "Stopping vision recording:"
curl -X POST "http://localhost:3030/vision/stop" | jq

echo "Checking statuses again:"
curl "http://localhost:3030/vision/status" | jq
curl -X POST "http://localhost:3030/audio/status" -H "Content-Type: application/json" -d "{\"device_id\": \"$DEVICE\"}" | jq

echo "Stopping audio device:"
curl -X POST "http://localhost:3030/audio/stop" -H "Content-Type: application/json" -d "{\"device_id\": \"$DEVICE\"}" | jq

echo "Final status check:"
curl "http://localhost:3030/vision/status" | jq
curl -X POST "http://localhost:3030/audio/status" -H "Content-Type: application/json" -d "{\"device_id\": \"$DEVICE\"}" | jq

echo "Searching for content:"
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=all" | jq
curl "http://localhost:3030/search?limit=5&offset=0&content_type=ocr" | jq

curl "http://localhost:3030/search?q=libmp3&limit=5&offset=0&content_type=all" | jq


# Search for content from the last 30 minutes
curl "http://localhost:3030/search?limit=5&offset=0&content_type=all&start_time=$(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for content up to 1 hour ago
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=all&end_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for content between 2 hours ago and 1 hour ago
curl "http://localhost:3030/search?limit=50&offset=0&content_type=all&start_time=$(date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for OCR content from yesterday
curl "http://localhost:3030/search?limit=5&offset=0&content_type=ocr&start_time=$(date -u -v-1d -v0H -v0M -v0S +%Y-%m-%dT%H:%M:%SZ)&end_time=$(date -u -v-1d -v23H -v59M -v59S +%Y-%m-%dT%H:%M:%SZ)" | jq

# Search for audio content with a keyword from the beginning of the current month
curl "http://localhost:3030/search?q=libmp3&limit=5&offset=0&content_type=audio&start_time=$(date -u -v1d -v0H -v0M -v0S +%Y-%m-01T%H:%M:%SZ)" | jq

curl "http://localhost:3030/search?app_name=cursor"

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

# Get info for a specific pipe
curl "http://localhost:3030/pipes/info/pipe-stream-ocr-text" | jq

# Run a pipe
curl -X POST "http://localhost:3030/pipes/enable" \
     -H "Content-Type: application/json" \
     -d '{"pipe_id": "pipe-stream-ocr-text"}' | jq

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

*/
