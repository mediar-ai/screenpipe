use std::{path::PathBuf, str::FromStr};

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry};
use tauri_nspanel::ManagerExt;
use tracing::{error, info};
#[cfg(target_os = "macos")]
use tauri_nspanel::WebviewWindowExt;


use crate::{store::OnboardingStore, ServerState};

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

    #[cfg(target_os = "macos")]
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

#[derive(Deserialize, Debug)]
pub struct CloseWindowPayload {
    title: String,
}

pub async fn close_window(
    State(state): State<ServerState>,
    Json(payload): Json<CloseWindowPayload>,
) -> Result<Json<ApiResponse>, (StatusCode, String)> {
    info!("received window close request: {:?}", payload);

    if let Some(window) = state.app_handle.get_webview_window(&payload.title) {
        match window.destroy() {
            Ok(_) => Ok(Json(ApiResponse {
                success: true,
                message: "window closed successfully".to_string(),
            })),
            Err(e) => {
                error!("failed to close window: {}", e);
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("failed to close window: {}", e),
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

pub enum RewindWindowId {
    Main,
    Settings,
    Search,
    Onboarding,
}

impl FromStr for RewindWindowId {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "main" => Ok(RewindWindowId::Main),
            "settings" => Ok(RewindWindowId::Settings),
            "search" => Ok(RewindWindowId::Search),
            "onboarding" => Ok(RewindWindowId::Onboarding),
            _ => Ok(RewindWindowId::Main),
        }
    }
}

impl std::fmt::Display for RewindWindowId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RewindWindowId::Main => write!(f, "main"),
            RewindWindowId::Settings => write!(f, "settings"),
            RewindWindowId::Search => write!(f, "search"),
            RewindWindowId::Onboarding => write!(f, "onboarding"),
        }
    }
}

impl RewindWindowId {
    pub fn label(&self) -> &str {
        match self {
            RewindWindowId::Main => "main",
            RewindWindowId::Settings => "settings",
            RewindWindowId::Search => "search",
            RewindWindowId::Onboarding => "onboarding",
        }
    }

    pub fn title(&self) -> &str {
        match self {
            RewindWindowId::Main => "openrewind",
            RewindWindowId::Settings => "settings",
            RewindWindowId::Search => "search",
            RewindWindowId::Onboarding => "onboarding",
        }
    }

    pub fn url(&self) -> &str {
        match self {
            RewindWindowId::Main => "/",
            RewindWindowId::Settings => "/settings",
            RewindWindowId::Search => "/search",
            RewindWindowId::Onboarding => "/onboarding",
        }
    }

    pub fn min_size(&self) -> Option<(f64, f64)> {
        Some(match self {
            RewindWindowId::Main => (1200.0, 850.0),
            RewindWindowId::Settings => (1200.0, 850.0),
            RewindWindowId::Search => (1200.0, 850.0),
            RewindWindowId::Onboarding => (1000.0, 640.0),
        })
    }

    pub fn get(&self, app: &AppHandle<Wry>) -> Option<WebviewWindow> {
        let label = self.label();
        app.get_webview_window(&label)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone,specta::Type)]
pub enum ShowRewindWindow {
    Main,
    Settings { page: Option<String> },
    Search { query: Option<String> },
    Onboarding,
}

