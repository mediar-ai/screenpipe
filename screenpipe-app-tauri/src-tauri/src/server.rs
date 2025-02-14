use crate::{get_base_dir, get_store};
use axum::body::Bytes;
use axum::response::sse::{Event, Sse};
use axum::response::IntoResponse;
use axum::{
    extract::{Query, State},
    http::{Method, StatusCode},
    Json, Router,
};
use futures::stream::Stream;
use http::header::{HeaderValue, CONTENT_TYPE};
use notify::RecursiveMode;
use notify::Watcher;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::net::SocketAddr;
use tauri::Emitter;
use tauri::Manager;
#[allow(unused_imports)]
use tauri_plugin_notification::NotificationExt;
use tokio::sync::broadcast;
use tokio::sync::mpsc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::{DefaultMakeSpan, TraceLayer};
use tracing::{error, info};
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct LogEntry {
    pipe_id: String,
    level: String,
    message: String,
    timestamp: String,
}

#[derive(Clone)]
pub struct ServerState {
    app_handle: tauri::AppHandle,
    settings_tx: broadcast::Sender<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct NotificationPayload {
    title: String,
    body: String,
}

#[derive(Serialize)]
struct ApiResponse {
    success: bool,
    message: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct InboxMessagePayload {
    title: String,
    body: String,
    #[serde(rename = "type")]
    message_type: String,
    actions: Option<Vec<InboxMessageAction>>,
    action_server_port: Option<u16>,
}

#[derive(Serialize, Deserialize, Debug)]
struct InboxMessageAction {
    label: String,
    action: String,
    port: u16,
}

#[derive(Deserialize, Debug)]
struct AuthPayload {
    token: Option<String>,
    email: Option<String>,
    user_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AuthData {
    token: String,
    email: String,
    user_id: String,
}

#[derive(Debug, Deserialize)]
struct AppIconQuery {
    name: String,
    path: Option<String>,
}

#[derive(Deserialize, Debug)]
struct WindowSizePayload {
    title: String,
    width: f64,
    height: f64,
}

async fn settings_stream(
    State(state): State<ServerState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.settings_tx.subscribe();

    let stream = async_stream::stream! {
        let store = get_store(&state.app_handle, None).unwrap();
        let settings = serde_json::to_string(&store.entries()).unwrap();
        yield Ok(Event::default().data(settings));

        while let Ok(settings) = rx.recv().await {
            yield Ok(Event::default().data(settings));
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(1))
            .text("keep-alive-text"),
    )
}

pub async fn run_server(app_handle: tauri::AppHandle, port: u16) {
    let (settings_tx, _) = broadcast::channel(100);
    let settings_tx_clone = settings_tx.clone();
    let app_handle_clone = app_handle.clone();

    let base_dir = get_base_dir(&app_handle, None).expect("Failed to ensure local data directory");
    let store_path = base_dir.join("store.bin");

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if event.kind.is_modify() {
                if let Ok(store) = get_store(&app_handle_clone, None) {
                    if let Ok(settings) = serde_json::to_string(&store.entries()) {
                        let _ = settings_tx_clone.send(settings);
                    }
                }
            }
        }
    })
    .unwrap();

    watcher
        .watch(&store_path, RecursiveMode::NonRecursive)
        .unwrap();

    let state = ServerState {
        app_handle,
        settings_tx,
    };

    let cors = CorsLayer::new()
        .allow_origin("*".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any)
        .allow_credentials(false);

    let app = Router::new()
        .route("/notify", axum::routing::post(send_notification))
        .route("/inbox", axum::routing::post(send_inbox_message))
        .route("/log", axum::routing::post(log_message))
        .route("/auth", axum::routing::post(handle_auth))
        .route("/app-icon", axum::routing::get(get_app_icon_handler))
        .route("/window-size", axum::routing::post(set_window_size))
        .route("/sse/settings", axum::routing::get(settings_stream))
        .route("/sidecar/start", axum::routing::post(start_sidecar))
        .route("/sidecar/stop", axum::routing::post(stop_sidecar))
        .layer(cors)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(tracing::Level::INFO))
                .on_request(())
                .on_response(()),
        )
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("Server listening on {}", addr);

    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn send_notification(
    State(state): State<ServerState>,
    Json(payload): Json<NotificationPayload>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("Received notification request: {:?}", payload);
    match state.app_handle.emit("notification-requested", &payload) {
        Ok(e) => {
            info!("Notification sent: {:?}", e);
            Ok(Json(ApiResponse {
                success: true,
                message: "Notification sent successfully".to_string(),
            }))
        }
        Err(e) => {
            error!("Failed to send notification: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to send notification: {}", e),
            ))
        }
    }
}

async fn send_inbox_message(
    State(state): State<ServerState>,
    Json(payload): Json<InboxMessagePayload>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("received inbox message request: {:?}", payload);
    match state.app_handle.emit("inbox-message-received", &payload) {
        Ok(e) => {
            info!("inbox message sent: {:?}", e);
            Ok(Json(ApiResponse {
                success: true,
                message: "inbox message sent successfully".to_string(),
            }))
        }
        Err(e) => {
            error!("failed to send inbox message: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to send inbox message: {}", e),
            ))
        }
    }
}

