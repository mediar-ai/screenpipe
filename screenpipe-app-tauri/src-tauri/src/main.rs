// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use commands::load_pipe_config;
use commands::save_pipe_config;
use commands::show_main_window;
use llm_sidecar::EmbeddedLLMSettings;
use serde_json::Value;
use sidecar::SidecarManager;
use tauri::Emitter;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;
use tokio::time::Instant;
use std::env;
use std::fs;
use std::fs::File;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::Config;
use tauri::Manager;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState},
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
#[allow(unused_imports)]
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_store::StoreBuilder;
use tokio::runtime::Handle;
use tokio::sync::mpsc;
use tokio::sync::Mutex as TokioMutex;
use tracing::{debug, error, info};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;
use updates::start_update_check;
use uuid::Uuid;
mod analytics;

use crate::analytics::start_analytics;
use crate::llm_sidecar::LLMSidecar;

mod commands;
mod llm_sidecar;
mod server;
mod sidecar;
mod updates;
pub use commands::open_screen_capture_preferences;
pub use commands::reset_all_pipes;
pub use commands::reset_screen_permissions;
pub use server::spawn_server;
pub use sidecar::kill_all_sreenpipes;
pub use sidecar::spawn_screenpipe;

pub struct SidecarState(Arc<tokio::sync::Mutex<Option<SidecarManager>>>);

static SHORTCUT_LOCK: AtomicBool = AtomicBool::new(false);
static mut LAST_TRIGGER: Option<Instant> = None;
const DEBOUNCE_DURATION: Duration = Duration::from_millis(500);

fn get_base_dir(app: &tauri::AppHandle, custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = app.path().local_data_dir().unwrap().join("screenpipe");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(&local_data_dir.join("data"))?;
    Ok(local_data_dir)
}

fn send_recording_notification(
    app_handle: &tauri::AppHandle,
    success: bool,
    action: &str,
    error_msg: Option<&str>
) {
    let (title, body, event) = if success {
        ("Screenpipe", 
         format!("Recording {}", action),
         format!("recording_{}", action))
    } else {
        ("Screenpipe",
         format!("Failed to {} recording", action),
         "recording_failed".to_string())
    };

    if let Some(err) = error_msg {
        error!("Recording operation failed: {}", err);
    }

    let _ = app_handle.notification().builder()
        .title(title)
        .body(&body)
        .show();
    let _ = app_handle.emit(&event, body);
}

