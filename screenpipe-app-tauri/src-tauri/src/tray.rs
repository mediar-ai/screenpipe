use crate::commands::{open_pipe_window, show_main_window};
use crate::sidecar::kill_all_sreenpipes;
use crate::store::get_store;
use crate::{get_pipe_port, SidecarState};
use anyhow::Result;
use once_cell::sync::Lazy;
use serde_json::Value;
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
    pipes: Vec<String>,
    shortcuts: HashMap<String, String>,
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
    state: &MenuState,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<tauri::menu::Menu<Wry>> {
    let store = get_store(app, None)?;
    let mut menu_builder = MenuBuilder::new(app);

    // Get the show shortcut from store
    let show_shortcut = store
        .get("showScreenpipeShortcut")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "Alt+Space".to_string());

    // Show item with formatted shortcut in label
    menu_builder = menu_builder.item(
        &MenuItemBuilder::with_id(
            "show",
            format!("show screenpipe ({})", format_shortcut(&show_shortcut)),
        )
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

    // Add pipe submenu if there are active pipes
    if !state.pipes.is_empty() {
        menu_builder = menu_builder.item(&PredefinedMenuItem::separator(app)?);

        // Add pipe menu items
        for pipe_id in &state.pipes {
            let shortcut = state.shortcuts.get(pipe_id).cloned();
            let pipe_item = create_pipe_menu_item(app, pipe_id, shortcut)?;
            menu_builder = menu_builder.item(&pipe_item);
        }
    }

    // Settings and quit
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quick_start", "quick start").build(app)?)
        .item(&MenuItemBuilder::with_id("settings", "settings").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?);

    menu_builder.build().map_err(Into::into)
}

fn setup_tray_click_handlers(main_tray: &TrayIcon) -> Result<()> {
    main_tray.on_menu_event(move |app_handle, event| {
        handle_menu_event(app_handle, event);
    });

    main_tray.on_tray_icon_event(move |tray, event| {
        if let tauri::tray::TrayIconEvent::Click {
            button,
            button_state,
            ..
        } = event
        {
            if button == MouseButton::Left && button_state == MouseButtonState::Up {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else {
                    show_main_window(app, true);
                }
            }
        }
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
            let _ = app_handle
                .opener()
                .open_url("screenpipe://onboarding", None::<&str>);
        }
        "settings" => {
            let _ = app_handle
                .opener()
                .open_url("screenpipe://settings", None::<&str>);
        }
        "quit" => {
            debug!("Quit requested");
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = kill_all_sreenpipes(
                    app_handle_clone.state::<SidecarState>(),
                    app_handle_clone.clone(),
                )
                .await
                {
                    error!("Error stopping recordings during quit: {}", e);
                }
            });
            app_handle.exit(0);
        }
        id if id.starts_with("pipe_") => {
            handle_pipe_click(app_handle, id);
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
        pipes: get_active_pipes().await?,
        shortcuts: get_current_shortcuts(app)?,
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
            debug!("Updated tray menu with {} pipes", new_state.pipes.len());
        }
    }

    Ok(())
}

async fn get_active_pipes() -> Result<Vec<String>> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:3030/pipes/list")
        .send()
        .await?
        .json::<Value>()
        .await?;

    Ok(response["data"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .filter(|p| p["enabled"].as_bool().unwrap_or(false))
        .filter_map(|p| p["id"].as_str().map(String::from))
        .collect())
}

fn get_current_shortcuts(app: &AppHandle) -> Result<HashMap<String, String>> {
    let store = get_store(app, None)?;
    let mut shortcuts = HashMap::new();

    // Get pipe shortcuts
    for key in store.keys() {
        if key.starts_with("pipeShortcuts.") {
            if let Some(shortcut) = store
                .get(key.clone())
                .and_then(|v| v.as_str().map(String::from))
            {
                let pipe_id = key.trim_start_matches("pipeShortcuts.").to_string();
                shortcuts.insert(pipe_id, shortcut);
            }
        }
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

fn create_pipe_menu_item(
    app: &AppHandle,
    pipe_id: &str,
    shortcut: Option<String>,
) -> Result<tauri::menu::MenuItem<Wry>> {
    let label = if let Some(shortcut) = shortcut {
        format!("{} ({})", pipe_id, format_shortcut(&shortcut))
    } else {
        pipe_id.to_string()
    };

    MenuItemBuilder::with_id(format!("pipe_{}", pipe_id), label)
        .build(app)
        .map_err(Into::into)
}

fn handle_pipe_click(app: &AppHandle, menu_id: &str) {
    let pipe_id = menu_id.trim_start_matches("pipe_").to_string();
    debug!("Opening pipe window for {}", pipe_id);

    // Spawn async task to handle the port fetching and window opening
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        match get_pipe_port(&pipe_id).await {
            Ok(port) => {
                if let Err(e) = open_pipe_window(app_handle, port, pipe_id).await {
                    error!("Failed to open pipe window: {}", e);
                }
            }
            Err(e) => {
                error!("Failed to get port for pipe {}: {}", pipe_id, e);
            }
        }
    });
}