async fn log_message(
    State(state): State<ServerState>,
    Json(log_entry): Json<LogEntry>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    match state.app_handle.emit("log-message", &log_entry) {
        Ok(e) => {
            info!("Log message sent: {:?}", e);
            Ok(Json(ApiResponse {
                success: true,
                message: "Log message sent successfully".to_string(),
            }))
        }
        Err(e) => {
            error!("Failed to send log message: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to send log message: {}", e),
            ))
        }
    }
}

async fn handle_auth(
    State(state): State<ServerState>,
    Json(payload): Json<AuthPayload>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("received auth data: {:?}", payload);

    let store = get_store(&state.app_handle, None).unwrap();

    if payload.token.is_some() {
        let auth_data = AuthData {
            token: payload.token.unwrap(),
            email: payload.email.unwrap_or_default(),
            user_id: payload.user_id.unwrap_or_default(),
        };

        info!("saving auth data: {:?}", auth_data);

        store.set("user", serde_json::to_value(Some(auth_data)).unwrap());
    } else {
        store.set(
            "user",
            serde_json::to_value::<Option<AuthData>>(None).unwrap(),
        );
    }

    if let Err(e) = store.save() {
        error!("failed to save store: {}", e);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to save auth data".to_string(),
        ));
    }

    state.app_handle.emit("cli-login", ()).unwrap();

    Ok(Json(ApiResponse {
        success: true,
        message: "auth data stored successfully".to_string(),
    }))
}

async fn get_app_icon_handler(
    State(_): State<ServerState>,
    Query(app_name): Query<AppIconQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!("received app icon request: {:?}", app_name);

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        match crate::icons::get_app_icon(&app_name.name, app_name.path).await {
            Ok(Some(icon)) => {
                let headers = [
                    (CONTENT_TYPE, HeaderValue::from_static("image/jpeg")),
                    (
                        http::header::CACHE_CONTROL,
                        HeaderValue::from_static("public, max-age=604800"),
                    ),
                ];
                Ok((headers, Bytes::from(icon.data)))
            }
            Ok(None) => Err((StatusCode::NOT_FOUND, "Icon not found".to_string())),
            Err(e) => {
                error!("failed to get app icon: {}", e);
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("failed to get app icon: {}", e),
                ))
            }
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err((
            StatusCode::NOT_IMPLEMENTED,
            "app icon retrieval not supported on this platform".to_string(),
        ))
    }
}

async fn set_window_size(
    State(state): State<ServerState>,
    Json(payload): Json<WindowSizePayload>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("received window size request: {:?}", payload);

    if let Some(window) = state.app_handle.get_webview_window(&payload.title) {
        match window.set_size(tauri::LogicalSize::new(payload.width, payload.height)) {
            Ok(_) => Ok(Json(ApiResponse {
                success: true,
                message: "window size updated successfully".to_string(),
            })),
            Err(e) => {
                error!("failed to set window size: {}", e);
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("failed to set window size: {}", e),
                ))
            }
        }
    } else {
        Err((
            StatusCode::NOT_FOUND,
            format!("window with title '{}' not found", payload.title),
        ))
    }
}

async fn start_sidecar(
    State(state): State<ServerState>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("received request to start sidecar");
    
    let app_handle = state.app_handle.clone();
    match crate::sidecar::spawn_screenpipe(
        app_handle.clone().state::<crate::SidecarState>(),
        app_handle,
    ).await {
        Ok(_) => Ok(Json(ApiResponse {
            success: true,
            message: "sidecar started successfully".to_string(),
        })),
        Err(e) => {
            error!("failed to start sidecar: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to start sidecar: {}", e),
            ))
        }
    }
}

async fn stop_sidecar(
    State(state): State<ServerState>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("received request to stop sidecar");
    
    let app_handle = state.app_handle.clone();
    match crate::sidecar::stop_screenpipe(
        app_handle.clone().state::<crate::SidecarState>(),
        app_handle,
    ).await {
        Ok(_) => Ok(Json(ApiResponse {
            success: true,
            message: "sidecar stopped successfully".to_string(),
        })),
        Err(e) => {
            error!("failed to stop sidecar: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to stop sidecar: {}", e),
            ))
        }
    }
}

pub fn spawn_server(app_handle: tauri::AppHandle, port: u16) -> mpsc::Sender<()> {
    let (tx, mut rx) = mpsc::channel(1);

    tokio::spawn(async move {
        tokio::select! {
            _ = run_server(app_handle, port) => {},
            _ = rx.recv() => {
                info!("Received shutdown signal for server");
            }
        }
    });

    tx
}

/*

curl -X POST http://localhost:11435/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Notification", "body": "This is a test notification body"}'

  curl -X POST http://localhost:11435/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Special Characters: !@#$%^&*()", "body": "Testing with émojis 😀🎉"}'

  curl -X POST http://localhost:11435/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Long Notification", "body": "This is a much longer notification body to test how the system handles larger amounts of text. It might wrap or be truncated depending on the system'\''s limitations."}'

  curl -X POST http://localhost:11435/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Malformed JSON", "body": "This JSON is malformed}'

*/