#[tokio::main]
async fn main() {
    let _ = fix_path_env::fix();

    let sidecar_state = SidecarState(Arc::new(tokio::sync::Mutex::new(None)));
    #[allow(clippy::single_match)]
    let app = tauri::Builder::default()
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
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                debug!("Shortcut triggered: {:?}, Event: {:?}", shortcut, event);

                fn normalize_shortcut(shortcut: &str) -> String {
                    let parts: Vec<&str> = shortcut.split('+').collect();
                    let mut modifiers: Vec<String> = parts[..parts.len() - 1]
                        .iter()
                        .map(|s| s.to_lowercase())
                        .collect();
                    modifiers.sort();
                    let key = parts.last().unwrap().replace("Key", "").to_lowercase();
                    debug!("normalized_shortcut: {:?}", format!("{}{}", modifiers.join("+"), key));
                    
                    format!("{}{}", modifiers.join("+"), key)
                }

                if !SHORTCUT_LOCK.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_ok() {
                    debug!("Shortcut handler already running");
                    return;
                }

                unsafe {
                    if let Some(last) = LAST_TRIGGER {
                        if last.elapsed() < DEBOUNCE_DURATION {
                            SHORTCUT_LOCK.store(false, Ordering::Release);
                            return;
                        }
                    }
                    LAST_TRIGGER = Some(Instant::now());
                }

                match event.state() {
                    ShortcutState::Pressed => {
                        let normalized_shortcut = normalize_shortcut(&shortcut.to_string());
                        let store = app.store(app.path().local_data_dir().unwrap().join("screenpipe").join("store.bin"));
                        
                        let show_screenpipe_shortcut = store.get("show_screenpipe_shortcut")
                            .and_then(|v| v.as_str().map(String::from))
                            .unwrap_or_default();
                        let toggle_recording_shortcut = store.get("toggle_recording_shortcut")
                            .and_then(|v| v.as_str().map(String::from))
                            .unwrap_or_default();

                        let normalized_show_shortcut = if !show_screenpipe_shortcut.is_empty() {
                            normalize_shortcut(&show_screenpipe_shortcut)
                        } else {
                            String::new()
                        };
                        
                        let normalized_toggle_shortcut = if !toggle_recording_shortcut.is_empty() {
                            normalize_shortcut(&toggle_recording_shortcut)
                        } else {
                            String::new()
                        };

                        debug!("Normalized shortcuts - Current: {}, Show: {}, Toggle: {}", 
                            normalized_shortcut, normalized_show_shortcut, normalized_toggle_shortcut);

                        if !normalized_show_shortcut.is_empty() && normalized_shortcut == normalized_show_shortcut {
                            show_main_window(&app, true);
                        } else if !normalized_toggle_shortcut.is_empty() && normalized_shortcut == normalized_toggle_shortcut {
                            debug!("Executing toggle_recording");
                            let app_handle = app.clone();
                            
                            tauri::async_runtime::spawn(async move {
                                let state = app_handle.state::<SidecarState>();
                                
                                let is_running = {
                                    let sidecar = state.0.lock().await;
                                    match &*sidecar {
                                        Some(manager) => manager.child.is_some(),
                                        None => false
                                    }
                                }; 
                                
                                debug!("Sidecar running state: {}", is_running);

                                let result = if is_running {
                                    debug!("Stopping screenpipe via shortcut");
                                    kill_all_sreenpipes(state.clone(), app_handle.clone()).await
                                } else {
                                    debug!("Starting screenpipe via shortcut");
                                    spawn_screenpipe(state.clone(), app_handle.clone()).await
                                };

                                match result {
                                    Ok(_) => {
                                        let (title, body, event) = if is_running {
                                            ("Screenpipe", "Recording stopped", "recording_stopped")
                                        } else {
                                            ("Screenpipe", "Recording started", "recording_started")
                                        };
                                        
                                        let _ = app_handle.notification().builder()
                                            .title(title)
                                            .body(body)
                                            .show();
                                        let _ = app_handle.emit(event, body);
                                    },
                                    Err(err) => {
                                        error!("Recording operation failed: {}", err);
                                        let _ = app_handle.notification().builder()
                                            .title("Screenpipe")
                                            .body("Recording operation failed")
                                            .show();
                                        let _ = app_handle.emit("recording_failed", "Recording operation failed");
                                    }
                                }
                            });
                        }
                    },
                    ShortcutState::Released => {
                        debug!("Shortcut released: {:?}", shortcut);
                    },
                }
                SHORTCUT_LOCK.store(false, Ordering::Release);
            })
            .build())
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            spawn_screenpipe,
            kill_all_sreenpipes,
            reset_screen_permissions,
            open_screen_capture_preferences,
            load_pipe_config,
            save_pipe_config,
            reset_all_pipes,
            llm_sidecar::start_ollama_sidecar,
            llm_sidecar::stop_ollama_sidecar,
            commands::register_shortcuts,
            commands::unregister_all_shortcuts,  
            commands::show_timeline,
        ])
        .setup(|app| {
            // Logging setup
            let app_handle = app.handle();
            let base_dir =
                get_base_dir(&app_handle, None).expect("Failed to ensure local data directory");

            // Set up rolling file appender
            let file_appender = RollingFileAppender::builder()
                .rotation(Rotation::DAILY)
                .filename_prefix("screenpipe-app")
                .filename_suffix("log")
                .max_log_files(5)
                .build(&app.path().home_dir().unwrap().join(".screenpipe"))?;

            // Create a custom layer for file logging
            let file_layer = tracing_subscriber::fmt::layer()
                .with_writer(file_appender)
                .with_ansi(false)
                .with_filter(EnvFilter::new("info"));

            // Create a custom layer for console logging
            let console_layer = tracing_subscriber::fmt::layer()
                .with_writer(std::io::stdout)
                .with_filter(EnvFilter::new("debug"));

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
                    MenuItemBuilder::with_id("start_recording", "Start Recording").build(app)?;
                let stop_recording =
                    MenuItemBuilder::with_id("stop_recording", "Stop Recording").build(app)?;
                let menu_divider = PredefinedMenuItem::separator(app)?;
                let quit = MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[
                        &show,
                        &start_recording,
                        &stop_recording,
                        update_manager.update_now_menu_item_ref(),
                        &menu_divider,
                        &quit,
                    ])
                    .build()?;
                let _ = main_tray.set_menu(Some(menu));

                main_tray.on_menu_event(move |app_handle, event| match event.id().as_ref() {
                    "show" => {
                        show_main_window(app_handle, false);
                    }
                    "quit" => {
                        debug!("Quit requested");
                        // First try to stop any running recordings
                        let state = app_handle.state::<SidecarState>();
                        tauri::async_runtime::block_on(async {
                            if let Err(e) = kill_all_sreenpipes(state, app_handle.clone()).await {
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
                                send_recording_notification(&app_handle, false, "start", Some(&err.to_string()));
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
                                let _ = app_handle.notification().builder()
                                    .title("Screenpipe")
                                    .body("Failed to stop recording")
                                    .show();
                                let _ = app_handle.emit("recording_failed", "Failed to stop recording");
                            } else {
                                let _ = app_handle.notification().builder()
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
                                // i think it shouldn't kill if we're in dev mode (on macos, windows need to kill)
                                // bad UX: i use CLI and it kills my CLI because i updated app
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
                                show_main_window(&app, true);
                            }
                        }
                    }
                    _ => {}
                });
            }

            // Store setup and analytics initialization
            let store = StoreBuilder::new(app.handle(), path.clone()).build();

            if store.keys().len() == 0 {
                store.set("analyticsEnabled".to_string(), Value::Bool(true));
                store.set(
                    "config".to_string(),
                    serde_json::to_value(Config::default())?,
                );
                store.save()?;
            }

            store.save()?;

            // Ensure state is managed before calling update_show_screenpipe_shortcut
            let sidecar_manager = Arc::new(TokioMutex::new(SidecarManager::new()));
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

            // if first time user do t start sidecar yet
            let mut is_first_time_user = store
                .get("isFirstTimeUser")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

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

            if has_files {
                is_first_time_user = false;
                // Update the store with the new value
                store.set("isFirstTimeUser".to_string(), Value::Bool(false));
                store.save().unwrap();
            }

            let sidecar_manager = Arc::new(TokioMutex::new(SidecarManager::new()));
            app.manage(sidecar_manager.clone());

            let app_handle = app.handle().clone();

            info!(
                "will start sidecar: {}",
                !use_dev_mode && !is_first_time_user
            );

            if !use_dev_mode && !is_first_time_user {
                tauri::async_runtime::spawn(async move {
                    let mut manager = sidecar_manager.lock().await;
                    if let Err(e) = manager.spawn(&app_handle).await {
                        error!("Failed to spawn initial sidecar: {}", e);
                    }

                    // Spawn a background task to check and restart periodically
                    let mut manager = sidecar_manager.lock().await;
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

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);


            // LLM Sidecar setup
            let embedded_llm: EmbeddedLLMSettings = store
                .get("embeddedLLM")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_else(|| EmbeddedLLMSettings {
                    enabled: false,
                    model: "llama3.2:3b-instruct-q4_K_M".to_string(),
                    port: 11438,
                });

            if embedded_llm.enabled {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match LLMSidecar::new(embedded_llm).start(app_handle).await {
                        Ok(result) => {
                            info!("LLM Sidecar started successfully: {}", result);
                        }
                        Err(e) => {
                            error!("Failed to start LLM Sidecar: {}", e);
                        }
                    }
                });
            }


            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::Ready { .. } => {
            debug!("Ready event");
        }
        tauri::RunEvent::ExitRequested { .. } => {
            debug!("ExitRequested event");

            // Add this to shut down the server
            if let Some(server_shutdown_tx) = app_handle.try_state::<mpsc::Sender<()>>() {
                let _ = server_shutdown_tx.send(());
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
                show_main_window(&app_handle, false);
            }
        }
        _ => {}
    });
}

