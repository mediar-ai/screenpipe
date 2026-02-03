use crate::commands::show_main_window;
use crate::health::{get_recording_status, RecordingStatus};
use crate::sidecar::SidecarState;
use crate::store::{get_store, OnboardingStore};
use crate::updates::is_source_build;
use crate::window_api::ShowRewindWindow;
use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::tray::TrayIcon;
use tauri::Emitter;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

use tracing::{debug, error, info};

// Track last known state to avoid unnecessary updates
static LAST_MENU_STATE: Lazy<Mutex<MenuState>> = Lazy::new(|| Mutex::new(MenuState::default()));

#[derive(Default, PartialEq, Clone)]
struct MenuState {
    shortcuts: HashMap<String, String>,
    recording_status: Option<RecordingStatus>,
    onboarding_completed: bool,
}

pub fn setup_tray(app: &AppHandle, update_item: &tauri::menu::MenuItem<Wry>) -> Result<()> {
    if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
        // Initial menu setup with empty state
        let menu = create_dynamic_menu(app, &MenuState::default(), update_item)?;
        main_tray.set_menu(Some(menu))?;

        // Setup click handlers
        setup_tray_click_handlers(&main_tray)?;

        // Start menu updater
        setup_tray_menu_updater(app.clone(), update_item);
    }
    Ok(())
}

fn create_dynamic_menu(
    app: &AppHandle,
    _state: &MenuState,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<tauri::menu::Menu<Wry>> {
    let store = get_store(app, None)?;
    let mut menu_builder = MenuBuilder::new(app);

    // Check if onboarding is completed
    let onboarding_completed = OnboardingStore::get(app)
        .ok()
        .flatten()
        .map(|o| o.is_completed)
        .unwrap_or(false);

    // During onboarding: show minimal menu (version + quit only)
    if !onboarding_completed {
        menu_builder = menu_builder
            .item(
                &MenuItemBuilder::with_id("version", format!("version {}", app.package_info().version))
                    .enabled(false)
                    .build(app)?,
            )
            .item(&PredefinedMenuItem::separator(app)?)
            .item(&MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?);

        return menu_builder.build().map_err(Into::into);
    }

    // Full menu after onboarding is complete
    // Get the show shortcut from store (must match frontend defaults in use-settings.tsx)
    let default_shortcut = if cfg!(target_os = "windows") {
        "Alt+S"
    } else {
        "Control+Super+S"
    };
    let show_shortcut = store
        .get("showScreenpipeShortcut")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| default_shortcut.to_string());

    // Show item with formatted shortcut in label
    menu_builder = menu_builder.item(
        &MenuItemBuilder::with_id(
            "show",
            format!("show screenpipe ({})", format_shortcut(&show_shortcut)),
        )
        .build(app)?,
    );

    // Recording status indicator
    let status_text = match get_recording_status() {
        RecordingStatus::Recording => "● recording",
        RecordingStatus::Stopped => "○ stopped",
        RecordingStatus::Error => "○ error",
    };
    menu_builder = menu_builder.item(
        &MenuItemBuilder::with_id("recording_status", status_text)
            .enabled(false)
            .build(app)?,
    );

    // Show "fix permissions" item when recording is in error state and permissions are denied
    if get_recording_status() == RecordingStatus::Error {
        let perms = crate::permissions::do_permissions_check(false);
        let has_permission_issue = !perms.screen_recording.permitted()
            || !perms.microphone.permitted();
        if has_permission_issue {
            menu_builder = menu_builder.item(
                &MenuItemBuilder::with_id("fix_permissions", "⚠ fix permissions")
                    .build(app)?,
            );
        }
    }

    // Version and update items
    let is_beta = app.config().identifier.contains("beta");
    let version_text = if is_beta {
        format!("version {} (beta)", app.package_info().version)
    } else {
        format!("version {}", app.package_info().version)
    };
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(
            &MenuItemBuilder::with_id("version", version_text)
                .enabled(false)
                .build(app)?,
        )
        .item(update_item)
        .item(&MenuItemBuilder::with_id("releases", "what's new").build(app)?);

    // Only show recording controls if not in dev mode
    let dev_mode = store
        .get("devMode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !dev_mode {
        menu_builder = menu_builder
            .item(&PredefinedMenuItem::separator(app)?)
            .item(&MenuItemBuilder::with_id("start_recording", "start recording").build(app)?)
            .item(&MenuItemBuilder::with_id("stop_recording", "stop recording").build(app)?);
    }

    // Settings, feedback and quit
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("settings", "settings").build(app)?)
        .item(&MenuItemBuilder::with_id("feedback", "send feedback").build(app)?)
        .item(&MenuItemBuilder::with_id("book_call", "book a call with founder").build(app)?)
        .item(&MenuItemBuilder::with_id("onboarding", "onboarding").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?);

    menu_builder.build().map_err(Into::into)
}

fn setup_tray_click_handlers(main_tray: &TrayIcon) -> Result<()> {
    main_tray.on_menu_event(move |app_handle, event| {
        handle_menu_event(app_handle, event);
    });

    Ok(())
}

