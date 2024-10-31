// #[tauri::command]
// pub fn has_screen_capture_access() -> bool {
//     scap::has_permission()
// }

use serde_json::Value;
use tauri::Manager;
use tracing::info;

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

#[allow(dead_code)]
#[tauri::command]
pub fn reset_screen_permissions() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("tccutil")
        .arg("reset")
        .arg("ScreenCapture")
        .arg("so.cap.desktop")
        .spawn()
        .expect("failed to reset screen permissions");
}

#[allow(dead_code)]
#[tauri::command]
pub fn reset_microphone_permissions() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("tccutil")
        .arg("reset")
        .arg("Microphone")
        .arg("so.cap.desktop")
        .spawn()
        .expect("failed to reset microphone permissions");
}

#[tauri::command]
pub async fn load_pipe_config(pipe_name: String) -> Result<Value, String> {
    info!("Loading pipe config for {}", pipe_name);
    let default_path = dirs::home_dir().unwrap().join(".screenpipe").join("pipes");

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
pub async fn save_pipe_config(pipe_name: String, config: Value) -> Result<(), String> {
    info!("Saving pipe config for {}", pipe_name);
    let default_path = dirs::home_dir().unwrap().join(".screenpipe").join("pipes");
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
pub async fn reset_all_pipes() -> Result<(), String> {
    info!("Resetting all pipes");
    let pipes_path = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?
        .join(".screenpipe")
        .join("pipes");

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

        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let _window = tauri::WebviewWindowBuilder::new(
            &app_handle,
            "timeline",
            tauri::WebviewUrl::App("timeline.html".into()),
        )
        .title("timeline")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true) // Added this
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
