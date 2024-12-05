use crate::{get_data_dir, kill_all_sreenpipes, spawn_screenpipe, SidecarState};
use log::debug;
use serde::{Serialize};
use serde_json::Value;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tracing::{info, error};
use tokio::time::{sleep, Duration};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

// Global flag to track if we're currently processing a shortcut
static PROCESSING_SHORTCUT: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_tray_unhealth_icon(app_handle: tauri::AppHandle<tauri::Wry>) {
    if let Some(main_tray) = app_handle.tray_by_id("screenpipe_main") {
        let _ = main_tray.set_icon(Some(
            tauri::image::Image::from_path("icons/screenpipe-logo-tray-failed.png").unwrap(),
        ));
    }
}

#[tauri::command]
pub fn set_tray_health_icon(app_handle: tauri::AppHandle<tauri::Wry>) {
    if let Some(main_tray) = app_handle.tray_by_id("screenpipe_main") {
        let _ = main_tray.set_icon(Some(
            tauri::image::Image::from_path("icons/screenpipe-logo-tray-black.png").unwrap(),
        ));
    }
}

#[cfg(target_os = "macos")]
use core_foundation::{base::TCFType, boolean::CFBoolean, string::CFString};

#[tauri::command]
pub fn open_screen_capture_preferences() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn()
        .expect("failed to open system preferences");
}

#[allow(dead_code)]
#[tauri::command]
pub fn open_mic_preferences() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .spawn()
        .expect("failed to open system preferences");
}

#[tauri::command]
pub async fn load_pipe_config(
    app_handle: tauri::AppHandle<tauri::Wry>,
    pipe_name: String,
) -> Result<Value, String> {
    info!("Loading pipe config for {}", pipe_name);
    let default_path = get_data_dir(&app_handle)
        .map(|path| path.join("pipes"))
        .unwrap_or_else(|_| dirs::home_dir().unwrap().join(".screenpipe").join("pipes"));

    let config_path = default_path.join(pipe_name).join("pipe.json");
    info!("Config path: {}", config_path.to_string_lossy());
    let config_content = tokio::fs::read_to_string(config_path)
        .await
        .map_err(|e| format!("Failed to read pipe config: {}", e))?;
    let config: Value = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse pipe config: {}", e))?;
    Ok(config)
}

