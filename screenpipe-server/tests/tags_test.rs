use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use chrono::Utc;
use lru::LruCache;
use screenpipe_audio::{AudioDevice, DeviceType};
use screenpipe_vision::OcrEngine;
use serde_json::json;
use std::{num::NonZeroUsize, path::PathBuf, sync::Arc};
use tokio::sync::Mutex;
use tower::ServiceExt;

use screenpipe_server::{
    create_router, video_cache::FrameCache, AppState, ContentItem, DatabaseManager,
    PaginatedResponse, PipeManager,
};

// Add this function to initialize the logger
fn init() {
    let _ = env_logger::builder().is_test(true).try_init();
}

async fn setup_test_app() -> (Router, Arc<AppState>) {
    let db = Arc::new(DatabaseManager::new("sqlite::memory:").await.unwrap());

    let app_state = Arc::new(AppState {
        db: db.clone(),
        vision_disabled: false,
        audio_disabled: false,
        app_start_time: Utc::now(),
        screenpipe_dir: PathBuf::from(""),
        pipe_manager: Arc::new(PipeManager::new(PathBuf::from(""))),
        frame_cache: Some(Arc::new(
            FrameCache::new(PathBuf::from(""), db).await.unwrap(),
        )),
        ui_monitoring_enabled: false,
        frame_image_cache: Some(Arc::new(Mutex::new(LruCache::new(
            NonZeroUsize::new(100).unwrap(),
        )))),
    });

    let app = create_router().with_state(app_state.clone());
    init();
    (app, app_state)
}

#[tokio::test]
async fn test_add_tags_and_search() {
    let (app, app_state) = setup_test_app().await;

    // Insert test data
    insert_test_data(&app_state.db).await;

    // Test adding tags to vision content
    let vision_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/tags/vision/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["test", "vision"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(vision_response.status(), StatusCode::OK);

    // Test adding tags to audio content
    let audio_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/tags/audio/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["test", "audio"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(audio_response.status(), StatusCode::OK);

    // Test adding tags with invalid content type
    let invalid_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/tags/invalid/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["test"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(invalid_response.status(), StatusCode::BAD_REQUEST);

    // Test search results include tags
    let search_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?q=test&content_type=all")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(search_response.status(), StatusCode::OK);

    let body = to_bytes(search_response.into_body(), usize::MAX)
        .await
        .unwrap();

    println!("Raw response body: {}", String::from_utf8_lossy(&body));

    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    // Check if search results contain the added tags
    for result in search_results.data {
        match result {
            ContentItem::OCR(ocr) => {
                assert!(ocr.tags.contains(&"test".to_string()));
                assert!(ocr.tags.contains(&"vision".to_string()));
            }
            ContentItem::Audio(audio) => {
                assert!(audio.tags.contains(&"test".to_string()));
                assert!(audio.tags.contains(&"audio".to_string()));
            }
            ContentItem::UI(_) => {
                unreachable!()
            }
        }
    }
}

#[tokio::test]
async fn test_add_multiple_tags_to_single_item() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/tags/vision/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["work", "meeting", "important", "follow-up"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify tags were added
    let search_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?content_type=ocr")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(search_response.status(), StatusCode::OK);

    let body = to_bytes(search_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert!(!search_results.data.is_empty());
    if let ContentItem::OCR(ocr) = &search_results.data[0] {
        assert!(ocr.tags.contains(&"important".to_string()));
        assert!(ocr.tags.contains(&"follow-up".to_string()));
    }
}

#[tokio::test]
async fn test_remove_tags() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Add tags
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/tags/audio/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["meeting", "client", "project-x"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Remove a tag
    let remove_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/tags/audio/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["client"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(remove_response.status(), StatusCode::OK);

    // Verify tag was removed
    let search_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?content_type=audio")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(search_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    println!("Search results: {}", search_results.data.len());
    assert!(!search_results.data.is_empty());
    if let ContentItem::Audio(audio) = &search_results.data[0] {
        assert!(audio.tags.contains(&"project-x".to_string()));
        assert!(!audio.tags.contains(&"client".to_string()));
    }
}

#[tokio::test]
async fn test_search_by_multiple_tags() {
    let (app, app_state) = setup_test_app().await;
    insert_test_data(&app_state.db).await;

    // Add tags to multiple items
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/tags/vision/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["work", "meeting", "project-a"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/tags/audio/1")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "tags": ["work", "call", "project-b"]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Search for items with multiple tags, excluding UI content
    let search_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/search?content_type=audio+ocr")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(search_response.status(), StatusCode::OK);

    let body = to_bytes(search_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let search_results: PaginatedResponse<ContentItem> = serde_json::from_slice(&body).unwrap();

    assert_eq!(search_results.data.len(), 2);
    for item in search_results.data {
        match item {
            ContentItem::OCR(ocr) => {
                assert!(ocr.tags.contains(&"work".to_string()));
                assert!(ocr.tags.contains(&"meeting".to_string()));
            }
            ContentItem::Audio(audio) => {
                assert!(audio.tags.contains(&"work".to_string()));
                assert!(audio.tags.contains(&"call".to_string()));
            }
            ContentItem::UI(_) => {
                panic!("UI content should not be included in the results");
            }
        }
    }
}

async fn insert_test_data(db: &Arc<DatabaseManager>) {
    // Insert test video chunk
    let _video_chunk_id = db
        .insert_video_chunk("test_video_file.mp4", "test_device")
        .await
        .unwrap();

    // Insert test frame
    let frame_id = db.insert_frame("test_device", None, None).await.unwrap();

    // Insert test OCR data
    db.insert_ocr_text(
        frame_id,
        "Test OCR text",
        "{'text': 'Test OCR text', 'confidence': 0.9}",
        "test_app",
        "test_window",
        Arc::new(OcrEngine::Tesseract),
        true,
    )
    .await
    .unwrap();

    // Insert test audio chunk
    let audio_chunk_id = db.insert_audio_chunk("test_audio_file.wav").await.unwrap();

    // Insert test audio data
    db.insert_audio_transcription(
        audio_chunk_id,
        "Test audio transcription",
        0,
        "test_engine",
        &AudioDevice::new("test".to_string(), DeviceType::Output),
        None,
        None,
        None,
    )
    .await
    .unwrap();
}
