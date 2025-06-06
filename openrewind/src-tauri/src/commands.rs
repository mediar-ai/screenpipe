use crate::{get_data_dir, window_api::{RewindWindowId, ShowRewindWindow}, store::{OnboardingStore, SettingsStore}};
use serde::Serialize;
use specta::Type;
use tauri::Manager;
use tracing::{error, info};
use std::{fs, path::Path};

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
pub fn show_main_window(app_handle: &tauri::AppHandle, overlay: bool) {
    if let Some(window) = app_handle.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        if overlay {
            let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }

        let _ = window.set_visible_on_all_workspaces(overlay);
        let _ = window.set_always_on_top(overlay);
        let _ = window.show();

        if !overlay {
            let _ = window.set_focus();
        }

        // event listener for the window close event
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window_clone.is_fullscreen().unwrap_or(false) {
                    let _ = window_clone.destroy().unwrap();
                } else {
                    let _ = window_clone.hide().unwrap();
                    api.prevent_close();
                }
            }
        });
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            app_handle,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Screenpipe")
        .build();
    }
}

#[tauri::command]
#[specta::specta]
pub fn hide_main_window(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.close();
    }
}

const DEFAULT_SHORTCUT: &str = "Super+Alt+S";

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

// Add these new structs
#[derive(Debug, Serialize, Type)]
pub struct AuthStatus {
    authenticated: bool,
    message: Option<String>,
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
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let screenpipe_dir_path = get_data_dir(&app_handle)
        .unwrap_or_else(|_| dirs::home_dir().unwrap().join(".openrewind"));
    match crate::disk_usage::disk_usage(&screenpipe_dir_path).await {
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
    window.show(&app_handle).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn close_window(
    app_handle: tauri::AppHandle,
    window: ShowRewindWindow,
) -> Result<(), String> {
    let window_id = match window {
        ShowRewindWindow::Main => RewindWindowId::Main,
        ShowRewindWindow::Settings { .. } => RewindWindowId::Settings,
        ShowRewindWindow::Onboarding => RewindWindowId::Onboarding,
        ShowRewindWindow::Search => RewindWindowId::Search,
    };
    
    if let Some(window) = window_id.get(&app_handle) {
        window.close().map_err(|e| e.to_string())
    } else {
        Err(format!("Window {} not found", window_id.label()))
    }
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
    // wait until onboarding is updated
    OnboardingStore::update(&app_handle, |onboarding| {
        onboarding.complete();
    }).map_err(|e| e.to_string())?;
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    show_window(app_handle.clone(), ShowRewindWindow::Main).await?;
    close_window(app_handle.clone(), ShowRewindWindow::Onboarding).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn reset_onboarding(app_handle: tauri::AppHandle) -> Result<(), String> {
    OnboardingStore::update(&app_handle, |onboarding| {
        onboarding.reset();
    })
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