#[tauri::command]
pub async fn save_pipe_config(
    app_handle: tauri::AppHandle<tauri::Wry>,
    pipe_name: String,
    config: Value,
) -> Result<(), String> {
    info!("Saving pipe config for {}", pipe_name);
    let default_path = get_data_dir(&app_handle)
        .map(|path| path.join("pipes"))
        .unwrap_or_else(|_| dirs::home_dir().unwrap().join(".screenpipe").join("pipes"));
    let config_path = default_path.join(pipe_name).join("pipe.json");
    info!("Config path: {}", config_path.to_string_lossy());
    let config_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize pipe config: {}", e))?;
    tokio::fs::write(config_path, config_content)
        .await
        .map_err(|e| format!("Failed to write pipe config: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn reset_all_pipes(app_handle: tauri::AppHandle<tauri::Wry>) -> Result<(), String> {
    info!("Resetting all pipes");
    let pipes_path = get_data_dir(&app_handle)
        .map(|path| path.join("pipes"))
        .unwrap_or_else(|_| dirs::home_dir().unwrap().join(".screenpipe").join("pipes"));

    if pipes_path.exists() {
        tokio::fs::remove_dir_all(&pipes_path)
            .await
            .map_err(|e| format!("Failed to remove pipes directory: {}", e))?;
    }

    tokio::fs::create_dir_all(&pipes_path)
        .await
        .map_err(|e| format!("Failed to recreate pipes directory: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn show_main_window(app_handle: &tauri::AppHandle<tauri::Wry>, overlay: bool) {
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
pub fn show_timeline(app_handle: tauri::AppHandle<tauri::Wry>) {
    if let Some(window) = app_handle.get_webview_window("timeline") {
        #[cfg(target_os = "macos")]
        let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);

        // let _ = window.set_visible_on_all_workspaces(true);
        // let _ = window.set_always_on_top(true);
        let _ = window.set_decorations(true);
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let _window = tauri::WebviewWindowBuilder::new(
            &app_handle,
            "timeline",
            tauri::WebviewUrl::App("timeline.html".into()),
        )
        .title("timeline")
        .decorations(true)
        .transparent(true)
        // .always_on_top(true)
        // .visible_on_all_workspaces(true) // Added this
        .center()
        .build()
        .unwrap();
    }
}

const DEFAULT_SHORTCUT: &str = "Super+Alt+S";

#[tauri::command(rename_all = "snake_case")]
pub fn update_show_screenpipe_shortcut(
    app_handle: tauri::AppHandle<tauri::Wry>,
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
pub fn open_accessibility_preferences() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn()
        .expect("failed to open system preferences");
}

#[tauri::command]
pub fn check_accessibility_permissions() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Check if the app has accessibility permissions
        let options = {
            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let value = CFBoolean::false_value();
            let pairs = &[(key, value)];
            core_foundation::dictionary::CFDictionary::from_CFType_pairs(pairs)
        };

        let trusted = unsafe {
            let accessibility = CFString::new("AXIsProcessTrustedWithOptions");
            let func: extern "C" fn(*const core_foundation::dictionary::CFDictionary) -> bool =
                std::mem::transmute(libc::dlsym(
                    libc::RTLD_DEFAULT,
                    accessibility.to_string().as_ptr() as *const _,
                ));
            func(options.as_concrete_TypeRef() as *const _)
        };

        return trusted;
    }
    #[cfg(not(target_os = "macos"))]
    {
        return true;
    }
}

// Add these new structs
#[derive(Debug, Serialize)]
pub struct AuthStatus {
    authenticated: bool,
    message: Option<String>,
}

// Command to open the auth window
#[tauri::command]
pub async fn open_auth_window(app_handle: tauri::AppHandle<tauri::Wry>) -> Result<(), String> {
    #[cfg(debug_assertions)]
    let auth_url = "http://localhost:3001/login";
    #[cfg(not(debug_assertions))]
    let auth_url = "https://screenpi.pe/login";

    // If window exists, try to close it and wait a bit
    if let Some(existing_window) = app_handle.get_webview_window("auth") {
        let _ = existing_window.destroy();
        // Give it a moment to properly close
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    let window = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "auth",
        tauri::WebviewUrl::External(auth_url.parse().unwrap()),
    )
    .title("screenpipe auth")
    .center()
    .build()
    .map_err(|e| format!("failed to open auth window: {}", e))?;

    // Add close event listener to cleanup the window
    let window_handle = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Some(w) = window_handle.get_webview_window("auth") {
                let _ = w.close();
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn start_recording(state: tauri::State<'_, SidecarState>, app: tauri::AppHandle) -> Result<(), String> {
    spawn_screenpipe(state, app).await
}

#[tauri::command]
pub async fn stop_recording(state: tauri::State<'_, SidecarState>, app: tauri::AppHandle) -> Result<(), String> {
    kill_all_sreenpipes(state, app).await
}

/// Check if screenpipe process exists with timeout and error handling
async fn check_screenpipe_process() -> Result<bool, String> {
    use tokio::time::timeout;
    use std::time::Duration;

    let process_check = async {
        #[cfg(not(target_os = "windows"))]
        {
            let output = tokio::process::Command::new("pgrep")
                .arg("-f")
                .arg("screenpipe")
                .output()
                .await
                .map_err(|e| format!("Failed to execute pgrep: {}", e))?;
            
            Ok::<bool, String>(output.status.success() && !output.stdout.is_empty())
        }
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let output = tokio::process::Command::new("tasklist")
                .args(&["/FI", "IMAGENAME eq screenpipe.exe", "/NH"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .await
                .map_err(|e| format!("Failed to execute tasklist: {}", e))?;
            
            Ok::<bool, String>(output.status.success() && !output.stdout.is_empty())
        }
    };

    // Add 2-second timeout for process check
    match timeout(Duration::from_secs(2), process_check).await {
        Ok(result) => result,
        Err(_) => Err("Process check timed out".to_string())
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_start_recording_shortcut(
    app_handle: tauri::AppHandle<tauri::Wry>,
    new_shortcut: String,
    enabled: bool,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    // Try to parse the new shortcut
    let shortcut_str = match new_shortcut.parse::<Shortcut>() {
        Ok(_s) => new_shortcut,
        Err(e) => {
            info!(
                "invalid shortcut '{}': {}, falling back to default",
                new_shortcut, e
            );
            "Super+Alt+R".to_string()
        }
    };

    // Parse the shortcut string
    let recording_shortcut = match shortcut_str.parse::<Shortcut>() {
        Ok(s) => s,
        Err(e) => {
            return Err(format!("failed to parse shortcut: {}", e));
        }
    };

    if !enabled {
        let _ = app_handle.global_shortcut().unregister(recording_shortcut);
        return Ok(());
    }

    // Register the new shortcut
    if let Err(e) = app_handle.global_shortcut().on_shortcut(recording_shortcut, move |app, _event, _shortcut| {
        if PROCESSING_SHORTCUT.load(Ordering::SeqCst) {
            debug!("Shortcut already being processed, ignoring");
            return;
        }

        let app_handle = app.clone();
        
        // Set processing flag with automatic reset after timeout
        PROCESSING_SHORTCUT.store(true, Ordering::SeqCst);
        let processing_flag = &PROCESSING_SHORTCUT;
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(2)).await;
            processing_flag.store(false, Ordering::SeqCst);
        });
        
        // Use a separate task for async operations
        tauri::async_runtime::spawn(async move {
            let state = app_handle.state::<SidecarState>();
            
            // Check process state
            let process_exists = match check_screenpipe_process().await {
                Ok(exists) => exists,
                Err(e) => {
                    error!("Failed to check process state: {}", e);
                    false // Assume not running on error
                }
            };

            // Check internal state
            let internal_state = {
                let sidecar = state.0.lock().await;
                match &*sidecar {
                    Some(manager) => manager.child.is_some(),
                    None => false
                }
            };

            // Determine true running state - if either shows running, consider it running
            let is_running = process_exists || internal_state;
            
            info!("Sidecar process exists: {}, internal state: {}, final running state: {}", 
                  process_exists, internal_state, is_running);
            
            let result = if is_running {
                info!("Stopping screenpipe via shortcut");
                kill_all_sreenpipes(state.clone(), app_handle.clone()).await
            } else {
                info!("Starting screenpipe via shortcut");
                start_recording(state.clone(), app_handle.clone()).await
            };

            // Give the state time to update
            sleep(Duration::from_millis(100)).await;

            // Verify final state
            let final_process_exists = match check_screenpipe_process().await {
                Ok(exists) => exists,
                Err(e) => {
                    error!("Failed to check final process state: {}", e);
                    process_exists // Fall back to previous state on error
                }
            };

            let final_internal_state = {
                let sidecar = state.0.lock().await;
                match &*sidecar {
                    Some(manager) => manager.child.is_some(),
                    None => false
                }
            };

            let final_state = final_process_exists || final_internal_state;
            info!("Final state - process: {}, internal: {}, combined: {}", 
                  final_process_exists, final_internal_state, final_state);

            match result {
                Ok(_) => {
                    let expected_state = !is_running;
                    if final_state == expected_state {
                        let (title, body, event) = if is_running {
                            ("screenpipe", "recording stopped", "recording_stopped")
                        } else {
                            ("screenpipe", "recording started", "recording_started")
                        };

                        let _ = app_handle.notification().builder()
                            .title(title)
                            .body(body)
                            .show();
                        let _ = app_handle.emit(event, body);
                    } else {
                        error!("State verification failed - expected: {}, got: {}", expected_state, final_state);
                        let _ = app_handle.notification().builder()
                            .title("screenpipe")
                            .body("recording operation failed - state mismatch")
                            .show();
                        let _ = app_handle.emit("recording_failed", "recording operation failed - state mismatch");
                    }
                },
                Err(err) => {
                    error!("Recording operation failed: {}", err);
                    let _ = app_handle.notification().builder()
                        .title("screenpipe")
                        .body("recording operation failed")
                        .show();
                    let _ = app_handle.emit("recording_failed", "recording operation failed");
                }
            }

            // Clear processing flag and add small delay to prevent rapid re-triggers
            sleep(Duration::from_millis(500)).await;
            PROCESSING_SHORTCUT.store(false, Ordering::SeqCst);
        });
    }) {
        info!("failed to register shortcut: {}", e);
        return Err("failed to set shortcut".to_string());
    }

    Ok(())
}
