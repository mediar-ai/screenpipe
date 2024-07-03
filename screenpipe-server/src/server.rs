use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json as JsonResponse,
    routing::get,
    serve, Router,
};

use chrono::{DateTime, Utc};
use log::info;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{net::SocketAddr, sync::Arc};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

use crate::{ContentType, DatabaseManager, SearchResult};
// App state
struct AppState {
    db: Arc<DatabaseManager>,
}
// Request structs
#[derive(Deserialize)]
struct SearchQuery {
    q: Option<String>,
    #[serde(flatten)]
    pagination: PaginationQuery,
    #[serde(default)]
    content_type: ContentType,
}

#[derive(Deserialize)]
struct PaginationQuery {
    #[serde(default = "default_limit")]
    #[serde(deserialize_with = "deserialize_number_from_string")]
    limit: u32,
    #[serde(default)]
    #[serde(deserialize_with = "deserialize_number_from_string")]
    offset: u32,
}

// Add this function somewhere in your code
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

// Helper functions
fn default_limit() -> u32 {
    20
}

async fn search(
    Query(query): Query<SearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<
    JsonResponse<PaginatedResponse<ContentItem>>,
    (StatusCode, JsonResponse<serde_json::Value>),
> {
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
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("Failed to count search results: {}", e)})),
            )
        })?;

    Ok(JsonResponse(PaginatedResponse {
        data: results.into_iter().map(into_content_item).collect(),
        pagination: PaginationInfo {
            limit: query.pagination.limit,
            offset: query.pagination.offset,
            total: total as i64,
        },
    }))
}

async fn get_by_date_range(
    Query(query): Query<DateRangeQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<
    JsonResponse<PaginatedResponse<ContentItem>>,
    (StatusCode, JsonResponse<serde_json::Value>),
> {
    let results = state
        .db
        .get_recent_results(
            query.pagination.limit,
            query.pagination.offset,
            query.start_date,
            query.end_date,
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let total = state
        .db
        .count_recent_results(query.start_date, query.end_date)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonResponse(json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    Ok(JsonResponse(PaginatedResponse {
        data: results.into_iter().map(into_content_item).collect(),
        pagination: PaginationInfo {
            limit: query.pagination.limit,
            offset: query.pagination.offset,
            total: total as i64,
        },
    }))
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
}

impl Server {
    pub fn new(db: Arc<DatabaseManager>, addr: SocketAddr) -> Self {
        Server { db, addr }
    }

    pub async fn start(self) -> Result<(), std::io::Error> {
        let app_state = Arc::new(AppState { db: self.db });

        let app = Router::new()
            .route("/search", get(search))
            .route("/recent", get(get_by_date_range))
            .layer(CorsLayer::permissive())
            .with_state(app_state);

        info!("Starting server on {}", self.addr);

        serve(
            TcpListener::bind(self.addr).await.unwrap(),
            app.into_make_service(),
        )
        .await
    }
}

// # 1. Basic search query
// curl "http://localhost:3030/search?q=test&limit=5&offset=0"

// # 2. Search with content type filter (OCR)
// curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=ocr"

// # 3. Search with content type filter (Audio)
// curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=audio"

// # 4. Search with pagination
// curl "http://localhost:3030/search?q=test&limit=10&offset=20"

// # 5. Get recent results without date range
// curl "http://localhost:3030/recent?limit=5&offset=0"

// # 6. Get recent results with date range
// curl "http://localhost:3030/recent?limit=5&offset=0&start_date=2024-07-02T14:00:00&end_date=2024-07-02T23:59:59"

// 5 s ago
// start_date=$(date -u -v-5S +'%Y-%m-%dT%H:%M:%S')

// end_date=$(date -u +'%Y-%m-%dT%H:%M:%S')

// curl "http://localhost:3030/recent?limit=5&offset=0&start_date=$start_date&end_date=$end_date"

// # 9. Search with no query (should return all results)
// curl "http://localhost:3030/search?limit=5&offset=0"

// # 10. Get recent results with pagination
// curl "http://localhost:3030/recent?limit=20&offset=40"
