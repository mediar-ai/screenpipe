use crate::{window_api::ShowRewindWindow, store::OnboardingStore, store::SettingsStore, parse_shortcut};
use tauri::{Manager, Emitter};
use tracing::{error, info, warn, debug};

#[tauri::command]
#[specta::specta]
pub fn write_browser_log(level: String, message: String) {
    match level.as_str() {
        "error" => error!("[webview] {}", message),
        "warn" => warn!("[webview] {}", message),
        "debug" => debug!("[webview] {}", message),
        _ => info!("[webview] {}", message),
    }
}



#[tauri::command]
#[specta::specta]
pub fn set_tray_unhealth_icon(app_handle: tauri::AppHandle) {
    if let Some(main_tray) = app_handle.tray_by_id("screenpipe_main") {
        let _ = main_tray.set_icon(Some(
            tauri::image::Image::from_path("icons/screenpipe-logo-tray-failed.png").unwrap(),
        ));
    }
}

#[tauri::command]
#[specta::specta]
pub fn set_tray_health_icon(app_handle: tauri::AppHandle) {
    if let Some(main_tray) = app_handle.tray_by_id("screenpipe_main") {
        let _ = main_tray.set_icon(Some(
            tauri::image::Image::from_path("icons/screenpipe-logo-tray-black.png").unwrap(),
        ));
    }
}

#[tauri::command]
#[specta::specta]
pub fn show_main_window(app_handle: &tauri::AppHandle, _overlay: bool) {
   info!("show_main_window called, attempting to show Main window");

   // Close Settings window if open to avoid confusion (Main overlay is transparent
   // and Settings would show through, making it look like Settings is being toggled)
   let _ = ShowRewindWindow::Settings { page: None }.close(app_handle);

   match ShowRewindWindow::Main.show(app_handle) {
       Ok(window) => {
           info!("ShowRewindWindow::Main.show succeeded, window label: {}", window.label());
           // Don't call set_focus() on macOS as it causes space switching
           // The panel's order_front_regardless() already handles visibility
           #[cfg(not(target_os = "macos"))]
           if let Err(e) = window.set_focus() {
               error!("Failed to set focus on main window: {}", e);
           }

           // Register window-specific shortcuts (Escape, Ctrl+Cmd+K) on a separate task
           // IMPORTANT: This MUST be spawned async to avoid deadlock when called from
           // within a global shortcut callback (the callback holds the shortcut manager lock)
           let app_clone = app_handle.clone();
           std::thread::spawn(move || {
               // Small delay to ensure we're outside the shortcut callback context
               std::thread::sleep(std::time::Duration::from_millis(10));
               let _ = register_window_shortcuts(app_clone);
           });
       }
       Err(e) => {
           error!("ShowRewindWindow::Main.show failed: {}", e);
       }
   }
}

#[tauri::command]
#[specta::specta]
pub fn hide_main_window(app_handle: &tauri::AppHandle) {
    // Unregister window-specific shortcuts (Escape, Ctrl+Cmd+K) on a separate task
    // IMPORTANT: This MUST be spawned async to avoid deadlock when called from
    // within a global shortcut callback (e.g., Escape key handler)
    let app_clone = app_handle.clone();
    std::thread::spawn(move || {
        // Small delay to ensure we're outside the shortcut callback context
        std::thread::sleep(std::time::Duration::from_millis(10));
        let _ = unregister_window_shortcuts(app_clone);
    });

    ShowRewindWindow::Main.close(app_handle).unwrap();
}

/// Enable click-through mode on the main overlay window (Windows only)
/// When enabled, mouse events pass through to windows below
#[tauri::command]
#[specta::specta]
pub fn enable_overlay_click_through(_app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(window) = _app_handle.get_webview_window("main") {
            crate::windows_overlay::enable_click_through(&window)?;
        }
    }
    Ok(())
}

