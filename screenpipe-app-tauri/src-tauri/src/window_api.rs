use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tracing::{error, info};

use crate::ServerState;

#[derive(Deserialize, Debug)]
pub struct OpenLocalPathPayload {
    path: String,
    port: u16,
    title: String,
    width: f64,
    height: f64,
    x: Option<i32>,
    y: Option<i32>,
    always_on_top: Option<bool>,
    transparent: Option<bool>,
    decorations: Option<bool>,
    hidden_title: Option<bool>,
    is_focused: Option<bool>,
    visible_on_all_workspaces: Option<bool>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    success: bool,
    message: String,
}

pub async fn show_specific_window(
    State(state): State<ServerState>,
    Json(payload): Json<OpenLocalPathPayload>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("opening local path: {}", payload.path);

    // Close existing window if it exists
    if let Some(existing_window) = state.app_handle.get_webview_window(&payload.title) {
        if let Err(e) = existing_window.destroy() {
            error!("failed to close existing window: {}", e);
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
    #[cfg(target_os = "macos")]
    let _ = state
        .app_handle
        .set_activation_policy(tauri::ActivationPolicy::Accessory);
    let url = format!("http://localhost:{}{}", payload.port, payload.path);
    let mut builder = tauri::WebviewWindowBuilder::new(
        &state.app_handle,
        &payload.title,
        tauri::WebviewUrl::External(url.parse().unwrap()),
    )
    .title(&payload.title)
    .transparent(payload.transparent.unwrap_or(true))
    .decorations(payload.decorations.unwrap_or(false))
    .focused(payload.is_focused.unwrap_or(true))
    .inner_size(payload.width, payload.height)
    .always_on_top(payload.always_on_top.unwrap_or(true))
    .visible_on_all_workspaces(payload.visible_on_all_workspaces.unwrap_or(true));

    #[cfg(not(target_os = "linux"))]
    {
        builder = builder.hidden_title(payload.hidden_title.unwrap_or(true));
    }

    let window = builder.build();

    match window {
        Ok(window) => {
            // Set position if provided
            if let (Some(x), Some(y)) = (payload.x, payload.y) {
                let _ = window
                    .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            }

            if let Err(e) = window.show() {
                error!("failed to show window: {}", e);
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("failed to show window: {}", e),
                ));
            }

            Ok(Json(ApiResponse {
                success: true,
                message: "window opened successfully".to_string(),
            }))
        }
        Err(e) => {
            error!("failed to create window: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to create window: {}", e),
            ))
        }
    }
}