impl ShowRewindWindow {
    fn window_builder<'a>(
        &'a self,
        app: &'a AppHandle<Wry>,
        url: impl Into<PathBuf>,
    ) -> WebviewWindowBuilder<'a, Wry, AppHandle<Wry>> {
        let id = self.id();

        let mut builder = WebviewWindow::builder(app, id.label(), WebviewUrl::App(url.into()))
            .title(id.title())
            .visible(true)
            .accept_first_mouse(true)
            .shadow(true);

        // This is for windows to have minimum size
        // if let Some(min) = id.min_size() {
        //     builder = builder
        //         .inner_size(min.0, min.1)
        //         .min_inner_size(min.0, min.1);
        // }

        #[cfg(target_os = "macos")]
        {
            builder = builder
                .hidden_title(true)
                .title_bar_style(tauri::TitleBarStyle::Overlay);
        }

        #[cfg(target_os = "windows")]
        {
            // builder = builder.decorations(false);
            builder = builder
        }

        builder
    }

    pub fn id(&self) -> RewindWindowId {
        match self {
            ShowRewindWindow::Main => RewindWindowId::Main,
            ShowRewindWindow::Settings { page: _ } => RewindWindowId::Settings,
            ShowRewindWindow::Search { query: _ } => RewindWindowId::Search,
            ShowRewindWindow::Onboarding => RewindWindowId::Onboarding,
        }
    }

    pub fn metadata(&self) -> Option<String> {
        match self {
            ShowRewindWindow::Main => None,
            ShowRewindWindow::Settings { page: _ } => None,
            ShowRewindWindow::Search { query } => Some(query.clone().unwrap_or_default().to_string()),
            ShowRewindWindow::Onboarding => None,
        }
    }

    pub fn show(&self, app: &AppHandle) -> tauri::Result<WebviewWindow> {
        let id = self.id();
        let onboarding_store = OnboardingStore::get(app)
            .unwrap_or_else(|_| None)
            .unwrap_or_default();

        if let Some(window) = id.get(app) {


            if id.label() == RewindWindowId::Main.label() {
                    info!("showing panel");
                    let app_clone = app.clone();
                    app.run_on_main_thread(move || {
                        if let Ok(panel) = app_clone.get_webview_panel(RewindWindowId::Main.label()) {
                            panel.show();
                        }
                    }).ok();
                    return Ok(window);
            }

            if id.label() == RewindWindowId::Onboarding.label() {
                if onboarding_store.is_completed {
                    return ShowRewindWindow::Main.show(app);
                }
            }

            if id.label() == RewindWindowId::Search.label() {
                if let Some(query) = self.metadata() {
                    let _ = window.eval(&format!("window.location.replace(`/search/{}`);", query)).ok();
                }
                window.show().ok();
                return Ok(window);
            }

                 
            info!("showing window: {:?}", id.label());

            window.show().ok();
            return Ok(window);
        }

        info!("showing window: {:?} (not found)", id.label());


        let window = match self {
            ShowRewindWindow::Main => {

                if !onboarding_store.is_completed {
                    return ShowRewindWindow::Onboarding.show(app);
                }
                
                let monitor = app.primary_monitor().unwrap().unwrap();
                let size = monitor.size();
                let builder = self.window_builder(app, "/").hidden_title(true).visible_on_all_workspaces(true).always_on_top(true).decorations(false).skip_taskbar(true).focused(false).transparent(true).visible(false).inner_size(size.width as f64, size.height as f64);
                let window = builder.build()?;

                #[cfg(target_os = "macos")]
                {
                    // Convert to panel on macOS to prevent animations - do this after window creation
                    if let Ok(_panel) = window.to_panel() {
                        info!("Successfully converted main window to panel");
                        
                        // Set panel behaviors on main thread to avoid crashes
                        let window_clone = window.clone();
                        app.run_on_main_thread(move || {
                            use tauri_nspanel::cocoa::appkit::{NSWindowCollectionBehavior};
                            
                            if let Ok(panel) = window_clone.to_panel() {
                                panel.set_level(26);

                                panel.released_when_closed(true);

                                panel.set_style_mask(0);

                                panel.set_collection_behaviour(
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
                                );
                            }
                        }).ok();
                    } else {
                        error!("Failed to convert main window to panel");
                    }
                }

                // Add event listener to hide window when it loses focus
                let app_clone = app.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(is_focused) = event {
                        if !is_focused {
                            info!("Main window lost focus, hiding window");
                            
                            // #[cfg(target_os = "macos")]
                            // {
                            //     let value = app_clone.clone();
                            //     app_clone.run_on_main_thread(move || {
                            //         if let Ok(panel) = value.get_webview_panel(RewindWindowId::Main.label()) {
                            //             panel.order_out(None);
                            //         }


                            //     }).ok();   
                            // }

                            // #[cfg(not(target_os = "macos"))]
                            // {
                            //     let _ = window.hide();
                            // }

                            let _ = app_clone.emit("window-focused", false).ok();
                        }else{
                            let _ = app_clone.emit("window-focused", true).ok();
                        }
                    }
                });

                window
            }
            ShowRewindWindow::Settings {  page: _  } => {
                let builder = self.window_builder(app, "/settings").hidden_title(true).focused(true);
                let window = builder.build()?;
                window
            }
            ShowRewindWindow::Search { query } => {
                let mut url = "/search".to_string();
                info!("query: {:?}", query);
                if let Some(q) = query {
                    // Simple URL encoding for the query parameter
                    // let encoded_query = q.replace(' ', "%20").replace('#', "%23").replace('&', "%26");
                    url.push_str(&format!("{}", q));
                }
                let builder = self.window_builder(app, url).hidden_title(true).focused(true);

                let window = builder.build()?;
                window
            }
            ShowRewindWindow::Onboarding => {
                if onboarding_store.is_completed {
                    return ShowRewindWindow::Main.show(app);
                }

                let builder = self.window_builder(app, "/onboarding").visible_on_all_workspaces(true).inner_size(1000.0, 850.0).minimizable(false).maximizable(false).focused(true);
                let window = builder.build()?;

                window
            }
        };

     
        Ok(window)
    }

    pub fn close(&self, app: &AppHandle) -> tauri::Result<()> {
        let id = self.id();
        if id.label() == RewindWindowId::Main.label() {
            #[cfg(target_os = "macos")]
            {
                let app_clone = app.clone();
                app.run_on_main_thread(move || {
                    if let Ok(panel) = app_clone.get_webview_panel(RewindWindowId::Main.label()) {
                        panel.order_out(None);
                    }
                }).ok();
            }

            #[cfg(not(target_os = "macos"))]
            {
        if let Some(window) = id.get(app) {
            window.close().ok();
        }
            }
            
            return Ok(());
        }

        // if id.label() == RewindWindowId::Onboarding.label() {
        //     if let Some(window) = id.get(app) {
        //         window.destroy().ok();
        //     }
        //     return Ok(());
        // }

        if let Some(window) = id.get(app) {
            window.close().ok();
        }
        Ok(())
    }

    pub fn set_size(&self, app: &AppHandle, width: f64, height: f64) -> tauri::Result<()> {
        let size = Size::Logical(LogicalSize::new(width, height));
        let id = self.id();
        if let Some(window) = id.get(app) {
            window.set_size(size).ok();
        }
        Ok(())
    }
}