fn handle_menu_event(app_handle: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "show" => {
            show_main_window(app_handle, false);
        }
        "start_recording" => {
            let _ = app_handle.emit("shortcut-start-recording", ());
        }
        "stop_recording" => {
            let _ = app_handle.emit("shortcut-stop-recording", ());
        }
        "fix_permissions" => {
            let _ = ShowRewindWindow::PermissionRecovery.show(app_handle);
        }
        "releases" => {
            // Open GitHub releases in a webview window
            if let Some(window) = app_handle.get_webview_window("releases") {
                let _ = window.set_focus();
            } else {
                let _ = WebviewWindowBuilder::new(
                    app_handle,
                    "releases",
                    WebviewUrl::External(
                        "https://github.com/screenpipe/screenpipe/releases"
                            .parse()
                            .unwrap(),
                    ),
                )
                .title("what's new")
                .inner_size(900.0, 700.0)
                .min_inner_size(600.0, 400.0)
                .build();
            }
        }
        "update_now" => {
            // For source builds, show info dialog about updates
            if is_source_build(app_handle) {
                let app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let dialog = app
                        .dialog()
                        .message(
                            "auto-updates are only available in the pre-built version.\n\n\
                            source builds require manual updates from github.",
                        )
                        .title("source build detected")
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            "download pre-built".to_string(),
                            "view on github".to_string(),
                        ));

                    dialog.show(move |clicked_download| {
                        if clicked_download {
                            let _ = app.opener().open_url("https://screenpi.pe/download", None::<&str>);
                        } else {
                            let _ = app.opener().open_url("https://github.com/screenpipe/screenpipe/releases", None::<&str>);
                        }
                    });
                });
            } else {
                // For production builds, emit event to trigger update
                let _ = app_handle.emit("update-now-clicked", ());
            }
        }
        "settings" => {
            let _ = ShowRewindWindow::Settings { page: None }.show(app_handle);
        }
        "feedback" => {
            let _ = ShowRewindWindow::Settings { page: Some("feedback".to_string()) }.show(app_handle);
        }
        "book_call" => {
            let _ = app_handle.opener().open_url("https://cal.com/louis030195/screenpipe-onboarding", None::<&str>);
        }
        "onboarding" => {
            // Reset onboarding state so it shows even if previously completed
            let _ = OnboardingStore::update(app_handle, |onboarding| {
                onboarding.reset();
            });
            let _ = ShowRewindWindow::Onboarding.show(app_handle);
        }
        "quit" => {
            debug!("Quit requested");

            // Stop the sidecar before exiting
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                info!("Stopping screenpipe sidecar before quit...");
                if let Some(sidecar_state) = app_handle_clone.try_state::<SidecarState>() {
                    // Access the inner Arc<Mutex<...>> directly instead of calling the tauri command
                    let mut handle_guard = sidecar_state.0.lock().await;
                    if let Some(handle) = handle_guard.take() {
                        handle.shutdown();
                        info!("Screenpipe sidecar stopped successfully");
                    } else {
                        debug!("No sidecar running to stop");
                    }
                }
                app_handle_clone.exit(0);
            });
        }
        _ => debug!("Unhandled menu event: {:?}", event.id()),
    }
}

async fn update_menu_if_needed(
    app: &AppHandle,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<()> {
    // Get current state including onboarding status
    let onboarding_completed = OnboardingStore::get(app)
        .ok()
        .flatten()
        .map(|o| o.is_completed)
        .unwrap_or(false);

    let new_state = MenuState {
        shortcuts: get_current_shortcuts(app)?,
        recording_status: Some(get_recording_status()),
        onboarding_completed,
    };

    // Compare with last state
    let should_update = {
        let mut last_state = LAST_MENU_STATE.lock().unwrap();
        if *last_state != new_state {
            *last_state = new_state.clone();
            true
        } else {
            false
        }
    };

    if should_update {
        if let Some(tray) = app.tray_by_id("screenpipe_main") {
            let menu = create_dynamic_menu(app, &new_state, update_item)?;
            tray.set_menu(Some(menu))?;
        }
    }

    Ok(())
}

fn get_current_shortcuts(app: &AppHandle) -> Result<HashMap<String, String>> {
    let store = get_store(app, None)?;
    let mut shortcuts = HashMap::new();

    // Get the show shortcut from store
    if let Some(shortcut) = store.get("showScreenpipeShortcut").and_then(|v| v.as_str().map(String::from)) {
        shortcuts.insert("show".to_string(), shortcut);
    }

    Ok(shortcuts)
}

pub fn setup_tray_menu_updater(app: AppHandle, update_item: &tauri::menu::MenuItem<Wry>) {
    let update_item = update_item.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Err(e) = update_menu_if_needed(&app, &update_item).await {
                error!("Failed to update tray menu: {:#}", e);
            }
        }
    });
}

fn format_shortcut(shortcut: &str) -> String {
    // Format shortcut for display in tray menu
    // macOS convention: ⌘ (Command) → ⌃ (Control) → ⌥ (Option) → ⇧ (Shift) → Key

    let parts: Vec<&str> = shortcut.split('+').collect();

    let mut has_cmd = false;
    let mut has_ctrl = false;
    let mut has_alt = false;
    let mut has_shift = false;
    let mut key = String::new();

    for part in parts {
        let lower = part.trim().to_lowercase();
        match lower.as_str() {
            "super" | "command" | "cmd" | "meta" => has_cmd = true,
            "control" | "ctrl" | "commandorcontrol" => has_ctrl = true,
            "alt" | "option" => has_alt = true,
            "shift" => has_shift = true,
            _ => key = part.trim().to_uppercase(),
        }
    }

    if cfg!(target_os = "macos") {
        // macOS: Use symbols in correct order (⌘⌃⌥⇧Key)
        let mut result = String::new();
        if has_cmd { result.push_str("⌘"); }
        if has_ctrl { result.push_str("⌃"); }
        if has_alt { result.push_str("⌥"); }
        if has_shift { result.push_str("⇧"); }
        result.push_str(&key);
        result
    } else {
        // Windows/Linux: Use text with + separator
        let mut parts_out = Vec::new();
        if has_ctrl { parts_out.push("Ctrl"); }
        if has_cmd { parts_out.push("Win"); }
        if has_alt { parts_out.push("Alt"); }
        if has_shift { parts_out.push("Shift"); }
        parts_out.push(&key);
        parts_out.join("+")
    }
}
