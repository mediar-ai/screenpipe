// #[tauri::command]
// pub fn has_screen_capture_access() -> bool {
//     scap::has_permission()
// }

use serde_json::Value;
use tauri:: Manager;
use tracing::info;
use tracing::{debug, error};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use std::str::FromStr;
use tauri_plugin_store::StoreExt;


// Command to register shortcuts (just saves to store, doesn't set up handlers)
#[tauri::command(rename_all = "snake_case")]
pub async fn register_shortcuts(
    show_screenpipe_shortcut: String,
    toggle_recording_shortcut: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Saving shortcuts - Show: {}, Record: {}", 
           show_screenpipe_shortcut, toggle_recording_shortcut);

    // Use the same store path as main.rs
    let data_dir = app_handle.path().local_data_dir().unwrap().join("screenpipe");
    let path = data_dir.join("store.bin");
    debug!("Store path: {:?}", path);
    
    // Log store contents before saving
    let store = app_handle.store(path.clone());
    debug!("Current store contents:");
    if let Some(show) = store.get("show_screenpipe_shortcut") {
        debug!("show_screenpipe_shortcut: {:?}", show);
    }
    if let Some(toggle) = store.get("toggle_recording_shortcut") {
        debug!("toggle_recording_shortcut: {:?}", toggle);
    }
    
    // Save to store
    store.set("show_screenpipe_shortcut".to_string(), show_screenpipe_shortcut.clone());
    store.set("toggle_recording_shortcut".to_string(), toggle_recording_shortcut.clone());
    store.save().map_err(|e| format!("Failed to save shortcuts: {}", e)).unwrap();
    
    // Log store contents after saving
    debug!("Store contents after saving:");
    if let Some(show) = store.get("show_screenpipe_shortcut") {
        debug!("show_screenpipe_shortcut: {:?}", show);
    }
    if let Some(toggle) = store.get("toggle_recording_shortcut") {
        debug!("toggle_recording_shortcut: {:?}", toggle);
    }

    // Register the shortcuts
    let show_shortcut = parse_shortcut(&show_screenpipe_shortcut)?;
    let toggle_shortcut = parse_shortcut(&toggle_recording_shortcut)?;

    app_handle.global_shortcut().register(show_shortcut)
        .map_err(|e| format!("Failed to register show shortcut: {}", e))?;
    app_handle.global_shortcut().register(toggle_shortcut)
        .map_err(|e| format!("Failed to register toggle shortcut: {}", e))?;

    debug!("Successfully registered shortcuts");
    Ok(())
}





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


fn parse_shortcut(shortcut: &str) -> Result<Shortcut, String> {
    debug!("Starting to parse shortcut: {}", shortcut);

    let parts: Vec<&str> = shortcut.split('+').collect();
    debug!("Split shortcut into parts: {:?}", parts);

    if parts.is_empty() {
        return Err("Empty shortcut".to_string());
    }

    let (modifiers, key) = parts.split_at(parts.len() - 1);
    debug!("Modifiers: {:?}, Key: {:?}", modifiers, key);

    if key.is_empty() {
        return Err("No key specified".to_string());
    }

    let mut modifier_flags = Modifiers::empty();
    for modifier in modifiers {
        debug!("Processing modifier: {}", modifier);
        match modifier.to_lowercase().as_str() {
            "ctrl" | "control" => {
                debug!("Adding CONTROL modifier");
                modifier_flags |= Modifiers::CONTROL;
            },
            "alt" | "option" => {
                debug!("Adding ALT modifier");
                modifier_flags |= Modifiers::ALT;
            },
            "shift" => {
                debug!("Adding SHIFT modifier");
                modifier_flags |= Modifiers::SHIFT;
            },
            "super" | "meta" | "cmd" | "command" => {
                debug!("Adding META modifier");
                modifier_flags |= Modifiers::META;
            },
            _ => {
                let err = format!("Invalid modifier: {}", modifier);
                error!("{}", err);
                return Err(err);
            }
        }
    }

    debug!("Final modifier flags: {:?}", modifier_flags);

    // Handle the key part
    let key = key[0].trim();
    let key_str = if key.len() == 1 && key.chars().next().unwrap().is_ascii_alphabetic() {
        format!("Key{}", key.to_uppercase())
    } else {
        // Handle special keys
        match key.to_uppercase().as_str() {
            "SPACE" => "Space".to_string(),
            "ENTER" | "RETURN" => "Enter".to_string(),
            "ESC" | "ESCAPE" => "Escape".to_string(),
            "TAB" => "Tab".to_string(),
            "UP" => "ArrowUp".to_string(),
            "DOWN" => "ArrowDown".to_string(),
            "LEFT" => "ArrowLeft".to_string(),
            "RIGHT" => "ArrowRight".to_string(),
            k if k.starts_with("F") && k[1..].parse::<u8>().is_ok() => k.to_string(),
            k => {
                if k.len() == 1 && k.chars().next().unwrap().is_ascii_digit() {
                    format!("Digit{}", k)
                } else {
                    k.to_string()
                }
            }
        }
    };

    debug!("Attempting to parse key code: {}", key_str);
    match Code::from_str(&key_str) {
        Ok(code) => {
            debug!("Successfully parsed key code: {:?}", code);
            Ok(Shortcut::new(Some(modifier_flags), code))
        }
        Err(e) => {
            let err = format!("Failed to parse key code '{}': {:?}", key_str, e);
            error!("{}", err);
            Err(err)
        }
    }
}



#[tauri::command]
pub async fn unregister_all_shortcuts(app_handle: tauri::AppHandle) -> Result<(), String> {
    app_handle
        .global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister shortcuts: {}", e))
}
