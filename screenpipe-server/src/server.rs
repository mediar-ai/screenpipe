use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json as JsonResponse,
    routing::{get, post},
    serve, Router,
};

use chrono::{DateTime, Utc};
use log::{error, info};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, RwLock,
    },
};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

use crate::{ContentType, DatabaseManager, SearchResult};
use screenpipe_audio::DeviceControl;

// App state
pub(crate) struct AppState {
    db: Arc<DatabaseManager>,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<RwLock<HashMap<String, Arc<DeviceControl>>>>,
}

// Request structs
#[derive(Deserialize)]
pub(crate) struct SearchQuery {
    q: Option<String>,
    #[serde(flatten)]
    pagination: PaginationQuery,
    #[serde(default)]
    content_type: ContentType,
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

#[derive(Deserialize)]
struct DateRangeQuery {
    start_date: Option<DateTime<Utc>>,
    end_date: Option<DateTime<Utc>>,
    #[serde(flatten)]
    pagination: PaginationQuery,
}

// Response structs
#[derive(Serialize)]
struct PaginatedResponse<T> {
    data: Vec<T>,
    pagination: PaginationInfo,
}

#[derive(Serialize)]
struct PaginationInfo {
    limit: u32,
    offset: u32,
    total: i64,
}

#[derive(Serialize)]
#[serde(tag = "type", content = "content")]
enum ContentItem {
    OCR(OCRContent),
    Audio(AudioContent),
}

#[derive(Serialize)]
struct OCRContent {
    frame_id: i64,
    text: String,
    timestamp: DateTime<Utc>,
    file_path: String,
    offset_index: i64,
}

#[derive(Serialize)]
struct AudioContent {
    chunk_id: i64,
    transcription: String,
    timestamp: DateTime<Utc>,
    file_path: String,
    offset_index: i64,
}

#[derive(Serialize)]
struct DeviceStatus {
    id: String,
    is_running: bool,
}

#[derive(Serialize)]
struct RecordingStatus {
    is_running: bool,
}

// Helper functions
fn default_limit() -> u32 {
    20
}

pub(crate) async fn search(
    Query(query): Query<SearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<
    JsonResponse<PaginatedResponse<ContentItem>>,
    (StatusCode, JsonResponse<serde_json::Value>),
> {
    info!(
        "Received search request: query='{}', content_type={:?}, limit={}, offset={}",
        query.q.as_deref().unwrap_or(""),
        query.content_type,
        query.pagination.limit,
        query.pagination.offset
    );

    let query_str = query.q.as_deref().unwrap_or("");
    let results = state
        .db
        .search(
            query_str,
            query.content_type,
            query.pagination.limit,
            query.pagination.offset,
        )
        .await
        .map_err(|e| {
            error!("Failed to search for content: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("Failed to search for content: {}", e)})),
            )
        })?;

    let total = state
        .db
        .count_search_results(query_str, query.content_type)
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
pub(crate) async fn start_device(
    Path(device_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<JsonResponse<DeviceStatus>, (StatusCode, JsonResponse<serde_json::Value>)> {
    let device_controls = state.audio_devices_control.read().unwrap();
    if let Some(device_control) = device_controls.get(&device_id) {
        device_control.is_paused.store(false, Ordering::SeqCst);
        device_control.is_running.store(true, Ordering::SeqCst);
        Ok(JsonResponse(DeviceStatus {
            id: device_id,
            is_running: true,
        }))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "Device not found"})),
        ))
    }
}

pub(crate) async fn stop_device(
    Path(device_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<JsonResponse<DeviceStatus>, (StatusCode, JsonResponse<serde_json::Value>)> {
    let device_controls = state.audio_devices_control.read().unwrap();
    if let Some(device_control) = device_controls.get(&device_id) {
        device_control.is_running.store(false, Ordering::SeqCst);
        device_control.is_paused.store(true, Ordering::SeqCst);
        Ok(JsonResponse(DeviceStatus {
            id: device_id,
            is_running: false,
        }))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "Device not found"})),
        ))
    }
}

