use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use chrono::{Duration, Utc};
use screenpipe_server::{create_router, AppState, ContentItem, DatabaseManager, PaginatedResponse};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tower::ServiceExt;
fn init() {
    let _ = env_logger::builder()
        .is_test(true)
        .filter_level(log::LevelFilter::Debug)
        .try_init()
        .map_err(|e| eprintln!("Logger initialization failed: {}", e));
}
// Helper function to set up the test app
async fn setup_test_app() -> (Router, Arc<AppState>) {
    let db = Arc::new(DatabaseManager::new("sqlite::memory:").await.unwrap());
    let app_state = Arc::new(AppState {
        db: db.clone(),
        vision_control: Arc::new(AtomicBool::new(false)),
        audio_devices_control: Arc::new(crossbeam::queue::SegQueue::new()),
        devices_status: HashMap::new(),
        app_start_time: Utc::now(),
    });

    init();
    let app = create_router().with_state(app_state.clone());
    (app, app_state)
}

// Helper function to insert test data
async fn insert_test_data(db: &Arc<DatabaseManager>) {
    // Insert OCR data
    db.insert_video_chunk("test_video.mp4").await.unwrap();
    let frame_id = db.insert_frame().await.unwrap();
    db.insert_ocr_text(
        frame_id,
        "Test OCR text",
        &serde_json::to_string(&json!({
            "x": 10,
            "y": 20,
            "width": 100,
            "height": 200
        }))
        .unwrap(),
        "TestApp",
        "TestWindow",
        Arc::new(screenpipe_vision::OcrEngine::Tesseract),
        true,
    )
    .await
    .unwrap();

    // Insert Audio data
    let audio_chunk_id = db.insert_audio_chunk("test_audio.wav").await.unwrap();
    db.insert_audio_transcription(audio_chunk_id, "Test audio transcription", 0, "TestEngine")
        .await
        .unwrap();
}

#[tokio::test]
async fn test_basic_search() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=10&offset=0")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 2); // One OCR result and one Audio result
    assert_eq!(search_results.pagination.total, 2);
}

#[tokio::test]
async fn test_content_type_filter() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Test OCR filter
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=10&offset=0&content_type=ocr")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 1);
    assert!(matches!(search_results.data[0], ContentItem::OCR(_)));

    // Test Audio filter
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=10&offset=0&content_type=audio")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 1);
    assert!(matches!(search_results.data[0], ContentItem::Audio(_)));
}

#[tokio::test]
async fn test_pagination() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Test with limit 1 and offset 0
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=1&offset=0")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 1);
    assert_eq!(search_results.pagination.total, 2);

    // Test with limit 1 and offset 1
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=1&offset=1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 0);
    assert_eq!(search_results.pagination.total, 2);
    // assert_ne!(search_results.data[0], search_results.data[0]);
}

#[tokio::test]
async fn test_time_range_filter() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    let now = Utc::now();
    let one_hour_ago = now - Duration::hours(1);
    let two_hours_ago = now - Duration::hours(2);

    // Test search within the last hour
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(&format!(
                    "/search?q=test&limit=10&offset=0&start_time={}&end_time={}",
                    one_hour_ago.to_rfc3339(),
                    now.to_rfc3339()
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 2);

    // Test search between two hours ago and one hour ago (should return no results)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(&format!(
                    "/search?q=test&limit=10&offset=0&start_time={}&end_time={}",
                    two_hours_ago.to_rfc3339(),
                    one_hour_ago.to_rfc3339()
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 0);
}

#[tokio::test]
async fn test_app_name_filter() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Test search with correct app name
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=10&offset=0&app_name=TestApp")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 1);
    assert!(matches!(search_results.data[0], ContentItem::OCR(_)));

    // Test search with incorrect app name
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=10&offset=0&app_name=WrongApp&start_time=2024-01-01T00:00:00Z&end_time=2024-01-02T00:00:00Z")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 0);
}

#[tokio::test]
async fn test_window_name_filter() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Test search with correct window name
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=10&offset=0&window_name=TestWindow")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 1);
    assert!(matches!(search_results.data[0], ContentItem::OCR(_)));

    // Test search with incorrect window name
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&limit=10&offset=0&window_name=WrongWindow")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 0);
}

#[tokio::test]
async fn test_empty_query() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Test search with empty query (should return all results)
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?limit=10&offset=0")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 2);
    assert_eq!(search_results.pagination.total, 2);
}

#[tokio::test]
async fn test_no_results() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Test search with a query that doesn't match any results
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=nonexistent&limit=10&offset=0&start_time=2024-01-01T00:00:00Z&end_time=2024-01-01T00:00:00Z")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 0);
    assert_eq!(search_results.pagination.total, 0);
}
