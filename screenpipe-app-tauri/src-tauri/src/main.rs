// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use commands::load_pipe_config;
use commands::save_pipe_config;
use commands::show_main_window;
use serde_json::Value;
use sidecar::SidecarManager;
use std::env;
use std::fs;
use std::fs::File;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Config;
use tauri::Emitter;
use tauri::Manager;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState},
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_notification::NotificationExt;
#[allow(unused_imports)]
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_store::StoreBuilder;
use tokio::runtime::Handle;
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;
use updates::start_update_check;
use uuid::Uuid;
mod analytics;
mod icons;
use crate::analytics::start_analytics;

mod commands;
mod disk_usage;
mod llm_sidecar;
mod permissions;
mod server;
mod sidecar;
mod store;
mod tray;
mod updates;
pub use commands::reset_all_pipes;
pub use commands::set_tray_health_icon;
pub use commands::set_tray_unhealth_icon;
pub use server::spawn_server;
pub use sidecar::kill_all_sreenpipes;
pub use sidecar::spawn_screenpipe;
pub use store::get_profiles_store;
pub use store::get_store;

use crate::commands::hide_main_window;
pub use permissions::do_permissions_check;
pub use permissions::open_permission_settings;
pub use permissions::request_permission;
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
use tauri_plugin_sentry::{sentry};
mod health;
use health::start_health_check;
pub struct SidecarState(Arc<tokio::sync::Mutex<Option<SidecarManager>>>);

// New struct to hold shortcut configuration
#[derive(Debug, Default)]
struct ShortcutConfig {
    show: String,
    start: String,
    stop: String,
    start_audio: String,
    stop_audio: String,
    profile_shortcuts: HashMap<String, String>,
    pipe_shortcuts: HashMap<String, String>,
    disabled: Vec<String>,
}

impl ShortcutConfig {
    async fn from_store(app: &AppHandle) -> Result<Self, String> {
        let store = get_store(app, None).map_err(|e| e.to_string())?;

        let profile_shortcuts = match get_profiles_store(app) {
            Ok(profiles_store) => {
                let profiles = profiles_store
                    .get("profiles")
                    .and_then(|v| serde_json::from_value::<Vec<String>>(v.clone()).ok())
                    .unwrap_or_default();

                profiles
                    .into_iter()
                    .filter_map(|profile| {
                        profiles_store
                            .get(format!("shortcuts.{}", profile))
                            .and_then(|v| v.as_str().map(String::from))
                            .map(|shortcut| (profile, shortcut))
                    })
                    .collect()
            }
            Err(_) => HashMap::new(),
        };

        let pipe_shortcuts = store
            .keys()
            .into_iter()
            .filter_map(|key| {
                if key.starts_with("pipeShortcuts.") {
                    store
                        .get(key.clone())
                        .and_then(|v| v.as_str().map(String::from))
                        .map(|v| {
                            (
                                key.trim_start_matches("pipeShortcuts.").to_string(),
                                v.to_string(),
                            )
                        })
                } else {
                    None
                }
            })
            .collect::<HashMap<String, String>>();

        Ok(Self {
            show: store
                .get("showScreenpipeShortcut")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| "Alt+Space".to_string()),
            start: store
                .get("startRecordingShortcut")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| "Alt+Shift+R".to_string()),
            stop: store
                .get("stopRecordingShortcut")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| "Alt+Shift+S".to_string()),
            start_audio: store
                .get("startAudioShortcut")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default(),
            stop_audio: store
                .get("stopAudioShortcut")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default(),
            profile_shortcuts,
            pipe_shortcuts,
            disabled: store
                .get("disabledShortcuts")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default(),
        })
    }

    fn is_disabled(&self, shortcut_type: &str) -> bool {
        self.disabled.contains(&shortcut_type.to_string())
    }
}

