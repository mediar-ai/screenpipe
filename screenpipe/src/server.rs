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

use crate::core::{extract_frames_from_video, DatabaseManager};

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
    text: String,
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

async fn get_max_frame_handler(State(state): State<Arc<AppState>>) -> Json<FrameInfo> {
    let db_video_ref = state.db.clone();
    let max_frame = {
        let mut db_clone = db_video_ref.lock().unwrap();
        db_clone
            .as_mut()
            .unwrap()
            .get_max_frame()
            .expect("Failed to get max frame")
    };
    Json(FrameInfo { max_frame })
}

#[derive(Serialize)]
struct Frame {
    frame_number: i64,
    timestamp: i64,
    text: Option<String>,
}

#[derive(Serialize)]
struct PaginatedFrames {
    data: Vec<Frame>,
}

async fn search_frames_handler(
    Query(query): Query<Pagination>,
    State(state): State<Arc<AppState>>,
) -> Json<PaginatedFrames> {
    let db_frames_ref = state.db.clone();
    let results = {
        let mut db_clone = db_frames_ref.lock().expect("Failed to acquire lock");

        let search = query.search.unwrap_or("".to_string());
        if search.is_empty() {
            db_clone
                .as_mut()
                .unwrap()
                .get_recent_results(query.limit, query.offset, None)
                .expect("Failed to get recent results")
        } else {
            db_clone
                .as_mut()
                .unwrap()
                .search(&search, query.limit, query.offset, None)
                .expect("Failed to get search results")
        }
    };
    let mut data = Vec::new();
    for frame in results {
        let frame_number = frame.frame_id;
        let timestamp = frame.timestamp;
        data.push(Frame {
            frame_number,
            timestamp: timestamp.timestamp_millis(),
            text: frame.full_text,
        });
    }
    Json(PaginatedFrames { data })
}

async fn get_texts_by_date_handler(
    Query(query): Query<HashMap<String, String>>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<TextWithTimestampResponse>>, StatusCode> {
    let date_str = query.get("date").ok_or(StatusCode::BAD_REQUEST)?;
    let date = NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M:%S")
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let db_video_ref = state.db.clone();
    let texts_with_timestamps = {
        let mut db_clone = db_video_ref.lock().unwrap();
        db_clone
            .as_mut()
            .unwrap()
            .get_recent_text_context(date)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    let response: Vec<TextWithTimestampResponse> = texts_with_timestamps
        .into_iter()
        .map(|item| TextWithTimestampResponse {
            text: item.text,
            timestamp: item.timestamp.to_string(),
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
        .route("/frames", get(search_frames_handler))
        .route("/frames/max", get(get_max_frame_handler))
        .route("/frames/:frame_number", get(get_frame_handler))
        .route("/texts", get(get_texts_by_date_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3030").await.unwrap();
    axum::serve(listener, app).await.unwrap();

    // Send signal that the server has started
    let _ = tx.send(());
}