pub(crate) async fn start_recording(
    State(state): State<Arc<AppState>>,
) -> JsonResponse<RecordingStatus> {
    state.vision_control.store(true, Ordering::SeqCst);
    JsonResponse(RecordingStatus { is_running: true })
}

pub(crate) async fn stop_recording(
    State(state): State<Arc<AppState>>,
) -> JsonResponse<RecordingStatus> {
    state.vision_control.store(false, Ordering::SeqCst);
    JsonResponse(RecordingStatus { is_running: false })
}

pub(crate) async fn get_recording_status(
    State(state): State<Arc<AppState>>,
) -> JsonResponse<RecordingStatus> {
    let is_running = state.vision_control.load(Ordering::SeqCst);
    JsonResponse(RecordingStatus { is_running })
}

pub(crate) async fn get_device_status(
    Path(device_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<JsonResponse<DeviceStatus>, (StatusCode, JsonResponse<serde_json::Value>)> {
    let device_controls = state.audio_devices_control.read().unwrap();
    if let Some(device_control) = device_controls.get(&device_id) {
        Ok(JsonResponse(DeviceStatus {
            id: device_id,
            is_running: device_control.is_running.load(Ordering::SeqCst),
        }))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            JsonResponse(json!({"error": "Device not found"})),
        ))
    }
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
        }),
        SearchResult::Audio(audio) => ContentItem::Audio(AudioContent {
            chunk_id: audio.audio_chunk_id,
            transcription: audio.transcription,
            timestamp: audio.timestamp,
            file_path: audio.file_path,
            offset_index: audio.offset_index,
        }),
    }
}

pub struct Server {
    db: Arc<DatabaseManager>,
    addr: SocketAddr,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<RwLock<HashMap<String, Arc<DeviceControl>>>>,
}

impl Server {
    pub fn new(
        db: Arc<DatabaseManager>,
        addr: SocketAddr,
        vision_control: Arc<AtomicBool>,
        audio_devices_control: Arc<RwLock<HashMap<String, Arc<DeviceControl>>>>,
    ) -> Self {
        Server {
            db,
            addr,
            vision_control,
            audio_devices_control,
        }
    }

    pub async fn start(self) -> Result<(), std::io::Error> {
        let app_state = Arc::new(AppState {
            db: self.db,
            vision_control: self.vision_control,
            audio_devices_control: self.audio_devices_control,
        });

        let app = Router::new()
            .route("/search", get(search))
            .route("/device/:id/start", post(start_device))
            .route("/device/:id/stop", post(stop_device))
            .route("/device/:id/status", get(get_device_status))
            .route("/recording/start", post(start_recording))
            .route("/recording/stop", post(stop_recording))
            .route("/recording/status", get(get_recording_status))
            .layer(CorsLayer::permissive())
            .with_state(app_state);

        info!("Starting server on {}", self.addr);

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

// Curl commands for reference:
// # 1. Basic search query
// # curl "http://localhost:3030/search?q=test&limit=5&offset=0"

// # 2. Search with content type filter (OCR)
// # curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=ocr"

// # 3. Search with content type filter (Audio)
// # curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=audio"

// # 4. Search with pagination
// # curl "http://localhost:3030/search?q=test&limit=10&offset=20"

// # 5. Get recent results with date range
// # curl "http://localhost:3030/recent?limit=5&offset=0&start_date=2024-07-02T14:00:00&end_date=2024-07-02T23:59:59"

// # 6. Search with no query (should return all results)
// # curl "http://localhost:3030/search?limit=5&offset=0"

// # 7. Start a device
// # curl -X POST "http://localhost:3030/device/device1/start"

// # 8. Stop a device
// # curl -X POST "http://localhost:3030/device/device1/stop"

// # 9. Get device status
// # curl "http://localhost:3030/device/device1/status"

// # 10. Start recording
// # curl -X POST "http://localhost:3030/recording/start"

// # 11. Stop recording
// # curl -X POST "http://localhost:3030/recording/stop"

// # 12. Get recording status
// # curl "http://localhost:3030/recording/status"
