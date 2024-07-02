use std::collections::HashMap;
use std::sync::Mutex;
use std::{io::Cursor, sync::Arc};

use axum::extract::Query;
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{NaiveDateTime, Utc};

use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;

use crate::{extract_frames_from_video, DatabaseManager, SearchResult};

#[derive(Clone)]
struct AppState {
    local_data_dir: String,
    db: Arc<Mutex<Option<DatabaseManager>>>,
}

#[derive(Serialize)]
struct FrameInfo {
    max_frame: i64,
}

#[derive(Deserialize)]
struct Pagination {
    search: Option<String>,
    limit: i64,
    offset: i64,
}

#[derive(Deserialize)]
struct ImageParams {
    thumbnail: Option<bool>,
}

#[derive(Serialize)]
struct TextWithTimestampResponse {
    ocr_text: Option<String>,
    audio_transcription: Option<String>,
    timestamp: String, // Use String to serialize NaiveDateTime easily
}

// TODO: Optimize this to do chunk loading, instead of starting from scratch with the
// frame every single time
// TODO: Also, cache the frames in memory using an LRU cache
async fn get_frame_handler(
    Path(frame_number): Path<i64>,
    Query(query): Query<ImageParams>,
    State(state): State<Arc<AppState>>,
) -> (StatusCode, Bytes) {
    let db_video_ref = state.db.clone();
    let maybe_video_path = {
        let mut db_clone = db_video_ref.lock().unwrap();
        db_clone
            .as_mut()
            .unwrap()
            .get_frame(frame_number)
            .expect("Failed to get frame")
    };
    if let Some((offset_index, video_path, _)) = maybe_video_path {
        println!("video path: {:?}", video_path);
        match extract_frames_from_video(&video_path, &[offset_index]) {
            Ok(frames) => {
                if let Some(frame) = frames.into_iter().next() {
                    let mut cursor = Cursor::new(Vec::new());
                    if query.thumbnail.unwrap_or(false) {
                        if frame
                            .thumbnail(800, 800)
                            .write_to(&mut cursor, image::ImageFormat::Png)
                            .is_ok()
                        {
                            println!("Thumbnail generated successfully");
                            return (StatusCode::OK, Bytes::from(cursor.into_inner()));
                        } else {
                            println!("Failed to generate thumbnail");
                        }
                    } else if frame.write_to(&mut cursor, image::ImageFormat::Png).is_ok() {
                        println!("Frame generated successfully");
                        return (StatusCode::OK, Bytes::from(cursor.into_inner()));
                    } else {
                        println!("Failed to generate frame");
                    }
                } else {
                    println!("No frames found");
                }
            }
            Err(e) => {
                println!("Error extracting frames: {:?}", e);
            }
        }
    } else {
        println!("No video path found for frame number: {}", frame_number);
    }
    (StatusCode::NOT_FOUND, Bytes::new())
}

#[derive(Serialize)]
struct PaginatedResults {
    data: Vec<SearchResult>,
}

async fn search_handler(
    Query(query): Query<Pagination>,
    State(state): State<Arc<AppState>>,
) -> Json<PaginatedResults> {
    let db_frames_ref = state.db.clone();
    let results = {
        let mut db_clone = db_frames_ref.lock().expect("Failed to acquire lock");

        let search = query.search.unwrap_or("".to_string());
        if search.is_empty() {
            db_clone
                .as_mut()
                .unwrap()
                .get_recent_results(query.limit, query.offset, None, None)
                .expect("Failed to get recent results")
        } else {
            db_clone
                .as_mut()
                .unwrap()
                .search(&search, query.limit, query.offset)
                .expect("Failed to get search results")
        }
    };
    Json(PaginatedResults { data: results })
}

#[derive(Deserialize)]
struct DateFilter {
    start_date: NaiveDateTime,
    end_date: NaiveDateTime,
    limit: i64,
    offset: i64,
}

async fn get_by_date_handler(
    Query(query): Query<DateFilter>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<TextWithTimestampResponse>>, StatusCode> {
    let start_date = query.start_date;
    let end_date = query.end_date;
    let db_video_ref = state.db.clone();
    let texts_with_timestamps = {
        let mut db_clone = db_video_ref.lock().unwrap();
        db_clone
            .as_mut()
            .unwrap()
            .get_recent_results(query.limit, query.offset, Some(start_date), Some(end_date))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    let response = texts_with_timestamps
        .into_iter()
        .map(|item| match item {
            SearchResult::OCR(ocr) => TextWithTimestampResponse {
                ocr_text: Some(ocr.ocr_text),
                audio_transcription: None,
                timestamp: ocr.timestamp.to_string(),
            },
            SearchResult::Audio(audio) => TextWithTimestampResponse {
                ocr_text: None,
                audio_transcription: Some(audio.transcription),
                timestamp: audio.timestamp.to_string(),
            },
        })
        .collect();

    Ok(Json(response))
}
pub async fn start_frame_server(
    tx: oneshot::Sender<()>,
    local_data_dir: String,
    db: Arc<Mutex<Option<DatabaseManager>>>,
) {
    let state = Arc::new(AppState { local_data_dir, db });

    let app = Router::new()
        .route("/text", get(search_handler))
        .route("/text_by_date", get(get_by_date_handler))
        .route("/frames/:frame_number", get(get_frame_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3030").await.unwrap();
    axum::serve(listener, app).await.unwrap();

    // Send signal that the server has started
    let _ = tx.send(());
}

// # 1. Search for text with pagination
// curl "http://localhost:3030/text?search=e&limit=10&offset=0"

// # 2. Get recent results without search term
// curl "http://localhost:3030/text?limit=20&offset=0"

// # 3. Get frame image (non-thumbnail) // ! does not work
// curl -o frame.png "http://localhost:3030/frames/100"

// # 4. Get frame thumbnail
// curl -o thumbnail.png "http://localhost:3030/frames/100?thumbnail=true"

// # 5. Get text by date range
// curl "http://localhost:3030/text_by_date?start_date=2024-07-02T00:00:00&end_date=2024-07-02T23:59:59&limit=15&offset=0"

