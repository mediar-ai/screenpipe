// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use commands::load_pipe_config;
use commands::save_pipe_config;
use sidecar::SidecarManager;
use tauri::Config;
use tokio::sync::mpsc;
use serde_json::Value;
use std::env;
use std::fs;
use std::fs::File;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tauri::Wry;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState},
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
#[allow(unused_imports)]
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_store::{with_store, StoreCollection};
use tokio::sync::Mutex;
use tracing::{debug, error, info};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;
use uuid::Uuid;
mod analytics;

use crate::analytics::start_analytics;

mod commands;
mod sidecar;
mod server;
pub use commands::open_screen_capture_preferences;
pub use commands::reset_screen_permissions;
pub use sidecar::kill_all_sreenpipes;
pub use sidecar::spawn_screenpipe;
pub use server::spawn_server;

pub struct SidecarState(Arc<tokio::sync::Mutex<Option<SidecarManager>>>);

fn get_base_dir(app: &tauri::AppHandle, custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = app.path().local_data_dir().unwrap().join("screenpipe");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(&local_data_dir.join("data"))?;
    Ok(local_data_dir)
}

#[tokio::main]
async fn main() {
    let _ = fix_path_env::fix();

    let sidecar_state = SidecarState(Arc::new(tokio::sync::Mutex::new(None)));

    let app = tauri::Builder::default()
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
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            spawn_screenpipe,
            kill_all_sreenpipes,
            reset_screen_permissions,
            open_screen_capture_preferences,
            load_pipe_config,
            save_pipe_config
        ])
        .setup(|app| {
            // Logging setup
            let app_handle = app.handle();
            let base_dir = get_base_dir(&app_handle, None).expect("Failed to ensure local data directory");

            // Set up file appender
            let file_appender = RollingFileAppender::new(
                Rotation::NEVER,
                base_dir.clone(),
                "screenpipe-app.log",
            );

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
                .with(sentry::integrations::tracing::layer())
                .with(file_layer)
                .with(console_layer)
                .init();

            // Initialize Sentry
            let _guard = sentry::init((
                "https://cf682877173997afc8463e5ca2fbe3c7@o4507617161314304.ingest.us.sentry.io/4507617170161664",
                sentry::ClientOptions {
                    release: sentry::release_name!(),
                    traces_sample_rate: 0.2,
                    ..Default::default()
                }
            ));

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

            // Tray setup
            if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                let toggle = MenuItemBuilder::with_id("quit", "Quit screenpipe").build(app)?;
                let menu = MenuBuilder::new(app).items(&[&toggle]).build()?;
                let _ = main_tray.set_menu(Some(menu));
                main_tray.on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => {
                        println!("quit clicked");
                        app.exit(0);
                    }
                    _ => (),
                });
                main_tray.on_tray_icon_event(move |_tray, event| match event {
                    tauri::tray::TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } => {
                        if button == MouseButton::Left && button_state == MouseButtonState::Down {
                            // Handle left click if needed
                        }
                    }
                    _ => {}
                });
            }

            // Store setup and analytics initialization
            let stores = app.state::<StoreCollection<Wry>>();
            let _ = with_store(app.handle().clone(), stores.clone(), path.clone(), |store| {
                if store.keys().count() == 0 {
                    store.insert("analyticsEnabled".to_string(), Value::Bool(true))?;
                    store.insert(
                        "config".to_string(),
                        serde_json::to_value(Config::default())?,
                    )?;
                    store.save()?;
                }
                Ok(())
            });

            let _ = with_store(app.handle().clone(), stores.clone(), path.clone(), |store| {
                store.save()?;

                let is_analytics_enabled = store
                    .get("analyticsEnabled")
                    .unwrap_or(&Value::Bool(true))
                    .as_bool()
                    .unwrap_or(true);

                let unique_id = store
                    .get("userId")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_else(|| {
                        let new_id = Uuid::new_v4().to_string();
                        store
                            .insert(
                                "userId".to_string(),
                                serde_json::Value::String(new_id.clone()),
                            )
                            .unwrap();
                        store.save().unwrap();
                        new_id
                    });

                if is_analytics_enabled {
                    match start_analytics(unique_id, posthog_api_key, interval_hours) {
                        Ok(analytics_manager) => {
                            app.manage(analytics_manager);
                        }
                        Err(e) => {
                            error!("Failed to start analytics: {}", e);
                        }
                    }
                }

                Ok(())
            });

            // Dev mode check and sidecar spawn

            let use_dev_mode = with_store(app.handle().clone(), stores.clone(), path.clone(), |store| {
                Ok(store
                    .get("devMode")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false))
            })
            .unwrap_or(false);

            let sidecar_manager = Arc::new(Mutex::new(SidecarManager::new()));
            app.manage(sidecar_manager.clone());

            let app_handle = app.handle().clone();

            if !use_dev_mode {
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
            let app_handle_clone = app_handle.clone();
            let app_handle_clone2 = app_handle.clone();
            let stores = app_handle.state::<StoreCollection<Wry>>();
            let path = app_handle
                .path()
                .local_data_dir()
                .unwrap()
                .join("store.bin");
            let use_dev_mode = with_store(app_handle.clone(), stores, path, |store| {
                Ok(store
                    .get("devMode")
                    .unwrap_or(&Value::Bool(false))
                    .as_bool()
                    .unwrap_or(false))
            })
            .unwrap_or(false);
            if !use_dev_mode {
                tauri::async_runtime::spawn(async move {
                    let state = app_handle_clone.state::<SidecarState>();
                    if let Err(e) = kill_all_sreenpipes(state, app_handle_clone2).await {
                        error!("Failed to kill screenpipe processes: {}", e);
                    }
                });
            }
            // Add this to shut down the server
            if let Some(server_shutdown_tx) = app_handle.try_state::<mpsc::Sender<()>>() {
                let _ = server_shutdown_tx.send(());
            }
        }
        _ => {}
    });
}
