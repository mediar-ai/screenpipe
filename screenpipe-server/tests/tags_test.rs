use axum::{http::StatusCode, Router};
use axum_test::{TestServer, TestServerConfig};
use screenpipe_server::{AppState, DatabaseManager, TagContentType};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::mpsc;

async fn setup_test_server() -> (TestServer, Arc<AppState>) {
    let db = Arc::new(DatabaseManager::new("sqlite::memory:").await.unwrap());
    let (tx, _rx) = mpsc::channel(100);
    let vision_control = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let app_state = Arc::new(AppState::new(
        db.clone(),
        vision_control,
        tx,
        Default::default(),
    ));

    let app = Router::new()
        .route("/tag", axum::routing::post(screenpipe_server::add_tags))
        .with_state(app_state.clone());

    (
        TestServer::new_with_config(app.into_make_service(), TestServerConfig::default()).unwrap(),
        app_state,
    )
}

#[tokio::test]
async fn test_add_tags_to_frame() {
    let (server, app_state) = setup_test_server().await;

    // First, we need to insert a frame
    let db = app_state.db.clone();
    let _video_chunk_id = db.insert_video_chunk("foo").await.unwrap();
    let frame_id = db.insert_frame().await.unwrap();

    let response = server
        .post("/tag")
        .json(&json!({
            "id": frame_id,
            "type": "vision",
            "tags": ["important", "meeting"]
        }))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    // Verify that the tags were added
    let tags = db.get_tags(frame_id, TagContentType::Vision).await.unwrap();
    assert_eq!(tags, vec!["important", "meeting"]);
}

#[tokio::test]
async fn test_add_tags_to_audio() {
    let (server, app_state) = setup_test_server().await;

    // First, we need to insert an audio chunk and transcription
    let db = app_state.db.clone();
    let audio_chunk_id = db.insert_audio_chunk("test_audio.wav").await.unwrap();
    let audio_id = db
        .insert_audio_transcription(audio_chunk_id, "Test transcription", 0)
        .await
        .unwrap();

    let response = server
        .post("/tag")
        .json(&json!({
            "id": audio_id,
            "type": "audio",
            "tags": ["interview", "client"]
        }))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    // Verify that the tags were added
    let tags = db.get_tags(audio_id, TagContentType::Audio).await.unwrap();
    assert_eq!(tags, vec!["client", "interview"]);
}

#[tokio::test]
async fn test_add_duplicate_tags() {
    let (server, app_state) = setup_test_server().await;

    let db = app_state.db.clone();
    let _video_chunk_id = db.insert_video_chunk("foo").await.unwrap();
    let frame_id = db.insert_frame().await.unwrap();

    // Add initial tags
    let response = server
        .post("/tag")
        .json(&json!({
            "id": frame_id,
            "type": "vision",
            "tags": ["important", "meeting"]
        }))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    // Add duplicate and new tags
    let response = server
        .post("/tag")
        .json(&json!({
            "id": frame_id,
            "type": "vision",
            "tags": ["important", "urgent"]
        }))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    // Verify that duplicates were removed and new tags were added
    let tags = db.get_tags(frame_id, TagContentType::Vision).await.unwrap();
    assert_eq!(tags, vec!["important", "meeting", "urgent"]);
}

#[tokio::test]
async fn test_add_tags_nonexistent_id() {
    let (server, _app_state) = setup_test_server().await;

    let response = server
        .post("/tag")
        .json(&json!({
            "id": 9999,
            "type": "vision",
            "tags": ["test"]
        }))
        .await;

    assert_eq!(response.status_code(), StatusCode::NOT_FOUND);
}