// Helper to register a single shortcut
async fn register_shortcut(
    app: &AppHandle,
    shortcut_str: &str,
    is_disabled: bool,
    handler: impl Fn(&AppHandle) + Send + Sync + 'static,
) -> Result<(), String> {
    if shortcut_str.is_empty() || is_disabled {
        return Ok(());
    }

    let shortcut = parse_shortcut(shortcut_str)?;

    let global_shortcut = app.global_shortcut();

    global_shortcut
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            // Only trigger on key press, not release
            if matches!(event.state, ShortcutState::Pressed) {
                handler(app);
            }
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn update_global_shortcuts(
    app: AppHandle,
    show_shortcut: String,
    start_shortcut: String,
    stop_shortcut: String,
    start_audio_shortcut: String,
    stop_audio_shortcut: String,
    profile_shortcuts: HashMap<String, String>,
    pipe_shortcuts: HashMap<String, String>,
) -> Result<(), String> {
    let config = ShortcutConfig {
        show: show_shortcut,
        start: start_shortcut,
        stop: stop_shortcut,
        start_audio: start_audio_shortcut,
        stop_audio: stop_audio_shortcut,
        profile_shortcuts,
        pipe_shortcuts,
        disabled: ShortcutConfig::from_store(&app).await?.disabled,
    };
    apply_shortcuts(&app, &config).await
}

async fn initialize_global_shortcuts(app: &AppHandle) -> Result<(), String> {
    let config = ShortcutConfig::from_store(app).await?;
    apply_shortcuts(app, &config).await
}

async fn apply_shortcuts(app: &AppHandle, config: &ShortcutConfig) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();
    global_shortcut.unregister_all().unwrap();

    // Register show shortcut
    register_shortcut(app, &config.show, config.is_disabled("show"), |app| {
        info!("show shortcut triggered");
        if let Some(window) = app.get_webview_window("main") {
            match window.is_visible() {
                Ok(true) => {
                    info!("window is visible, hiding main window");
                    hide_main_window(app)
                }
                Ok(false) | Err(_) => {
                    info!(
                        "window is not visible or error checking visibility, showing main window"
                    );
                    show_main_window(app, false)
                }
            }
        } else {
            debug!("main window not found");
        }
    })
    .await?;

    // Register start shortcut
    register_shortcut(
        app,
        &config.start,
        config.is_disabled("start_recording"),
        |app| {
            let _ = app.emit("shortcut-start-recording", ());
        },
    )
    .await?;

    // Register stop shortcut
    register_shortcut(
        app,
        &config.stop,
        config.is_disabled("stop_recording"),
        |app| {
            let _ = app.emit("shortcut-stop-recording", ());
        },
    )
    .await?;

    // Register profile shortcuts
    for (profile, shortcut) in &config.profile_shortcuts {
        if !shortcut.is_empty() {
            let profile = profile.clone();
            register_shortcut(app, shortcut, false, move |app| {
                info!("switch-profile shortcut triggered for profile: {}", profile);
                let _ = app.emit("switch-profile", profile.clone());
            })
            .await?;
        }
    }

    // Register start audio shortcut
    register_shortcut(
        app,
        &config.start_audio,
        config.is_disabled("start_audio"),
        |app| {
            let store = get_store(app, None).unwrap();
            store.set("disableAudio", false);
            store.save().unwrap();
            let _ = app.emit("shortcut-start-audio", ());
            info!("start audio shortcut triggered");
        },
    )
    .await?;

    // Register stop audio shortcut
    register_shortcut(
        app,
        &config.stop_audio,
        config.is_disabled("stop_audio"),
        |app| {
            let store = get_store(app, None).unwrap();
            store.set("disableAudio", true);
            store.save().unwrap();
            let _ = app.emit("shortcut-stop-audio", ());
            info!("stop audio shortcut triggered");
        },
    )
    .await?;

    info!("pipe_shortcuts: {:?}", config.pipe_shortcuts);

    // Register pipe shortcuts
    for (pipe_id, shortcut) in &config.pipe_shortcuts {
        if !shortcut.is_empty() {
            let pipe_id = pipe_id.clone();
            let shortcut_id = format!("pipe_{}", pipe_id);
            info!(
                "registering pipe shortcut for pipe: {}, is disabled: {}",
                shortcut_id,
                config.is_disabled(&shortcut_id)
            );
            register_shortcut(
                app,
                shortcut,
                config.is_disabled(&shortcut_id),
                move |app| {
                    info!("pipe shortcut triggered for pipe: {}", pipe_id);
                    let _ = app.emit("open-pipe", pipe_id.clone());
                },
            )
            .await?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_env(name: &str) -> String {
    std::env::var(String::from(name)).unwrap_or(String::from(""))
}

async fn get_pipe_port(pipe_id: &str) -> anyhow::Result<u16> {
    // Fetch pipe config from API
    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://localhost:3030/pipes/info/{}", pipe_id))
        .send()
        .await?
        .json::<Value>()
        .await?;

    // Extract port from response
    response["data"]["config"]["port"]
        .as_u64()
        .map(|p| p as u16)
        .ok_or_else(|| anyhow::anyhow!("no port found for pipe {}", pipe_id))
}

async fn list_pipes() -> anyhow::Result<Value> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:3030/pipes/list")
        .send()
        .await?
        .json::<Value>()
        .await?;

    Ok(response)
}


pub fn get_base_dir(app: &tauri::AppHandle, custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = app.path().local_data_dir().unwrap().join("screenpipe");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(local_data_dir.join("data"))?;
    Ok(local_data_dir)
}

#[derive(Debug, serde::Serialize)]
pub struct LogFile {
    name: String,
    path: String,
    modified_at: u64,
}

#[tauri::command]
async fn get_log_files(app: AppHandle) -> Result<Vec<LogFile>, String> {
    let data_dir = get_data_dir(&app).map_err(|e| e.to_string())?;
    let mut log_files = Vec::new();

    // Collect all entries first
    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(&data_dir)
        .await
        .map_err(|e| e.to_string())?;
    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        // Get metadata immediately for each entry
        if let Ok(metadata) = entry.metadata().await {
            entries.push((entry, metadata));
        }
    }

    // Sort by modified time descending (newest first)
    entries.sort_by_key(|(_, metadata)| {
        std::cmp::Reverse(
            metadata
                .modified()
                .ok()
                .and_then(|m| m.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0),
        )
    });

    // Process sorted entries
    for (entry, metadata) in entries {
        let path = entry.path();
        if let Some(extension) = path.extension() {
            if extension == "log" {
                let modified = metadata
                    .modified()
                    .map_err(|e| e.to_string())?
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_secs();

                log_files.push(LogFile {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    modified_at: modified,
                });
            }
        }
    }

    Ok(log_files)
}

fn send_recording_notification(
    app_handle: &tauri::AppHandle,
    success: bool,
    action: &str,
    error_msg: Option<&str>,
) {
    let (title, body, event) = if success {
        (
            "Screenpipe",
            format!("Recording {}", action),
            format!("recording_{}", action),
        )
    } else {
        (
            "Screenpipe",
            format!("Failed to {} recording", action),
            "recording_failed".to_string(),
        )
    };

    if let Some(err) = error_msg {
        error!("Recording operation failed: {}", err);
    }

    let _ = app_handle
        .notification()
        .builder()
        .title(title)
        .body(&body)
        .show();
    let _ = app_handle.emit(&event, body);
}

fn get_data_dir(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    // Create a new runtime for this synchronous function

    let store = get_store(app, None)?;

    let default_path = app.path().home_dir().unwrap().join(".screenpipe");

    let data_dir = store
        .get("dataDir")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(String::from("default"));

    if data_dir == "default" || data_dir.is_empty() {
        Ok(default_path)
    } else {
        get_base_dir(app, Some(data_dir))
    }
}

// Helper function to parse shortcut string
fn parse_shortcut(shortcut_str: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();
    let key = parts.last().ok_or("Invalid shortcut format")?;

    let mut modifiers = Modifiers::empty();
    for modifier in &parts[..parts.len() - 1] {
        match modifier.to_uppercase().as_str() {
            "SUPER" | "CMD" | "COMMAND" => modifiers |= Modifiers::META,
            "CTRL" | "CONTROL" => modifiers |= Modifiers::CONTROL,
            "ALT" | "OPTION" => modifiers |= Modifiers::ALT,
            "SHIFT" => modifiers |= Modifiers::SHIFT,
            _ => return Err(format!("Unknown modifier: {}", modifier)),
        }
    }

    // Parse the key code - make case insensitive
    let code = match key.to_uppercase().as_str() {
        // Letters
        "A" => Code::KeyA,
        "B" => Code::KeyB,
        "C" => Code::KeyC,
        "D" => Code::KeyD,
        "E" => Code::KeyE,
        "F" => Code::KeyF,
        "G" => Code::KeyG,
        "H" => Code::KeyH,
        "I" => Code::KeyI,
        "J" => Code::KeyJ,
        "K" => Code::KeyK,
        "L" => Code::KeyL,
        "M" => Code::KeyM,
        "N" => Code::KeyN,
        "O" => Code::KeyO,
        "P" => Code::KeyP,
        "Q" => Code::KeyQ,
        "R" => Code::KeyR,
        "S" => Code::KeyS,
        "T" => Code::KeyT,
        "U" => Code::KeyU,
        "V" => Code::KeyV,
        "W" => Code::KeyW,
        "X" => Code::KeyX,
        "Y" => Code::KeyY,
        "Z" => Code::KeyZ,

        // Numbers
        "0" => Code::Digit0,
        "1" => Code::Digit1,
        "2" => Code::Digit2,
        "3" => Code::Digit3,
        "4" => Code::Digit4,
        "5" => Code::Digit5,
        "6" => Code::Digit6,
        "7" => Code::Digit7,
        "8" => Code::Digit8,
        "9" => Code::Digit9,

        // Function keys
        "F1" => Code::F1,
        "F2" => Code::F2,
        "F3" => Code::F3,
        "F4" => Code::F4,
        "F5" => Code::F5,
        "F6" => Code::F6,
        "F7" => Code::F7,
        "F8" => Code::F8,
        "F9" => Code::F9,
        "F10" => Code::F10,
        "F11" => Code::F11,
        "F12" => Code::F12,

        // Special keys
        "SPACE" => Code::Space,
        "TAB" => Code::Tab,
        "ENTER" => Code::Enter,
        "ESCAPE" | "ESC" => Code::Escape,
        "UP" => Code::ArrowUp,
        "DOWN" => Code::ArrowDown,
        "LEFT" => Code::ArrowLeft,
        "RIGHT" => Code::ArrowRight,

        _ => return Err(format!("Unsupported key: {}", key)),
    };

    Ok(Shortcut::new(Some(modifiers), code))
}

#[tokio::main]
async fn main() {
    let _ = fix_path_env::fix();

    // Initialize Sentry early
    let sentry_guard = sentry::init((
        "https://8770b0b106954e199df089bf4ffa89cf@o4507617161314304.ingest.us.sentry.io/4508716587876352", // Replace with your actual Sentry DSN
        sentry::ClientOptions {
            release: sentry::release_name!(),
            ..Default::default()
        },
    ));

    // Set permanent OLLAMA_ORIGINS env var on Windows if not present
    #[cfg(target_os = "windows")]
    {
        if env::var("OLLAMA_ORIGINS").is_err() {
            let output = std::process::Command::new("setx")
                .args(&["OLLAMA_ORIGINS", "*"])
                .output()
                .expect("failed to execute process");

            if !output.status.success() {
                error!(
                    "failed to set OLLAMA_ORIGINS: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            } else {
                info!("permanently set OLLAMA_ORIGINS=* for user");
            }
        }
    }

    let sidecar_state = SidecarState(Arc::new(tokio::sync::Mutex::new(None)));
    #[allow(clippy::single_match)]
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.set_always_on_top(false);
                let _ = window.set_visible_on_all_workspaces(false);
                #[cfg(target_os = "macos")]
                let _ = window
                    .app_handle()
                    .set_activation_policy(tauri::ActivationPolicy::Regular);
                window.hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let windows = app.webview_windows();
            windows
                .values()
                .next()
                .expect("Sorry, no window found")
                .set_focus()
                .expect("Can't focus window!");
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sentry::init(&sentry_guard))
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            spawn_screenpipe,
            kill_all_sreenpipes,
            permissions::open_permission_settings,
            permissions::request_permission,
            permissions::do_permissions_check,
            load_pipe_config,
            save_pipe_config,
            reset_all_pipes,
            set_tray_unhealth_icon,
            set_tray_health_icon,
            llm_sidecar::start_ollama_sidecar,
            llm_sidecar::stop_ollama_sidecar,
            commands::update_show_screenpipe_shortcut,
            commands::show_meetings,
            commands::show_identify_speakers,
            commands::get_disk_usage,
            commands::open_pipe_window,
            get_log_files,
            update_global_shortcuts,
            get_env
        ])
        .setup(|app| {
            // Logging setup
            let app_handle = app.handle();
            let base_dir =
                get_base_dir(app_handle, None).expect("Failed to ensure local data directory");

            // Set up rolling file appender
            let file_appender = RollingFileAppender::builder()
                .rotation(Rotation::DAILY)
                .filename_prefix("screenpipe-app")
                .filename_suffix("log")
                .max_log_files(5)
                .build(
                    get_data_dir(app.handle())
                        .unwrap_or_else(|_| dirs::home_dir().unwrap().join(".screenpipe")),
                )?;

            // Create a custom layer for file logging
            let file_layer = tracing_subscriber::fmt::layer()
                .with_writer(file_appender)
                .with_ansi(false)
                .with_filter(EnvFilter::new("info,hyper=error,tower_http=error"));

            // Create a custom layer for console logging
            let console_layer = tracing_subscriber::fmt::layer()
                .with_writer(std::io::stdout)
                .with_filter(EnvFilter::new("info,hyper=error,tower_http=error"));

            // Initialize the tracing subscriber with both layers
            tracing_subscriber::registry()
                .with(file_layer)
                .with(console_layer)
                .init();

            // Windows-specific setup
            if cfg!(windows) {
                let exe_dir = env::current_exe()
                    .expect("Failed to get current executable path")
                    .parent()
                    .expect("Failed to get parent directory of executable")
                    .to_path_buf();
                let tessdata_path = exe_dir.join("tessdata");
                env::set_var("TESSDATA_PREFIX", tessdata_path);
            }

            // Autostart setup
            let autostart_manager = app.autolaunch();
            let _ = autostart_manager.enable();
            debug!(
                "registered for autostart? {}",
                autostart_manager.is_enabled().unwrap()
            );

            info!("Local data directory: {}", base_dir.display());

            // PostHog analytics setup
            let posthog_api_key = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce".to_string();
            let interval_hours = 1;

            let path = base_dir.join("store.bin");
            if !path.exists() {
                let _ = File::create(path.clone()).unwrap();
            }

            // Set up update check
            let update_manager = start_update_check(app_handle, 5)?;

            // Tray setup
            if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                let show = MenuItemBuilder::with_id("show", "show screenpipe").build(app)?;

                let start_recording =
                    MenuItemBuilder::with_id("start_recording", "start recording").build(app)?;
                let stop_recording =
                    MenuItemBuilder::with_id("stop_recording", "stop recording").build(app)?;

                let version = MenuItemBuilder::with_id(
                    "version",
                    format!("version {}", app.package_info().version),
                )
                .enabled(false)
                .build(app)?;

                let menu_divider = PredefinedMenuItem::separator(app)?;
                let quit = MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[
                        &version,
                        &show,
                        &start_recording,
                        &stop_recording,
                        update_manager.update_now_menu_item_ref(),
                        &menu_divider,
                        &quit,
                    ])
                    .build()?;
                let _ = main_tray.set_menu(Some(menu));

                let update_item = update_manager.update_now_menu_item_ref().clone();
                tray::setup_tray_menu_updater(app.handle().clone(), &update_item);

                main_tray.on_menu_event(move |app_handle, event| match event.id().as_ref() {
                    "show" => {
                        show_main_window(app_handle, false);
                    }
                    "quit" => {
                        debug!("Quit requested");
                        // Kill all pipes before quitting
                        let app_handle_clone = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Ok(response) = list_pipes().await {
                                if let Some(pipes) = response["data"].as_array() {
                                    for pipe in pipes {
                                        if pipe["enabled"].as_bool().unwrap_or(false) {
                                            if let Some(id) = pipe["id"].as_str() {
                                                let _ = reqwest::Client::new()
                                                    .post("http://localhost:3030/pipes/disable")
                                                    .json(&serde_json::json!({
                                                        "pipe_id": id
                                                    }))
                                                    .send()
                                                    .await;
                                            }
                                        }
                                    }
                                }
                            }

                            // Stop any running recordings
                            let state = app_handle_clone.state::<SidecarState>();
                            if let Err(e) =
                                kill_all_sreenpipes(state, app_handle_clone.clone()).await
                            {
                                error!("Error stopping recordings during quit: {}", e);
                            }
                        });
                        // Then exit
                        app_handle.exit(0);
                    }
                    "start_recording" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app_handle.state::<SidecarState>();
                            if let Err(err) = spawn_screenpipe(state, app_handle.clone()).await {
                                send_recording_notification(
                                    &app_handle,
                                    false,
                                    "start",
                                    Some(&err.to_string()),
                                );
                            } else {
                                send_recording_notification(&app_handle, true, "started", None);
                            }
                        });
                    }
                    "stop_recording" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app_handle.state::<SidecarState>();
                            if let Err(err) = kill_all_sreenpipes(state, app_handle.clone()).await {
                                error!("Failed to stop recording: {}", err);
                                let _ = app_handle
                                    .notification()
                                    .builder()
                                    .title("Screenpipe")
                                    .body("Failed to stop recording")
                                    .show();
                                let _ =
                                    app_handle.emit("recording_failed", "Failed to stop recording");
                            } else {
                                let _ = app_handle
                                    .notification()
                                    .builder()
                                    .title("Screenpipe")
                                    .body("Recording stopped")
                                    .show();
                                let _ = app_handle.emit("recording_stopped", "Recording stopped");
                            }
                        });
                    }
                    "update_now" => {
                        use tauri_plugin_notification::NotificationExt;
                        app_handle
                            .notification()
                            .builder()
                            .title("screenpipe")
                            .body("installing latest version")
                            .show()
                            .unwrap();

                        tokio::task::block_in_place(move || {
                            Handle::current().block_on(async move {
                                if let Err(err) = sidecar::kill_all_sreenpipes(
                                    app_handle.state::<SidecarState>(),
                                    app_handle.clone(),
                                )
                                .await
                                {
                                    error!("Failed to kill sidecar: {}", err);
                                }
                            });
                        });
                        update_manager.update_screenpipe();
                    }
                    id if id.starts_with("pipe_") => {
                        let pipe_id = id.replace("pipe_", "");
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            match get_pipe_port(&pipe_id).await {
                                Ok(port) => {
                                    if let Err(e) =
                                        commands::open_pipe_window(app_handle, port, pipe_id).await
                                    {
                                        error!("Failed to open pipe window: {}", e);
                                    }
                                }
                                Err(e) => error!("Failed to get pipe port: {}", e),
                            }
                        });
                    }
                    _ => (),
                });
                main_tray.on_tray_icon_event(move |tray, event| match event {
                    tauri::tray::TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } => {
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
                    _ => {}
                });
            }

            // Store setup and analytics initialization
            let store = StoreBuilder::new(app.handle(), path.clone())
                .build()
                .unwrap();

            // TODO: proper lookup of keys rather than assuming they exist
            if store.is_empty() {
                store.set("analyticsEnabled".to_string(), Value::Bool(true));
                store.set(
                    "config".to_string(),
                    serde_json::to_value(Config::default())?,
                );
                store.save()?;
            }

            store.save()?;

            // Ensure state is managed before calling update_show_screenpipe_shortcut
            let sidecar_manager = Arc::new(Mutex::new(SidecarManager::new()));
            app.manage(sidecar_manager.clone());

            let is_analytics_enabled = store
                .get("analyticsEnabled")
                .unwrap_or(Value::Bool(true))
                .as_bool()
                .unwrap_or(true);

            let unique_id = store
                .get("userId")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| {
                    let new_id = Uuid::new_v4().to_string();
                    store.set(
                        "userId".to_string(),
                        serde_json::Value::String(new_id.clone()),
                    );
                    store.save().unwrap();
                    new_id
                });

            if is_analytics_enabled {
                match start_analytics(
                    unique_id,
                    posthog_api_key,
                    interval_hours,
                    "http://localhost:3030".to_string(),
                ) {
                    Ok(analytics_manager) => {
                        app.manage(analytics_manager);
                    }
                    Err(e) => {
                        error!("Failed to start analytics: {}", e);
                    }
                }
            }

            // Dev mode check and sidecar spawn

            let use_dev_mode = store
                .get("devMode")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            // double-check if they have any files in the data dir
            let data_dir = app
                .path()
                .home_dir()
                .expect("Failed to ensure local data directory");

            info!("data_dir: {}", data_dir.display());
            let has_files = fs::read_dir(data_dir.join(".screenpipe").join("data"))
                .map(|mut entries| entries.next().is_some())
                .unwrap_or(false);

            info!("has_files: {}", has_files);

            let sidecar_manager = Arc::new(Mutex::new(SidecarManager::new()));
            let sidecar_manager_clone = sidecar_manager.clone();
            app.manage(sidecar_manager.clone());

            let app_handle = app.handle().clone();

            info!("use_dev_mode: {}", use_dev_mode);

            info!("will start sidecar: {}", !use_dev_mode && has_files);

            // if non dev mode and previously started sidecar, start sidecar
            if !use_dev_mode && has_files {
                tauri::async_runtime::spawn(async move {
                    let mut manager = sidecar_manager_clone.lock().await;
                    if let Err(e) = manager.spawn(&app_handle).await {
                        error!("Failed to spawn initial sidecar: {}", e);
                    }

                    // Spawn a background task to check and restart periodically
                    let mut manager = sidecar_manager_clone.lock().await;
                    if let Err(e) = manager.check_and_restart(&app_handle).await {
                        error!("Failed to restart sidecar: {}", e);
                    }
                });
            } else {
                debug!("Dev mode enabled, skipping sidecar spawn and restart");
            }

            // Inside the main function, after the `app.manage(port);` line, add:
            let server_shutdown_tx = spawn_server(app.handle().clone(), 11435);
            app.manage(server_shutdown_tx);

            // Start health check service
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_health_check(app_handle).await {
                    error!("Failed to start health check service: {}", e);
                }
            });

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            // LLM Sidecar setup
            // let embedded_llm: EmbeddedLLMSettings = store
            //     .get("embeddedLLM")
            //     .and_then(|v| serde_json::from_value(v.clone()).ok())
            //     .unwrap_or_else(|| EmbeddedLLMSettings {
            //         enabled: false,
            //         model: "llama3.2:3b-instruct-q4_K_M".to_string(),
            //         port: 11438,
            //     });

            // if embedded_llm.enabled {
            //     let app_handle = app.handle().clone();
            //     tauri::async_runtime::spawn(async move {
            //         match LLMSidecar::new(embedded_llm).start(app_handle).await {
            //             Ok(result) => {
            //                 info!("LLM Sidecar started successfully: {}", result);
            //             }
            //             Err(e) => {
            //                 error!("Failed to start LLM Sidecar: {}", e);
            //             }
            //         }
            //     });
            // }
            // Initialize global shortcuts
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = initialize_global_shortcuts(&app_handle).await {
                    warn!("Failed to initialize global shortcuts: {}", e);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // set_tray_unhealth_icon(app.app_handle().clone());
    app.run(|app_handle, event| match event {
        tauri::RunEvent::Ready { .. } => {
            debug!("Ready event");
        }
        tauri::RunEvent::ExitRequested { .. } => {
            debug!("ExitRequested event");

            // Add this to shut down the server
            if let Some(server_shutdown_tx) = app_handle.try_state::<mpsc::Sender<()>>() {
                drop(server_shutdown_tx.send(()));
            }
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Focused(focused),
            ..
        } => {
            if label == "main" && focused {
                let window = app_handle.get_webview_window("main").unwrap();
                window.show().unwrap();
                window.set_focus().unwrap();
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                show_main_window(app_handle, false);
            }
        }
        _ => {}
    });
}
