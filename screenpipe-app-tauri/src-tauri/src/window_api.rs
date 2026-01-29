use std::{path::PathBuf, str::FromStr};

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry};
#[cfg(target_os = "macos")]
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
    Chat,
    PermissionRecovery,
}

impl FromStr for RewindWindowId {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "main" => Ok(RewindWindowId::Main),
            "settings" => Ok(RewindWindowId::Settings),
            "search" => Ok(RewindWindowId::Search),
            "onboarding" => Ok(RewindWindowId::Onboarding),
            "chat" => Ok(RewindWindowId::Chat),
            "permission-recovery" => Ok(RewindWindowId::PermissionRecovery),
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
            RewindWindowId::Chat => write!(f, "chat"),
            RewindWindowId::PermissionRecovery => write!(f, "permission-recovery"),
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
            RewindWindowId::Chat => "chat",
            RewindWindowId::PermissionRecovery => "permission-recovery",
        }
    }

    pub fn title(&self) -> &str {
        match self {
            RewindWindowId::Main => "screenpipe",
            RewindWindowId::Settings => "settings",
            RewindWindowId::Search => "search",
            RewindWindowId::Onboarding => "onboarding",
            RewindWindowId::Chat => "ai chat",
            RewindWindowId::PermissionRecovery => "fix permissions",
        }
    }

    pub fn min_size(&self) -> Option<(f64, f64)> {
        Some(match self {
            RewindWindowId::Main => (1200.0, 850.0),
            RewindWindowId::Settings => (1200.0, 850.0),
            RewindWindowId::Search => (1200.0, 850.0),
            RewindWindowId::Onboarding => (900.0, 800.0),
            RewindWindowId::Chat => (500.0, 600.0),
            RewindWindowId::PermissionRecovery => (500.0, 400.0),
        })
    }

    pub fn get(&self, app: &AppHandle<Wry>) -> Option<WebviewWindow> {
        let label = self.label();
        app.get_webview_window(&label)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, specta::Type)]
pub enum ShowRewindWindow {
    Main,
    Settings { page: Option<String> },
    Search { query: Option<String> },
    Onboarding,
    Chat,
    PermissionRecovery,
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

        // Set minimum size for windows
        if let Some(min) = id.min_size() {
            builder = builder
                .inner_size(min.0, min.1)
                .min_inner_size(min.0, min.1);
        }

        #[cfg(target_os = "macos")]
        {
            builder = builder
                .hidden_title(true)
                .title_bar_style(tauri::TitleBarStyle::Overlay);
        }

        #[cfg(target_os = "windows")]
        {
            // Windows needs explicit decorations for non-overlay windows
            builder = builder.decorations(true);
        }

