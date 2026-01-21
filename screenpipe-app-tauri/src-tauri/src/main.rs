// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use analytics::AnalyticsManager;
use commands::show_main_window;
use serde_json::json;
use serde_json::Value;
#[cfg(target_os = "macos")]
use tauri_nspanel::ManagerExt;
use std::env;
use std::fs::File;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tauri::Config;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_global_shortcut::ShortcutState;
#[allow(unused_imports)]
use tauri_plugin_shell::process::CommandEvent;
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;
use updates::start_update_check;
use window_api::ShowRewindWindow;

// TypeScript bindings generation imports (only in debug builds)
#[cfg(debug_assertions)]
use specta_typescript::Typescript;
#[cfg(debug_assertions)]
use tauri_specta::{collect_commands, Builder};

mod analytics;
mod icons;
use crate::analytics::start_analytics;
use crate::store::SettingsStore;

mod commands;
mod disk_usage;
mod permissions;
mod server;
mod sidecar;
mod store;
mod tray;
mod updates;
mod window_api;

pub use server::*;

pub use sidecar::*;

pub use icons::*;
pub use store::get_store;

mod config;
pub use config::get_base_dir;

pub use commands::set_tray_health_icon;
pub use commands::set_tray_unhealth_icon;
pub use server::spawn_server;
pub use sidecar::spawn_screenpipe;
pub use sidecar::stop_screenpipe;
// Removed: pub use store::get_profiles_store; // Profile functionality has been removed

use crate::commands::hide_main_window;
pub use permissions::do_permissions_check;
pub use permissions::open_permission_settings;
pub use permissions::request_permission;
use std::collections::HashMap;
use tauri::{AppHandle, WebviewUrl, WebviewWindow};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
use tauri_plugin_sentry::sentry;
mod health;
use base64::Engine;
use health::start_health_check;
use window_api::RewindWindowId;

// New struct to hold shortcut configuration
#[derive(Debug, Default)]
struct ShortcutConfig {
    show: String,
    start: String,
    stop: String,
    start_audio: String,
    stop_audio: String,
    disabled: Vec<String>,
}