/// Disable click-through mode on the main overlay window (Windows only)
/// When disabled, the overlay receives mouse events normally
#[tauri::command]
#[specta::specta]
pub fn disable_overlay_click_through(_app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(window) = _app_handle.get_webview_window("main") {
            crate::windows_overlay::disable_click_through(&window)?;
        }
    }
    Ok(())
}

/// Check if click-through is currently enabled (Windows only)
#[tauri::command]
#[specta::specta]
pub fn is_overlay_click_through(_app_handle: tauri::AppHandle) -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Some(window) = _app_handle.get_webview_window("main") {
            return crate::windows_overlay::is_click_through_enabled(&window);
        }
    }
    false
}

#[cfg(target_os = "windows")]
const DEFAULT_SHORTCUT: &str = "Alt+S";
#[cfg(not(target_os = "windows"))]
const DEFAULT_SHORTCUT: &str = "Control+Super+S";

#[tauri::command(rename_all = "snake_case")]
#[specta::specta]
pub fn update_show_screenpipe_shortcut(
    app_handle: tauri::AppHandle,
    new_shortcut: String,
    enabled: bool,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    // Unregister all existing shortcuts
    if let Err(e) = app_handle.global_shortcut().unregister_all() {
        info!("failed to unregister shortcuts: {}", e);
        // Continue execution to try setting the default shortcut
    }

    // Try to parse the new shortcut, fall back to default if it fails
    let shortcut_str = match new_shortcut.parse::<Shortcut>() {
        Ok(_s) => new_shortcut,
        Err(e) => {
            info!(
                "invalid shortcut '{}': {}, falling back to default",
                new_shortcut, e
            );
            DEFAULT_SHORTCUT.to_string()
        }
    };

    // Parse the shortcut string (will be either new_shortcut or default)
    let show_window_shortcut = match shortcut_str.parse::<Shortcut>() {
        Ok(s) => s,
        Err(e) => {
            return Err(format!("failed to parse shortcut: {}", e));
        }
    };

    if !enabled {
        let _ = app_handle
            .global_shortcut()
            .unregister(show_window_shortcut);

        return Ok(());
    }

    // Register the new shortcut
    if let Err(e) = app_handle.global_shortcut().on_shortcut(
        show_window_shortcut,
        move |app_handle, _event, _shortcut| {
            show_main_window(app_handle, true);
        },
    ) {
        info!("failed to register shortcut: {}", e);

        // Try to register the default shortcut as fallback
        if let Ok(default_shortcut) = DEFAULT_SHORTCUT.parse::<Shortcut>() {
            let _ = app_handle.global_shortcut().on_shortcut(
                default_shortcut,
                move |app_handle, _event, _shortcut| {
                    show_main_window(app_handle, true);
                },
            );
        }

        return Err("failed to set shortcut, reverted to default".to_string());
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn open_pipe_window(
    app_handle: tauri::AppHandle,
    port: u16,
    title: String,
) -> Result<(), String> {
    // Close existing window if it exists
    if let Some(existing_window) = app_handle.get_webview_window(&title) {
        if let Err(e) = existing_window.destroy() {
            error!("failed to destroy existing window: {}", e);
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    let window = match tauri::WebviewWindowBuilder::new(
        &app_handle,
        &title,
        tauri::WebviewUrl::External(format!("http://localhost:{}", port).parse().unwrap()),
    )
    .title(title)
    .inner_size(1200.0, 850.0)
    .min_inner_size(600.0, 400.0)
    .focused(true)
    .fullscreen(false)
    .build()
    {
        Ok(window) => window,
        Err(e) => {
            error!("failed to create window: {}", e);
            return Err(format!("failed to create window: {}", e));
        }
    };

    // flag to prevent infinite loop
    let is_closing = std::sync::Arc::new(std::sync::Mutex::new(false));
    let is_closing_clone = std::sync::Arc::clone(&is_closing);

    // event listener for the window close event
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let mut is_closing = is_closing_clone.lock().unwrap();
            if *is_closing {
                return;
            }
            *is_closing = true;
            if window_clone.is_fullscreen().unwrap_or(false) {
                let _ = window_clone.destroy().unwrap();
            } else {
                api.prevent_close();
                let _ = window_clone.close().unwrap();
            }
        }
    });

    // Only try to manipulate window if creation succeeded
    if let Err(e) = window.set_focus() {
        error!("failed to set window focus: {}", e);
    }
    if let Err(e) = window.show() {
        error!("failed to show window: {}", e);
    }

    #[cfg(target_os = "macos")]
    if let Err(e) = app_handle.set_activation_policy(tauri::ActivationPolicy::Regular) {
        error!("failed to set activation policy: {}", e);
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_disk_usage(
    _app_handle: tauri::AppHandle,
    force_refresh: Option<bool>,
) -> Result<serde_json::Value, String> {
    // Always use ~/.screenpipe as the primary data directory
    // This is where the sidecar/CLI stores data, which is the main data source
    let screenpipe_dir_path = dirs::home_dir()
        .ok_or_else(|| "Could not get home directory".to_string())?
        .join(".screenpipe");
    
    match crate::disk_usage::disk_usage(&screenpipe_dir_path, force_refresh.unwrap_or(false)).await {
        Ok(Some(disk_usage)) => match serde_json::to_value(&disk_usage) {
            Ok(json_value) => Ok(json_value),
            Err(e) => {
                error!("Failed to serialize disk usage: {}", e);
                Err(format!("Failed to serialize disk usage: {}", e))
            }
        },
        Ok(None) => Err("No disk usage data found".to_string()),
        Err(e) => {
            error!("Failed to get disk usage: {}", e);
            Err(format!("Failed to get disk usage: {}", e))
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn show_window(
    app_handle: tauri::AppHandle,
    window: ShowRewindWindow,
) -> Result<(), String> {
    // Close Main window when opening other windows, EXCEPT for Chat
    // Chat is designed to overlay on top of Main (level 1002 vs 1001)
    if window.id().label() != ShowRewindWindow::Main.id().label()
        && window.id().label() != ShowRewindWindow::Chat.id().label()
    {
        ShowRewindWindow::Main.close(&app_handle).map_err(|e| e.to_string())?;
    }

    window.show(&app_handle).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn close_window(
    app_handle: tauri::AppHandle,
    window: ShowRewindWindow,
) -> Result<(), String> {
    // Emit window-hidden event so React components can clean up
    let _ = app_handle.emit("window-hidden", ());
    window.close(&app_handle).map_err(|e| e.to_string())?;
    Ok(())
}

// Permission recovery command
#[tauri::command]
#[specta::specta]
pub async fn show_permission_recovery_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    ShowRewindWindow::PermissionRecovery
        .show(&app_handle)
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Onboarding commands
#[tauri::command]
#[specta::specta]
pub async fn get_onboarding_status(app_handle: tauri::AppHandle) -> Result<OnboardingStore, String> {
    OnboardingStore::get(&app_handle).map(|o| o.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn complete_onboarding(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Update the persistent store
    OnboardingStore::update(&app_handle, |onboarding| {
        onboarding.complete();
    }).map_err(|e| e.to_string())?;
    
    // Update the managed state in memory
    if let Some(managed_store) = app_handle.try_state::<OnboardingStore>() {
        // Get the current state and create an updated version
        let mut updated_store = managed_store.inner().clone();
        updated_store.complete();
        // Replace the managed state with the updated version
        app_handle.manage(updated_store);
    }
    
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    close_window(app_handle.clone(), ShowRewindWindow::Onboarding).await?;
    show_window(app_handle.clone(), ShowRewindWindow::Main).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn reset_onboarding(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Update the persistent store
    OnboardingStore::update(&app_handle, |onboarding| {
        onboarding.reset();
    })?;

    // Update the managed state in memory
    if let Some(managed_store) = app_handle.try_state::<OnboardingStore>() {
        // Get the current state and create an updated version
        let mut updated_store = managed_store.inner().clone();
        updated_store.reset();
        // Replace the managed state with the updated version
        app_handle.manage(updated_store);
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_onboarding_step(app_handle: tauri::AppHandle, step: String) -> Result<(), String> {
    OnboardingStore::update(&app_handle, |onboarding| {
        onboarding.current_step = Some(step);
    })?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn show_onboarding_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    ShowRewindWindow::Onboarding.show(&app_handle).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_window_size(app_handle: tauri::AppHandle, window: ShowRewindWindow, width: f64, height: f64) -> Result<(), String> {
    window.set_size(&app_handle, width, height).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn open_search_window(app_handle: tauri::AppHandle, query: Option<String>) -> Result<(), String> {
    ShowRewindWindow::Main.close(&app_handle).map_err(|e| e.to_string())?;
    ShowRewindWindow::Search { query }.show(&app_handle).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn show_shortcut_reminder(
    app_handle: tauri::AppHandle,
    shortcut: String,
) -> Result<(), String> {
    use tauri::{Emitter, WebviewWindowBuilder};

    let label = "shortcut-reminder";

    info!("show_shortcut_reminder called");

    // If window exists, just show it and update shortcut
    if let Some(window) = app_handle.get_webview_window(label) {
        info!("shortcut-reminder window exists, showing and focusing");
        let _ = app_handle.emit_to(label, "shortcut-reminder-update", &shortcut);
        let _ = window.show();
        return Ok(());
    }

    // Get primary monitor dimensions for positioning
    let monitor = app_handle
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No primary monitor found")?;

    let screen_size = monitor.size();
    let scale_factor = monitor.scale_factor();

    // Window dimensions for dual-shortcut display
    let window_width = 220.0;
    let window_height = 24.0;

    // Position at top center of screen
    let x = ((screen_size.width as f64 / scale_factor) - window_width) / 2.0;
    let y = 12.0; // 12px from top

    // Note: We intentionally don't set Accessory activation policy here.
    // The shortcut reminder uses always_on_top which is sufficient for a small overlay.
    // Setting Accessory would hide the dock icon which is a worse tradeoff.

    info!("Creating new shortcut-reminder window");
    let mut builder = WebviewWindowBuilder::new(
        &app_handle,
        label,
        tauri::WebviewUrl::App("shortcut-reminder".into()),
    )
    .title("")
    .inner_size(window_width, window_height)
    .position(x, y)
    .visible_on_all_workspaces(true)
    .always_on_top(true)
    .decorations(false)
    .skip_taskbar(true)
    .focused(false)
    .transparent(true)
    .visible(false)
    .shadow(false)
    .resizable(false);

    // Hide title bar on macOS
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay);
    }

    let window = builder
        .build()
        .map_err(|e| format!("Failed to create shortcut reminder window: {}", e))?;

    info!("shortcut-reminder window created");

    // Convert to NSPanel on macOS for fullscreen support
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::WebviewWindowExt;

        if let Ok(_panel) = window.to_panel() {
            info!("Successfully converted shortcut-reminder to panel");

            // Show the window first (required - order_front_regardless doesn't make invisible windows visible)
            let _ = window.show();

            // Clone window to pass into main thread closure
            let window_clone = window.clone();
            let _ = app_handle.run_on_main_thread(move || {
                use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;

                // Use to_panel() on window_clone directly instead of get_webview_panel
                // This avoids race conditions with panel registration
                if let Ok(panel) = window_clone.to_panel() {
                    // Level 1001 = above CGShieldingWindowLevel, shows over fullscreen
                    panel.set_level(1001);
                    panel.set_style_mask(0);
                    panel.set_collection_behaviour(
                        NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces |
                        NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle |
                        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary |
                        NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                    );
                    // Order front regardless to show above fullscreen
                    panel.order_front_regardless();
                    info!("Panel configured for fullscreen support");
                } else {
                    error!("Failed to get panel in main thread");
                }
            });
        } else {
            error!("Failed to convert shortcut-reminder to panel");
            // Fallback: just show the window
            let _ = window.show();
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.show();
    }

    // Listen for display changes and reposition window to stay top-center
    let app_handle_clone = app_handle.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::ScaleFactorChanged { .. } = event {
            // Display configuration changed, reposition to top center of primary monitor
            if let Ok(Some(monitor)) = app_handle_clone.primary_monitor() {
                let screen_size = monitor.size();
                let scale_factor = monitor.scale_factor();
                let new_x = ((screen_size.width as f64 / scale_factor) - 220.0) / 2.0;
                let new_y = 12.0;

                if let Some(window) = app_handle_clone.get_webview_window("shortcut-reminder") {
                    let _ = window.set_position(tauri::Position::Logical(
                        tauri::LogicalPosition::new(new_x, new_y)
                    ));
                    info!("Repositioned shortcut-reminder after display change");
                }
            }
        }
    });

    // Send the shortcut info to the window
    let _ = app_handle.emit_to(label, "shortcut-reminder-update", &shortcut);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn hide_shortcut_reminder(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("shortcut-reminder") {
        let _ = window.hide();
    }
    Ok(())
}

/// Register window-specific shortcuts (Escape, search shortcut) when main window is visible
/// These should only be active when the overlay is open to avoid blocking other apps
#[tauri::command]
#[specta::specta]
pub fn register_window_shortcuts(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};
    use tauri::Emitter;

    let global_shortcut = app_handle.global_shortcut();

    // Register Escape shortcut to hide the main timeline window
    let escape_shortcut = Shortcut::new(None, Code::Escape);
    if let Err(e) = global_shortcut.on_shortcut(escape_shortcut, |app, _, event| {
        if matches!(event.state, ShortcutState::Pressed) {
            info!("Escape pressed, hiding main window");
            hide_main_window(app);
        }
    }) {
        // Ignore "already registered" errors - shortcut may already be active
        if !e.to_string().contains("already registered") {
            error!("Failed to register Escape shortcut: {}", e);
        }
    }

    // Get search shortcut from settings
    let settings = SettingsStore::get(&app_handle).unwrap_or_default().unwrap_or_default();
    let search_shortcut_str = settings.search_shortcut;

    // Default fallback if empty or parse fails
    #[cfg(target_os = "windows")]
    let default_search = "Alt+K";
    #[cfg(not(target_os = "windows"))]
    let default_search = "Control+Super+K";

    let shortcut_to_use = if search_shortcut_str.is_empty() {
        default_search.to_string()
    } else {
        search_shortcut_str
    };

    // Parse and register the search shortcut
    match parse_shortcut(&shortcut_to_use) {
        Ok(search_shortcut) => {
            if let Err(e) = global_shortcut.on_shortcut(search_shortcut, |app, _, event| {
                if matches!(event.state, ShortcutState::Pressed) {
                    info!("Search shortcut triggered");
                    let _ = app.emit("open-search", ());
                }
            }) {
                if !e.to_string().contains("already registered") {
                    error!("Failed to register search shortcut: {}", e);
                }
            }
        }
        Err(e) => {
            error!("Failed to parse search shortcut '{}': {}", shortcut_to_use, e);
        }
    }

    // Note: Chat shortcut (Ctrl+Cmd+L) is now global-only, not window-specific
    // This allows one consistent shortcut for chat everywhere

    info!("Window-specific shortcuts registered (Escape, {})", shortcut_to_use);
    Ok(())
}

/// Unregister window-specific shortcuts when main window is hidden
/// This allows Escape and search shortcut to work normally in other apps
#[tauri::command]
#[specta::specta]
pub fn unregister_window_shortcuts(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};

    let global_shortcut = app_handle.global_shortcut();

    // Unregister Escape
    let escape_shortcut = Shortcut::new(None, Code::Escape);
    let _ = global_shortcut.unregister(escape_shortcut);

    // Get search shortcut from settings to unregister the correct one
    let settings = SettingsStore::get(&app_handle).unwrap_or_default().unwrap_or_default();
    let search_shortcut_str = settings.search_shortcut;

    // Default fallback if empty
    #[cfg(target_os = "windows")]
    let default_search = "Alt+K";
    #[cfg(not(target_os = "windows"))]
    let default_search = "Control+Super+K";

    let shortcut_to_use = if search_shortcut_str.is_empty() {
        default_search.to_string()
    } else {
        search_shortcut_str
    };

    // Parse and unregister the search shortcut
    if let Ok(search_shortcut) = parse_shortcut(&shortcut_to_use) {
        let _ = global_shortcut.unregister(search_shortcut);
    }

    // Note: Chat shortcut (Ctrl+Cmd+L) is global-only, no need to unregister here

    info!("Window-specific shortcuts unregistered");
    Ok(())
}

// ============================================================================
// Rewind AI Integration Commands
// ============================================================================

use crate::rewind_integration::{
    self, MigrationProgress, RewindMigrationState, RewindScanResult,
};

/// Check if Rewind AI data is available for migration
#[tauri::command]
#[specta::specta]
pub async fn rewind_check_available() -> bool {
    rewind_integration::is_rewind_available().await
}

/// Scan Rewind AI data and return statistics
#[tauri::command]
#[specta::specta]
pub async fn rewind_scan() -> Result<RewindScanResult, String> {
    let screenpipe_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".screenpipe");

    rewind_integration::scan_rewind_data(&screenpipe_dir)
        .await
        .map_err(|e| e.to_string())
}

/// Get current migration progress
#[tauri::command]
#[specta::specta]
pub async fn rewind_get_progress(
    state: tauri::State<'_, std::sync::Arc<RewindMigrationState>>,
) -> Result<MigrationProgress, String> {
    let progress = state.progress.lock().await;
    Ok(progress.clone())
}

/// Start Rewind AI migration
#[tauri::command]
#[specta::specta]
pub async fn rewind_start_migration(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, std::sync::Arc<RewindMigrationState>>,
    fresh_start: bool,
) -> Result<(), String> {
    use screenpipe_db::DatabaseManager;
    use std::sync::Arc;

    // Check if already running
    if state
        .is_running
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Err("Migration already in progress".to_string());
    }

    let screenpipe_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".screenpipe");

    let db_path = screenpipe_dir.join("data.db");

    let db = DatabaseManager::new(&db_path.to_string_lossy())
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let db = Arc::new(db);
    let state_clone = Arc::clone(&state.inner());
    let app_handle_clone = app_handle.clone();

    // Start migration in background
    tokio::spawn(async move {
        let result = rewind_integration::run_migration(db, screenpipe_dir, state_clone.clone(), fresh_start).await;

        // Emit completion event
        if let Err(e) = result {
            let mut progress = state_clone.progress.lock().await;
            progress.state = rewind_integration::MigrationState::Failed;
            progress.error_message = Some(e.to_string());
        }

        // Emit final progress
        let progress = state_clone.progress.lock().await;
        let _ = app_handle_clone.emit("rewind-migration-complete", progress.clone());
    });

    Ok(())
}

/// Cancel ongoing Rewind migration
#[tauri::command]
#[specta::specta]
pub async fn rewind_cancel_migration(
    state: tauri::State<'_, std::sync::Arc<RewindMigrationState>>,
) -> Result<(), String> {
    state
        .cancel_flag
        .store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

/// Clear migration checkpoint for fresh start
#[tauri::command]
#[specta::specta]
pub async fn rewind_clear_checkpoint() -> Result<(), String> {
    let screenpipe_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".screenpipe");

    rewind_integration::clear_checkpoint(&screenpipe_dir)
        .await
        .map_err(|e| e.to_string())
}