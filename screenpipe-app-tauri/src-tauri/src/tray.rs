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
    menu::{IsMenuItem, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    AppHandle, Manager, Wry,
};
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
        // Initial menu setup
        let menu = create_tray_menu(app, update_item)?;
        main_tray.set_menu(Some(menu))?;

        // Setup click handlers
        setup_tray_click_handlers(&main_tray)?;

        // Start menu updater
        setup_tray_menu_updater(app.clone(), update_item);
    }
    Ok(())
}

fn create_tray_menu(
    app: &AppHandle,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<tauri::menu::Menu<Wry>> {
    // Static menu items
    let show = MenuItemBuilder::with_id("show", "show screenpipe").build(app)?;
    let quick_start = MenuItemBuilder::with_id("quick_start", "quick start").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "settings").build(app)?;
    let version =
        MenuItemBuilder::with_id("version", format!("version {}", app.package_info().version))
            .enabled(false)
            .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?;

    // Separators
    let menu_divider1 = PredefinedMenuItem::separator(app)?;
    let menu_divider2 = PredefinedMenuItem::separator(app)?;
    let menu_divider3 = PredefinedMenuItem::separator(app)?;
    let menu_divider4 = PredefinedMenuItem::separator(app)?;

    // Recording controls
    let start_recording =
        MenuItemBuilder::with_id("start_recording", "start recording").build(app)?;
    let stop_recording = MenuItemBuilder::with_id("stop_recording", "stop recording").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &show,
            &menu_divider1,
            &version,
            update_item,
            &menu_divider2,
            &start_recording,
            &stop_recording,
            &menu_divider3,
            &quick_start,
            &settings,
            &menu_divider4,
            &quit,
        ])
        .build()?;

    Ok(menu)
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
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("show-quick-start", ());
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "settings" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("show-settings", ());
                let _ = window.show();
                let _ = window.set_focus();
            }
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

fn create_dynamic_menu(
    app: &AppHandle,
    state: &MenuState,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<tauri::menu::Menu<Wry>> {
    let mut menu_builder = MenuBuilder::new(app);

    // Add static items first
    let static_items = create_static_menu_items(app, update_item)?;
    let static_item_refs: Vec<&dyn IsMenuItem<Wry>> = static_items.iter().map(|x| &**x).collect();
    menu_builder = menu_builder.items(&static_item_refs);

    // Add pipe submenu if there are active pipes
    if !state.pipes.is_empty() {
        let pipes_divider = PredefinedMenuItem::separator(app)?;
        menu_builder = menu_builder.item(&pipes_divider);

        // Add pipe menu items
        for pipe_id in &state.pipes {
            let shortcut = state.shortcuts.get(pipe_id).cloned();
            let pipe_item = create_pipe_menu_item(app, pipe_id, shortcut)?;
            menu_builder = menu_builder.item(&pipe_item);
        }
    }

    menu_builder.build().map_err(Into::into)
}

fn create_static_menu_items(
    app: &AppHandle,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<Vec<Box<dyn IsMenuItem<Wry>>>> {
    let mut items: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();

    // Show item
    items.push(Box::new(
        MenuItemBuilder::with_id("show", "show screenpipe").build(app)?,
    ));

    // Version and update items
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(
        MenuItemBuilder::with_id("version", format!("version {}", app.package_info().version))
            .enabled(false)
            .build(app)?,
    ));
    items.push(Box::new(update_item.clone()));

    // Recording controls
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(
        MenuItemBuilder::with_id("start_recording", "start recording").build(app)?,
    ));
    items.push(Box::new(
        MenuItemBuilder::with_id("stop_recording", "stop recording").build(app)?,
    ));

    // Settings and quit
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(
        MenuItemBuilder::with_id("quick_start", "quick start").build(app)?,
    ));
    items.push(Box::new(
        MenuItemBuilder::with_id("settings", "settings").build(app)?,
    ));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(
        MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?,
    ));

    Ok(items)
}

fn create_pipe_menu_item(
    app: &AppHandle,
    pipe_id: &str,
    shortcut: Option<String>,
) -> Result<tauri::menu::MenuItem<Wry>> {
    let label = if let Some(shortcut) = shortcut {
        // Format shortcut in a cleaner way:
        // 1. Convert to lowercase
        // 2. Replace "super" with "⌘" on macOS, "win" on Windows
        // 3. Replace "shift" with "⇧"
        // 4. Replace "+" with spaces
        let formatted_shortcut = shortcut
            .to_lowercase()
            .replace(
                "super",
                if cfg!(target_os = "macos") {
                    "⌘"
                } else {
                    "win"
                },
            )
            .replace("shift", "⇧")
            .replace("+", " ");

        format!("{} ({})", pipe_id, formatted_shortcut)
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
