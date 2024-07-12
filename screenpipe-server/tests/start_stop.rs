use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::Router,
};
use screenpipe_server::RecorderControl;
use screenpipe_server::{
    get_device_status, get_recording_status, start_device, start_recording, stop_device,
    stop_recording, AppState,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tower::util::ServiceExt;

// Mock DeviceControl for testing
struct MockDeviceControl {
    is_running: AtomicBool,
    sender: Option<std::sync::mpsc::Sender<RecorderControl>>,
}

impl DeviceControl {
    fn new() -> Self {
        let (sender, _receiver) = std::sync::mpsc::channel();
        Self {
            is_running: AtomicBool::new(false),
            sender: Some(sender),
        }
    }

    fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    fn sender(&self) -> Option<&std::sync::mpsc::Sender<RecorderControl>> {
        self.sender.as_ref()
    }
}

fn create_test_app() -> Router {
    let db = Arc::new(DatabaseManager::new("test_db_url").unwrap());
    let is_running = Arc::new(AtomicBool::new(false));
    let device_controls = Arc::new(RwLock::new(HashMap::new()));
    device_controls
        .write()
        .unwrap()
        .insert("test_device".to_string(), Arc::new(DeviceControl::new()));

    let app_state = Arc::new(AppState {
        db,
        is_running,
        device_controls,
    });

    Router::new()
        .route("/device/:id/start", axum::routing::post(start_device))
        .route("/device/:id/stop", axum::routing::post(stop_device))
        .route("/device/:id/status", axum::routing::get(get_device_status))
        .route("/recording/start", axum::routing::post(start_recording))
        .route("/recording/stop", axum::routing::post(stop_recording))
        .route(
            "/recording/status",
            axum::routing::get(get_recording_status),
        )
        .with_state(app_state)
}

#[tokio::test]
async fn test_start_device() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/device/test_device/start")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["id"], "test_device");
    assert_eq!(json["is_running"], true);
}

#[tokio::test]
async fn test_stop_device() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/device/test_device/stop")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["id"], "test_device");
    assert_eq!(json["is_running"], false);
}

#[tokio::test]
async fn test_get_device_status() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/device/test_device/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["id"], "test_device");
    assert!(json["is_running"].is_boolean());
}

#[tokio::test]
async fn test_start_recording() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/recording/start")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["is_running"], true);
}

#[tokio::test]
async fn test_stop_recording() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/recording/stop")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["is_running"], false);
}

#[tokio::test]
async fn test_get_recording_status() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/recording/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(json["is_running"].is_boolean());
}