        builder
    }

    pub fn id(&self) -> RewindWindowId {
        match self {
            ShowRewindWindow::Main => RewindWindowId::Main,
            ShowRewindWindow::Settings { page: _ } => RewindWindowId::Settings,
            ShowRewindWindow::Search { query: _ } => RewindWindowId::Search,
            ShowRewindWindow::Onboarding => RewindWindowId::Onboarding,
            ShowRewindWindow::Chat => RewindWindowId::Chat,
            ShowRewindWindow::PermissionRecovery => RewindWindowId::PermissionRecovery,
        }
    }

    pub fn metadata(&self) -> Option<String> {
        match self {
            ShowRewindWindow::Main => None,
            ShowRewindWindow::Settings { page: _ } => None,
            ShowRewindWindow::Search { query } => Some(query.clone().unwrap_or_default().to_string()),
            ShowRewindWindow::Onboarding => None,
            ShowRewindWindow::Chat => None,
            ShowRewindWindow::PermissionRecovery => None,
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
                    #[cfg(target_os = "macos")]
                    {
                        // CRITICAL: Set Accessory activation policy BEFORE showing the panel
                        // This is required for the panel to appear above fullscreen apps on macOS
                        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                        let app_clone = app.clone();
                        app.run_on_main_thread(move || {
                            use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;
                            use tauri_nspanel::cocoa::appkit::{NSEvent, NSScreen};
                            use tauri_nspanel::cocoa::base::{id, nil};
                            use tauri_nspanel::cocoa::foundation::{NSArray, NSPoint, NSRect};

                            if let Ok(panel) = app_clone.get_webview_panel(RewindWindowId::Main.label()) {
                                use objc::{msg_send, sel, sel_impl};

                                // Get mouse cursor position and find the screen it's on
                                unsafe {
                                    let mouse_location: NSPoint = NSEvent::mouseLocation(nil);
                                    let screens: id = NSScreen::screens(nil);
                                    let screen_count: u64 = NSArray::count(screens);

                                    let mut target_screen: id = nil;
                                    for i in 0..screen_count {
                                        let screen: id = NSArray::objectAtIndex(screens, i);
                                        let frame: NSRect = NSScreen::frame(screen);

                                        // Check if mouse is within this screen's bounds
                                        // Note: macOS uses bottom-left origin, so we check accordingly
                                        if mouse_location.x >= frame.origin.x
                                            && mouse_location.x < frame.origin.x + frame.size.width
                                            && mouse_location.y >= frame.origin.y
                                            && mouse_location.y < frame.origin.y + frame.size.height
                                        {
                                            target_screen = screen;
                                            break;
                                        }
                                    }

                                    // If we found the screen with cursor, resize and reposition panel to it
                                    if target_screen != nil {
                                        let frame: NSRect = NSScreen::frame(target_screen);
                                        info!("Moving panel to screen at ({}, {}), size {}x{}",
                                            frame.origin.x, frame.origin.y, frame.size.width, frame.size.height);

                                        // Resize and reposition the panel to cover the target screen
                                        let _: () = msg_send![&*panel, setFrame:frame display:true];
                                    }
                                }

                                // Re-apply window level each time we show to ensure it stays above fullscreen
                                // CGShieldingWindowLevel (1000) + 1 ensures it appears above everything
                                panel.set_level(1001);

                                // Disable window dragging by clicking on background
                                let _: () = unsafe { msg_send![&*panel, setMovableByWindowBackground: false] };

                                // Re-apply collection behaviors
                                panel.set_collection_behaviour(
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces |
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle |
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary |
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                                );

                                // Use order_front_regardless to show above fullscreen apps without switching spaces
                                panel.order_front_regardless();
                            }
                        }).ok();
                    }
                    #[cfg(target_os = "windows")]
                    {
                        window.show().ok();
                        // Re-assert topmost position to ensure we're above the taskbar
                        if let Err(e) = crate::windows_overlay::bring_to_front(&window) {
                            error!("Failed to bring window to front: {}", e);
                        }
                    }
                    #[cfg(target_os = "linux")]
                    {
                        window.show().ok();
                    }
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

            // Chat window needs panel behavior on macOS to show above fullscreen
            if id.label() == RewindWindowId::Chat.label() {
                #[cfg(target_os = "macos")]
                {
                    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                    let app_clone = app.clone();
                    app.run_on_main_thread(move || {
                        use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;
                        use objc::{msg_send, sel, sel_impl};

                        if let Ok(panel) = app_clone.get_webview_panel(RewindWindowId::Chat.label()) {
                            // Level 1002 = above timeline overlay (1001), so chat appears on top
                            panel.set_level(1002);
                            // Enable dragging by clicking anywhere on the window background
                            let _: () = unsafe { msg_send![&*panel, setMovableByWindowBackground: true] };
                            panel.set_collection_behaviour(
                                NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces |
                                NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
                            );
                            panel.order_front_regardless();
                        }
                    }).ok();

                    return Ok(window);
                }

                #[cfg(not(target_os = "macos"))]
                {
                    window.show().ok();
                    return Ok(window);
                }
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

                // macOS uses fullscreen transparent panel overlay
                #[cfg(target_os = "macos")]
                let window = {
                    // CRITICAL: Set Accessory activation policy BEFORE creating the panel
                    // This is required for the panel to appear above fullscreen apps on macOS
                    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                    // Use cursor position to find the correct monitor (not primary)
                    let (monitor, position) = {
                        use tauri_nspanel::cocoa::appkit::{NSEvent, NSScreen};
                        use tauri_nspanel::cocoa::base::{id, nil};
                        use tauri_nspanel::cocoa::foundation::{NSArray, NSPoint, NSRect};

                        unsafe {
                            let mouse_location: NSPoint = NSEvent::mouseLocation(nil);
                            let screens: id = NSScreen::screens(nil);
                            let screen_count: u64 = NSArray::count(screens);

                            let mut target_monitor = app.primary_monitor().unwrap().unwrap();
                            let mut target_position = (0.0_f64, 0.0_f64);

                            for i in 0..screen_count {
                                let screen: id = NSArray::objectAtIndex(screens, i);
                                let frame: NSRect = NSScreen::frame(screen);

                                if mouse_location.x >= frame.origin.x
                                    && mouse_location.x < frame.origin.x + frame.size.width
                                    && mouse_location.y >= frame.origin.y
                                    && mouse_location.y < frame.origin.y + frame.size.height
                                {
                                    // Found the screen with cursor - use its position and size
                                    target_position = (frame.origin.x, frame.origin.y);
                                    // Find matching Tauri monitor
                                    if let Ok(monitors) = app.available_monitors() {
                                        for mon in monitors {
                                            let pos = mon.position();
                                            // macOS uses bottom-left origin, Tauri uses top-left
                                            // Match by x position and approximate y
                                            if (pos.x as f64 - frame.origin.x).abs() < 10.0 {
                                                target_monitor = mon;
                                                break;
                                            }
                                        }
                                    }
                                    break;
                                }
                            }

                            (target_monitor, target_position)
                        }
                    };

                    let logical_size = monitor.size().to_logical(monitor.scale_factor());
                    let builder = self.window_builder(app, "/")
                        .visible_on_all_workspaces(true)
                        .always_on_top(true)
                        .decorations(false)
                        .skip_taskbar(true)
                        .focused(false)
                        .transparent(true)
                        .visible(false)
                        .hidden_title(true)
                        .inner_size(logical_size.width, logical_size.height)
                        .max_inner_size(logical_size.width, logical_size.height)
                        .position(position.0, position.1);
                    builder.build()?
                };

                // Windows uses a fullscreen transparent overlay with Win32 click-through
                #[cfg(target_os = "windows")]
                let window = {
                    // Use cursor position to find the correct monitor
                    let monitor = app.cursor_position()
                        .ok()
                        .and_then(|cursor| {
                            app.available_monitors().ok().and_then(|monitors| {
                                monitors.into_iter().find(|m| {
                                    let pos = m.position();
                                    let size = m.size();
                                    cursor.x >= pos.x as f64
                                        && cursor.x < (pos.x + size.width as i32) as f64
                                        && cursor.y >= pos.y as f64
                                        && cursor.y < (pos.y + size.height as i32) as f64
                                })
                            })
                        })
                        .or_else(|| app.primary_monitor().ok().flatten())
                        .unwrap();

                    let position = monitor.position();
                    let logical_size = monitor.size().to_logical(monitor.scale_factor());
                    let builder = self.window_builder(app, "/")
                        .title("screenpipe")
                        .visible_on_all_workspaces(true)
                        .always_on_top(true)
                        .decorations(false)
                        .skip_taskbar(true)
                        .focused(true)
                        .transparent(true)
                        .visible(false)
                        .drag_and_drop(false)
                        .inner_size(logical_size.width, logical_size.height)
                        .max_inner_size(logical_size.width, logical_size.height)
                        .position(position.x as f64, position.y as f64);
                    let win = builder.build()?;

                    // Setup Win32 overlay with click-through disabled so user can interact
                    if let Err(e) = crate::windows_overlay::setup_overlay(&win, false) {
                        error!("Failed to setup Windows overlay: {}", e);
                    }

                    win
                };

                // Linux uses a normal decorated window (overlay not yet implemented)
                #[cfg(target_os = "linux")]
                let window = {
                    let builder = self.window_builder(app, "/")
                        .title("screenpipe")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(800.0, 600.0)
                        .decorations(true)
                        .visible(true)
                        .focused(true);
                    builder.build()?
                };

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
                                use objc::{msg_send, sel, sel_impl};

                                // Use a very high window level to appear above fullscreen apps
                                // CGShieldingWindowLevel (1000) + 1 ensures it appears above everything including fullscreen
                                panel.set_level(1001);

                                panel.released_when_closed(true);

                                panel.set_style_mask(0);

                                // Disable window dragging by clicking on background
                                let _: () = unsafe { msg_send![&*panel, setMovableByWindowBackground: false] };

                                panel.set_collection_behaviour(
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces |
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle |
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary |
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                                );
                            }
                        }).ok();
                    } else {
                        error!("Failed to convert main window to panel");
                    }
                }

                // Add event listener to hide window when it loses focus and handle display changes
                let app_clone = app.clone();
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::Focused(is_focused) => {
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
                            } else {
                                let _ = app_clone.emit("window-focused", true).ok();
                            }
                        }
                        tauri::WindowEvent::ScaleFactorChanged { scale_factor: _, new_inner_size: _,.. } => {
                            // Handle display resolution/scale changes
                            let monitor = window_clone.app_handle().primary_monitor().unwrap().unwrap();
                            let scale_factor = monitor.scale_factor();
                            let size = monitor.size().to_logical::<f64>(scale_factor);
                            info!("Display scale factor changed, updating window size {:?}", size.clone());
                            let _ = window_clone.set_size(tauri::Size::Logical(size.clone())); 
                        }
                        _ => {}
                    }
                });

                window
            }
            ShowRewindWindow::Settings { page } => {
                let url = match page {
                    Some(p) => format!("/settings?section={}", p),
                    None => "/settings".to_string(),
                };
                let builder = self.window_builder(app, &url).focused(true);
                #[cfg(target_os = "macos")]
                let builder = builder.hidden_title(true);
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

                let builder = self.window_builder(app, url.clone()).focused(true);
                #[cfg(target_os = "macos")]
                let builder = builder.hidden_title(true);
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
            ShowRewindWindow::Chat => {
                // macOS: use NSPanel for fullscreen support
                #[cfg(target_os = "macos")]
                let window = {
                    // Set Accessory policy so panel can appear above fullscreen apps
                    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                    let builder = self.window_builder(app, "/chat")
                        .inner_size(500.0, 650.0)
                        .min_inner_size(400.0, 500.0)
                        .focused(true)
                        .always_on_top(true)
                        .visible_on_all_workspaces(true)
                        .hidden_title(true);
                    let window = builder.build()?;

                    // Convert to panel for fullscreen support
                    if let Ok(_panel) = window.to_panel() {
                        info!("Successfully converted chat window to panel");

                        let window_clone = window.clone();
                        app.run_on_main_thread(move || {
                            use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;
                            use objc::{msg_send, sel, sel_impl};

                            if let Ok(panel) = window_clone.to_panel() {
                                // Level 1002 = above timeline overlay (1001), so chat appears on top
                                panel.set_level(1002);

                                // Enable dragging by clicking anywhere on the window background
                                let _: () = unsafe { msg_send![&*panel, setMovableByWindowBackground: true] };

                                panel.set_collection_behaviour(
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces |
                                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
                                );

                                panel.order_front_regardless();
                            }
                        }).ok();
                    }

                    window
                };

                #[cfg(not(target_os = "macos"))]
                let window = {
                    let builder = self.window_builder(app, "/chat")
                        .inner_size(500.0, 650.0)
                        .min_inner_size(400.0, 500.0)
                        .focused(true)
                        .always_on_top(true);
                    builder.build()?
                };

                window
            }
            ShowRewindWindow::PermissionRecovery => {
                let builder = self.window_builder(app, "/permission-recovery")
                    .inner_size(500.0, 450.0)
                    .min_inner_size(450.0, 400.0)
                    .resizable(false)
                    .focused(true)
                    .always_on_top(true)
                    .center();
                #[cfg(target_os = "macos")]
                let builder = builder.hidden_title(true);
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

                // Reset to Regular activation policy when hiding the panel
                // so other windows (like Settings) work normally
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
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
