use crate::commands::show_main_window;
use crate::health::{get_recording_status, RecordingStatus};
use crate::store::get_store;
use crate::window_api::ShowRewindWindow;
use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon};
use tauri::Emitter;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    AppHandle, Manager, Wry,
};
use tauri_plugin_opener::OpenerExt;

use tracing::{debug, error};

// Track last known state to avoid unnecessary updates
static LAST_MENU_STATE: Lazy<Mutex<MenuState>> = Lazy::new(|| Mutex::new(MenuState::default()));

#[derive(Default, PartialEq, Clone)]
struct MenuState {
    shortcuts: HashMap<String, String>,
    recording_status: Option<RecordingStatus>,
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

    // Get the show shortcut from store
    let show_shortcut = store
        .get("showScreenpipeShortcut")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "Super+Alt+S".to_string());

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

    // Version and update items
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(
            &MenuItemBuilder::with_id("version", format!("version {}", app.package_info().version))
                .enabled(false)
                .build(app)?,
        )
        .item(update_item);

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

    // Settings and quit
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quick_start", "quick start").build(app)?)
        .item(&MenuItemBuilder::with_id("settings", "settings").build(app)?)
        .item(&MenuItemBuilder::with_id("changelog", "changelog").build(app)?)
        .item(&MenuItemBuilder::with_id("status", "status").build(app)?)
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
        "quick_start" => {
            // focus on the main window
            let _ = app_handle.get_webview_window("main").unwrap().set_focus();
            let _ = app_handle
                .opener()
                .open_url("screenpipe://onboarding", None::<&str>);
        }
        "settings" => {
            let _ = ShowRewindWindow::Settings { page: None }.show(app_handle);
        }
        "changelog" => {
            let _ = app_handle.get_webview_window("main").unwrap().set_focus();
            let _ = app_handle
                .opener()
                .open_url("screenpipe://changelog", None::<&str>);
        }
        "status" => {
            let _ = app_handle.get_webview_window("main").unwrap().set_focus();
            let _ = app_handle
                .opener()
                .open_url("screenpipe://status", None::<&str>);
        }
        "quit" => {
            debug!("Quit requested");

            app_handle.exit(0);
        }
        _ => debug!("Unhandled menu event: {:?}", event.id()),
    }
}

async fn update_menu_if_needed(
    app: &AppHandle,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<()> {
    // Get current state
    let new_state = MenuState {
        shortcuts: get_current_shortcuts(app)?,
        recording_status: Some(get_recording_status()),
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
    let _store = get_store(app, None)?;
    let shortcuts = HashMap::new();
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
    // Add parentheses inside the formatting to ensure consistent styling
    shortcut
        .to_lowercase()
        .replace(
            "super",
            if cfg!(target_os = "macos") {
                "⌘"
            } else {
                "win"
            },
        )
        .replace(
            "alt",
            if cfg!(target_os = "macos") {
                "⌥"
            } else {
                "alt"
            },
        )
        .replace(
            "shift",
            if cfg!(target_os = "macos") {
                "⇧"
            } else {
                "shift"
            },
        )
        .replace(
            "ctrl",
            if cfg!(target_os = "macos") {
                "⌃"
            } else {
                "ctrl"
            },
        )
        .replace("+", " ")
}
