use anyhow::Result;
use serde_json::Value;
use tauri::{
    menu::{IsMenuItem, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    AppHandle, Wry,
};
use tracing::debug;

pub async fn update_tray_menu(
    app: &AppHandle,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<()> {
    // Cache the current menu state to compare
    let mut current_menu_state = String::new();

    // Fetch enabled pipes from API
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:3030/pipes/list")
        .send()
        .await?
        .json::<Value>()
        .await?;

    // Create menu state string for comparison
    if let Some(pipes) = response["data"].as_array() {
        current_menu_state = pipes
            .iter()
            .filter(|p| p["enabled"].as_bool().unwrap_or(false))
            .map(|p| p["id"].as_str().unwrap_or_default())
            .collect::<Vec<_>>()
            .join(",");
    }

    // Store last menu state in static/thread-safe way
    use once_cell::sync::Lazy;
    use std::sync::Mutex;
    static LAST_MENU_STATE: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));

    // Only update if menu state changed
    let should_update = {
        let mut last_state = LAST_MENU_STATE.lock().unwrap();
        if *last_state != current_menu_state {
            *last_state = current_menu_state.clone();
            true
        } else {
            false
        }
    };

    if !should_update {
        return Ok(());
    }

    // Create all owned menu items first
    let mut menu_pipes = Vec::new();

    // Add version and show items (these are already references)
    let show = MenuItemBuilder::with_id("show", "show screenpipe").build(app)?;
    let version =
        MenuItemBuilder::with_id("version", format!("version {}", app.package_info().version))
            .enabled(false)
            .build(app)?;

    // Add pipe items to owned collection
    if let Some(pipes) = response["data"].as_array() {
        for pipe in pipes {
            if pipe["enabled"].as_bool().unwrap_or(false) {
                let id = pipe["id"].as_str().unwrap_or_default();
                if let Some(_port) = pipe["config"]["port"].as_u64() {
                    let pipe_item =
                        MenuItemBuilder::with_id(format!("pipe_{}", id), format!("open {}", id))
                            .build(app)?;
                    menu_pipes.push(pipe_item);
                }
            }
        }
    }

    // Add quit item to owned collection
    let quit_item = MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?;

    // Now create the final menu_items vector with references
    let menu_divider = PredefinedMenuItem::separator(app)?;

    // Build menu
    let mut menu_items: Vec<&dyn IsMenuItem<Wry>> =
        vec![&version, &show, update_item, &menu_divider];
    // Add pipe items
    menu_items.extend(menu_pipes.iter().map(|item| item as &dyn IsMenuItem<Wry>));
    // Add final items
    menu_items.extend([&menu_divider as &dyn IsMenuItem<Wry>, &quit_item]);

    let menu = MenuBuilder::new(app).items(&menu_items).build()?;

    // Update tray
    if let Some(tray) = app.tray_by_id("screenpipe_main") {
        tray.set_menu(Some(menu))?;
        debug!(
            "updated tray menu with {} enabled pipes",
            response["data"]
                .as_array()
                .map(|arr| arr.len())
                .unwrap_or(0)
        );
    }

    Ok(())
}

pub fn setup_tray_menu_updater(app: AppHandle, update_item: &tauri::menu::MenuItem<Wry>) {
    let update_item = update_item.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Err(e) = update_tray_menu(&app, &update_item).await {
                println!("failed to update tray menu: {:#}", e);
            }
        }
    });
}
