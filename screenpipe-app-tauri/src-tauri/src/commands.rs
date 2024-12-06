use crate::get_data_dir;
use serde::Serialize;
use serde_json::Value;
use tauri::Manager;
use tracing::info;

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

#[derive(Debug, Serialize)]
pub struct PermissionsStatus {
    screen_capture: bool,
    microphone: bool,
    accessibility: bool,
}

#[tauri::command]
pub fn check_all_permissions() -> PermissionsStatus {
    PermissionsStatus {
        screen_capture: check_screen_capture_permissions(),
        microphone: check_microphone_permissions(),
        accessibility: check_accessibility_permissions(),
    }
}

#[tauri::command]
pub fn trigger_audio_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use core_foundation::{base::TCFType, string::CFString};

        unsafe {
            let av_media_type = CFString::new("avfa"); // Audio media type

            // First check if we can find the function
            let func_ptr = libc::dlsym(
                libc::RTLD_DEFAULT,
                "AVCaptureDevice_requestAccessForMediaType\0".as_ptr() as *const _,
            );

            if func_ptr.is_null() {
                return Err("Could not find AVCaptureDevice API".to_string());
            }

            let func: extern "C" fn(*const core_foundation::string::__CFString) -> bool =
                std::mem::transmute(func_ptr);

            // Call the function with proper error handling
            match std::panic::catch_unwind(|| func(av_media_type.as_concrete_TypeRef())) {
                Ok(_) => Ok(()),
                Err(_) => Err("Failed to request audio permission".to_string()),
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(()) // Windows and Linux don't require explicit microphone permissions
    }
}

#[tauri::command]
pub fn check_microphone_permissions() -> bool {
    #[cfg(target_os = "macos")]
    {
        use core_foundation::{base::TCFType, string::CFString};
        
        unsafe {
            let av_media_type = CFString::new("avfa");
            let func_ptr = libc::dlsym(
                libc::RTLD_DEFAULT,
                "AVCaptureDevice_authorizationStatusForMediaType\0".as_ptr() as *const _,
            );
            
            if !func_ptr.is_null() {
                let func: extern "C" fn(*const core_foundation::string::__CFString) -> i32 =
                    std::mem::transmute(func_ptr);
                let status = func(av_media_type.as_concrete_TypeRef());
                // 3 = AVAuthorizationStatusAuthorized
                return status == 3;
            }
            false
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        true // Windows and Linux don't require explicit microphone permissions
    }
}

#[tauri::command]
pub fn check_screen_capture_permissions() -> bool {
    #[cfg(target_os = "macos")]
    {
        use core_foundation::{base::TCFType, boolean::CFBoolean, string::CFString};
        
        // Check if the app has screen capture permissions
        let options = {
            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let value = CFBoolean::false_value();
            let pairs = &[(key, value)];
            core_foundation::dictionary::CFDictionary::from_CFType_pairs(pairs)
        };

        unsafe {
            let func_ptr = libc::dlsym(
                libc::RTLD_DEFAULT,
                "CGRequestScreenCaptureAccess\0".as_ptr() as *const _,
            );
            
            if !func_ptr.is_null() {
                let func: extern "C" fn() -> bool = std::mem::transmute(func_ptr);
                return func();
            }
            false
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        true // Windows and Linux don't require explicit screen capture permissions
    }
}