impl ShortcutConfig {
    async fn from_store(app: &AppHandle) -> Result<Self, String> {
        let store = SettingsStore::get(app).unwrap_or_default().unwrap_or_default();

        Ok(Self {
            show: store
                .show_screenpipe_shortcut,
            start: store
                .start_recording_shortcut,
            stop: store
                .stop_recording_shortcut,
            start_audio: store
                .start_audio_shortcut,
            stop_audio: store
                .stop_audio_shortcut,
            disabled: store
                .disabled_shortcuts,
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
#[specta::specta]
async fn update_global_shortcuts(
    app: AppHandle,
    show_shortcut: String,
    start_shortcut: String,
    stop_shortcut: String,
    start_audio_shortcut: String,
    stop_audio_shortcut: String,
    _profile_shortcuts: HashMap<String, String>, // Keep for API compatibility but ignore
) -> Result<(), String> {
    let config = ShortcutConfig {
        show: show_shortcut,
        start: start_shortcut,
        stop: stop_shortcut,
        start_audio: start_audio_shortcut,
        stop_audio: stop_audio_shortcut,
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
        #[cfg(target_os = "macos")]
        let window_result = app.get_webview_panel("main");
        #[cfg(not(target_os = "macos"))]
        let window_result = app.get_webview_window("main").ok_or(());
        if let Ok(window) = window_result {
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

    Ok(())
}

#[tauri::command]
#[specta::specta]
fn get_env(name: &str) -> String {
    std::env::var(String::from(name)).unwrap_or(String::from(""))
}

#[derive(Debug, serde::Serialize, specta::Type)]
pub struct LogFile {
    name: String,
    path: String,
    modified_at: u64,
}

#[tauri::command]
#[specta::specta]
async fn get_log_files(app: AppHandle) -> Result<Vec<LogFile>, String> {
    let data_dir = get_screenpipe_data_dir(&app).map_err(|e| e.to_string())?;
    let screenpipe_data_dir = get_data_dir(&app).map_err(|e| e.to_string())?;
    let mut log_files = Vec::new();

    // Collect all entries first
    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(&data_dir)
        .await
        .map_err(|e| e.to_string())?;
    let mut screenpipe_dir = tokio::fs::read_dir(&screenpipe_data_dir)
        .await
        .map_err(|e| e.to_string())?;

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        // Get metadata immediately for each entry
        if let Ok(metadata) = entry.metadata().await {
            entries.push((entry, metadata));
        }
    }

    while let Some(entry) = screenpipe_dir.next_entry().await.map_err(|e| e.to_string())? {
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

fn get_screenpipe_data_dir(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    let default_path = app.path().home_dir().unwrap().join(".screenpipe");
    Ok(default_path)
}

use tokio::time::{sleep, Duration};

#[tauri::command]
#[specta::specta]
async fn get_media_file(file_path: &str) -> Result<serde_json::Value, String> {
    use std::path::Path;

    debug!("Reading media file: {}", file_path);

    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    // Read file contents
    let file_contents = match tokio::fs::read(path).await {
        Ok(contents) => {
            debug!("Successfully read file of size: {} bytes", contents.len());
            contents
        }
        Err(e) => {
            error!("Failed to read file: {}", e);
            return Err(format!("Failed to read file: {}", e));
        }
    };

    // Convert to base64
    let data = base64::prelude::BASE64_STANDARD.encode(&file_contents);

    // Determine MIME type
    let mime_type = get_mime_type(file_path);

    Ok(serde_json::json!({
        "data": data,
        "mimeType": mime_type
    }))
}

fn get_mime_type(path: &str) -> String {
    let ext = path.split('.').last().unwrap_or("").to_lowercase();
    let is_audio = path.to_lowercase().contains("input") || path.to_lowercase().contains("output");

    match ext.as_str() {
        "mp4" => "video/mp4".to_string(),
        "webm" => "video/webm".to_string(),
        "ogg" => "video/ogg".to_string(),
        "mp3" => "audio/mpeg".to_string(),
        "wav" => "audio/wav".to_string(),
        _ => {
            if is_audio {
                "audio/mpeg".to_string()
            } else {
                "video/mp4".to_string()
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
async fn upload_file_to_s3(file_path: &str, signed_url: &str) -> Result<bool, String> {
    debug!("Starting upload for file: {}", file_path);

    // Read file contents - do this outside retry loop to avoid multiple reads
    let file_contents = match tokio::fs::read(file_path).await {
        Ok(contents) => {
            debug!("Successfully read file of size: {} bytes", contents.len());
            contents
        }
        Err(e) => {
            error!("Failed to read file: {}", e);
            return Err(e.to_string());
        }
    };

    let client = reqwest::Client::new();
    let max_retries = 3;
    let mut attempt = 0;
    let mut last_error = String::new();

    while attempt < max_retries {
        attempt += 1;
        debug!("Upload attempt {} of {}", attempt, max_retries);

        match client
            .put(signed_url)
            .body(file_contents.clone())
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    debug!("Successfully uploaded file on attempt {}", attempt);
                    return Ok(true);
                }
                last_error = format!("Upload failed with status: {}", response.status());
                error!("{} (attempt {}/{})", last_error, attempt, max_retries);
            }
            Err(e) => {
                last_error = format!("Request failed: {}", e);
                error!("{} (attempt {}/{})", last_error, attempt, max_retries);
            }
        }

        if attempt < max_retries {
            let delay = Duration::from_secs(2u64.pow(attempt as u32 - 1)); // Exponential backoff
            debug!("Waiting {}s before retry...", delay.as_secs());
            sleep(delay).await;
        }
    }

    Err(format!(
        "Upload failed after {} attempts. Last error: {}",
        max_retries, last_error
    ))
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

// check if the server is running
#[tauri::command]
#[specta::specta]
async fn is_server_running(app: AppHandle) -> Result<bool, String> {
    let store = app.state::<store::SettingsStore>();
    let port = store.port;
    let client = reqwest::Client::new();
    let response = client.get(format!("http://localhost:{}", port)).send().await;
    Ok(response.is_ok())
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

    // Generate TypeScript bindings in debug mode
    #[cfg(debug_assertions)]
    {
        use crate::store::{SettingsStore, OnboardingStore};

        info!("Generating TypeScript bindings...");
        let builder = Builder::new()
            .commands(collect_commands![
                // Commands from permissions.rs
                permissions::open_permission_settings,
                permissions::request_permission,
                permissions::do_permissions_check,
                // Commands from main.rs
                get_env,
                get_log_files,
                get_media_file,
                upload_file_to_s3,
                update_global_shortcuts,
                spawn_screenpipe,
                stop_screenpipe,
                // Commands from commands.rs
                commands::get_disk_usage,
                commands::open_pipe_window,
                commands::update_show_screenpipe_shortcut,
                commands::show_window,
                commands::close_window,
                commands::set_window_size,
                // Onboarding commands
                commands::get_onboarding_status,
                commands::complete_onboarding,
                commands::reset_onboarding,
                commands::show_onboarding_window,
                commands::open_search_window,
                // Commands from tray.rs
                set_tray_unhealth_icon,
                set_tray_health_icon,
            ])
            .typ::<SettingsStore>()
            .typ::<OnboardingStore>();

        builder
            .export(
                Typescript::default().bigint(specta_typescript::BigIntExportBehavior::BigInt),
                "../lib/utils/tauri.ts",
            )
            .expect("Failed to export TypeScript bindings");
    }

    let sidecar_state = SidecarState(Arc::new(tokio::sync::Mutex::new(None)));
    #[allow(clippy::single_match)]
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        .plugin(tauri_plugin_sentry::init(&sentry_guard));

        #[cfg(target_os = "macos")]
        let app = app.plugin(tauri_nspanel::init());

        let app = app.manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            spawn_screenpipe,
            stop_screenpipe,
            permissions::open_permission_settings,
            permissions::request_permission,
            permissions::do_permissions_check,
            set_tray_unhealth_icon,
            set_tray_health_icon,
            commands::update_show_screenpipe_shortcut,
            commands::get_disk_usage,
            commands::open_pipe_window,
            commands::show_window,
            commands::close_window,
            commands::set_window_size,
            // Onboarding commands
            commands::get_onboarding_status,
            commands::complete_onboarding,
            commands::reset_onboarding,
            commands::show_onboarding_window,
            commands::open_search_window,
            get_log_files,
            get_media_file,
            upload_file_to_s3,
            update_global_shortcuts,
            get_env
        ])
        .setup(|app| {
            //deep link register_all
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            let app_handle = app.handle();

            // Logging setup
            let base_dir =
                get_base_dir(app_handle, None).expect("Failed to ensure local data directory");

            // Set up rolling file appender
            let file_appender = RollingFileAppender::builder()
                .rotation(Rotation::DAILY)
                .filename_prefix("screenpipe-app")
                .filename_suffix("log")
                .max_log_files(5)
                .build(
                    get_screenpipe_data_dir(app.handle())
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

            info!("Local data directory: {}", base_dir.display());

            // PostHog analytics setup
            let posthog_api_key = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce".to_string();
            let interval_hours = 6;

            let path = base_dir.join("store.bin");
            if !path.exists() {
                let _ = File::create(path.clone()).unwrap();
            }

            // Store setup and initialization - must be done first
            let store = store::init_store(&app.handle()).unwrap();
            app.manage(store.clone());

            // Initialize onboarding store
            let onboarding_store = store::init_onboarding_store(&app.handle()).unwrap();
            app.manage(onboarding_store.clone());

            // Show onboarding window if not completed
            if !onboarding_store.is_completed {
                let _ = ShowRewindWindow::Onboarding.show(&app.handle());
            } else {
                let _ = ShowRewindWindow::Main.show(&app.handle());
            }

            // Get app handle once for all initializations
            let app_handle = app.handle().clone();
            let server_running = is_server_running(app_handle.clone());

            // Initialize server first (core service)
            let server_shutdown_tx = spawn_server(app_handle.clone(), 11435);
            app.manage(server_shutdown_tx);

            // Initialize sidecar manager and check dev mode
            let sidecar_manager = Arc::new(Mutex::new(SidecarManager::new()));
            app.manage(sidecar_manager.clone());

            // Dev mode check and sidecar initialization
            let use_dev_mode = store
                .dev_mode;

            info!("use_dev_mode: {}", use_dev_mode);

            // Start sidecar in non-dev mode (production behavior)
            if !use_dev_mode  {
                let sidecar_manager_clone = sidecar_manager.clone();
                let app_handle_clone = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut manager = sidecar_manager_clone.lock().await;
                    if server_running.await.unwrap_or(false) {
                        return;
                    }
                    
                    // Check permissions before spawning sidecar
                    let permissions_check = permissions::do_permissions_check(false);
                    let disable_audio = store.disable_audio;
                    
                    // Always check screen recording permission - this is required and needs restart
                    if !permissions_check.screen_recording.permitted() {
                        warn!("Screen recording permission not granted: {:?}. Sidecar will not start until permission is granted.", permissions_check.screen_recording);
                        // Don't start the sidecar if screen recording permission isn't granted
                        // User will need to grant permission through the onboarding/settings UI and restart
                        return;
                    }
                    
                    // Check microphone permission if audio recording is enabled - but don't block startup
                    if !disable_audio && !permissions_check.microphone.permitted() {
                        warn!("Microphone permission not granted and audio recording is enabled: {:?}. Audio recording will not work until permission is granted, but sidecar will still start.", permissions_check.microphone);
                        // Continue with sidecar startup - microphone permission can be granted at runtime
                    }
                    
                    info!("Screen recording permission granted, spawning screenpipe sidecar. Audio disabled: {}, microphone permission: {:?}", disable_audio, permissions_check.microphone);
                    if let Err(e) = manager.spawn(&app_handle_clone, None).await {
                        error!("Failed to spawn initial sidecar: {}", e);
                    }
                });
            } else {
                debug!("Skipping sidecar spawn: dev_mode enabled");
            }

            // Initialize update check
            let update_manager = start_update_check(&app_handle, 5)?;

            // Setup tray
            if let Some(_) = app_handle.tray_by_id("screenpipe_main") {
                let update_item = update_manager.update_now_menu_item_ref().clone();
                if let Err(e) = tray::setup_tray(&app_handle, &update_item) {
                    error!("Failed to setup tray: {}", e);
                }
            }

            // Check analytics settings from store
            let is_analytics_enabled = store
                .analytics_enabled;

            let is_autostart_enabled = store
                .auto_start_enabled;

            if is_autostart_enabled {
                let _ = autostart_manager.enable();
            } else {
                let _ = autostart_manager.disable();
            }

            debug!(
                "registered for autostart? {}",
                autostart_manager.is_enabled().unwrap()
            );

            let unique_id = store.user.id.unwrap_or_default();
            let email = store.user.email.unwrap_or_default();

            if is_analytics_enabled {
                match start_analytics(
                    unique_id,
                    email,
                    posthog_api_key,
                    interval_hours,
                    "http://localhost:3030".to_string(),
                    base_dir.clone(),
                    is_analytics_enabled,
                ) {
                    Ok(analytics_manager) => {
                        app.manage(analytics_manager);
                    }
                    Err(e) => {
                        error!("Failed to start analytics: {}", e);
                    }
                }
            }

            // Start health check service (macos only)
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_health_check(app_handle_clone).await {
                    error!("Failed to start health check service: {}", e);
                }
            });

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            // Initialize global shortcuts
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = initialize_global_shortcuts(&app_handle_clone).await {
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
            // Send app started event
            let app_handle = app_handle.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(analytics) = app_handle.try_state::<Arc<AnalyticsManager>>() {
                    let _ = analytics
                        .send_event(
                            "app_started",
                            Some(json!({
                                "startup_type": "normal"
                            })),
                        )
                        .await;
                }
            });
        }
        tauri::RunEvent::ExitRequested { .. } => {
            debug!("ExitRequested event");

            // Send app closed event before shutdown
            let app_handle_v2 = app_handle.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(analytics) = app_handle_v2.try_state::<Arc<AnalyticsManager>>() {
                    let _ = analytics
                        .send_event(
                            "app_closed",
                            Some(json!({
                                "shutdown_type": "normal"
                            })),
                        )
                        .await;
                }
            });

            // Shutdown server
            if let Some(server_shutdown_tx) = app_handle.try_state::<mpsc::Sender<()>>() {
                drop(server_shutdown_tx.send(()));
            }
        }

        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } => {
            if let Ok(window_id) = RewindWindowId::from_str(label.as_str()) {
                match window_id {
                    RewindWindowId::Settings => {
                        if let Some(window) = RewindWindowId::Main.get(&app_handle) {
                            let _ = window.destroy();
                        }

                        return;
                    }

                    _ => {}
                }
            }
        }

        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            ..
        } => {


            let _ = ShowRewindWindow::Main.show(&app_handle);
        }
        _ => {}
    });
}
