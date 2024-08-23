// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Config;

use serde_json::Value;
use std::env;
use std::fs;
use std::fs::File;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri::State;
use tauri::Wry;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState},
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_shell::process::CommandChild;
#[allow(unused_imports)]
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::{with_store, StoreCollection};
use tokio::time::sleep;
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing::{debug, error, info};
use uuid::Uuid;
mod analytics;

use crate::analytics::start_analytics;

struct SidecarState(Arc<Mutex<Option<CommandChild>>>);

#[tauri::command]
async fn kill_all_sreenpipes(
    state: State<'_, SidecarState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Killing screenpipe");

    const MAX_RETRIES: u32 = 3;
    const RETRY_DELAY: Duration = Duration::from_secs(1);

    for attempt in 1..=MAX_RETRIES {
        if let Some(child) = state.0.lock().unwrap().take() {
            if let Err(e) = child.kill() {
                error!("Failed to kill child process (attempt {}): {}", attempt, e);
            }
        }

        // Hard kill the sidecar
        let kill_result = async {
            #[cfg(not(target_os = "windows"))]
            {
                tokio::process::Command::new("pkill")
                    .arg("-f")
                    .arg("screenpipe")
                    .output()
                    .await
            }
            #[cfg(target_os = "windows")]
            {
                tokio::process::Command::new("taskkill")
                    .args(&["/F", "/IM", "screenpipe.exe"])
                    .output()
                    .await
            }
        }
        .await;

        match kill_result {
            Ok(_) => {
                debug!("Successfully killed screenpipe processes");
                return Ok(());
            }
            Err(e) => {
                error!(
                    "Failed to kill screenpipe processes (attempt {}): {}",
                    attempt, e
                );
                if attempt < MAX_RETRIES {
                    sleep(RETRY_DELAY).await;
                }
            }
        }
    }

    Err("Failed to kill screenpipe processes after multiple attempts".to_string())
}

#[tauri::command]
async fn spawn_screenpipe(
    state: State<'_, SidecarState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let sidecar_running = state.0.lock().unwrap().is_some();
    if !sidecar_running {
        // Spawn the sidecar
        let child = spawn_sidecar(&app)?;
        // Update the state after spawning
        state.0.lock().unwrap().replace(child);
    }
    debug!("Spawned sidecar thru cli");
    Ok(())
}

fn spawn_sidecar(app: &tauri::AppHandle) -> Result<CommandChild, String> {
    let sidecar = app.shell().sidecar("screenpipe").unwrap();
    // Get the current settings
    let stores = app.state::<StoreCollection<Wry>>();
    let base_dir = get_base_dir(app, None).expect("Failed to ensure local data directory");

    let path = base_dir.join("store.bin");

    let audio_transcription_engine =
        with_store(app.clone(), stores.clone(), path.clone(), |store| {
            Ok(store
                .get("audioTranscriptionEngine")
                .and_then(|v| v.as_str().map(String::from)))
        })
        .map_err(|e| e.to_string())?
        .unwrap_or(String::from("default"));

    let ocr_engine = with_store(app.clone(), stores.clone(), path.clone(), |store| {
        Ok(store
            .get("ocrEngine")
            .and_then(|v| v.as_str().map(String::from)))
    })
    .map_err(|e| e.to_string())?
    .unwrap_or(String::from("default"));

    let monitor_id = with_store(app.clone(), stores.clone(), path.clone(), |store| {
        Ok(store
            .get("monitorId")
            .and_then(|v| v.as_str().map(String::from)))
    })
    .map_err(|e| e.to_string())?
    .unwrap_or(String::from("default"));

    let audio_devices = with_store(app.clone(), stores.clone(), path.clone(), |store| {
        Ok(store
            .get("audioDevices")
            .and_then(|v| v.as_array())
            .map(|arr| arr.to_vec()))
    })
    .map_err(|e| e.to_string())?
    .unwrap_or_default();

    let use_pii_removal = with_store(app.clone(), stores.clone(), path.clone(), |store| {
        Ok(store
            .get("usePiiRemoval")
            .and_then(|v| v.as_bool())
            .unwrap_or(false))
    })
    .map_err(|e| e.to_string())?;

    let _data_dir_str = base_dir.to_string_lossy();
    let mut args = vec!["--port", "3030"];
    // if macos do --fps 0.2
    if cfg!(target_os = "macos") {
        args.push("--fps");
        args.push("0.2");
    }

    if audio_transcription_engine != "default" {
        args.push("--audio-transcription-engine");
        let model = audio_transcription_engine.as_str();
        args.push(model);
    }

    if ocr_engine != "default" {
        args.push("--ocr-engine");
        let model = ocr_engine.as_str();
        args.push(model);
    }
    if monitor_id != "default" {
        args.push("--monitor-id");
        let id = monitor_id.as_str();
        args.push(id);
    }

    if !audio_devices.is_empty() && audio_devices[0] != Value::String("default".to_string()) {
        for device in &audio_devices {
            args.push("--audio-device");
            args.push(device.as_str().unwrap());
        }
    }

    if use_pii_removal {
        args.push("--use-pii-removal");
    }

    // hardcode TESSDATA_PREFIX for windows
    if cfg!(windows) {
        let exe_dir = env::current_exe()
            .expect("Failed to get current executable path")
            .parent()
            .expect("Failed to get parent directory of executable")
            .to_path_buf();
        let tessdata_path = exe_dir.join("tessdata");
        let c = sidecar.env("TESSDATA_PREFIX", tessdata_path).args(&args);

        let (_, child) = c.spawn().map_err(|e| {
            error!("Failed to spawn sidecar: {}", e);
            e.to_string()
        })?;

        info!("Spawned sidecar with args: {:?}", args);

        return Ok(child);
    }

    let result = sidecar.args(&args).spawn();

    if let Err(e) = result {
        error!("Failed to spawn sidecar: {}", e);
        return Err(e.to_string());
    }

    #[allow(unused_mut, unused_variables)]
    let (mut rx, child) = result.unwrap();

    // only in production mode because it breaks the "bun tauri dev"
    #[cfg(not(debug_assertions))]
    tauri::async_runtime::spawn(async move {
        #[allow(unused_variables)]
        let mut i = 0;
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line) = event {
                print!("{}", String::from_utf8(line).unwrap());
                i += 1;
            } else if let CommandEvent::Stderr(line) = event {
                error!("Sidecar stderr: {}", String::from_utf8(line).unwrap());
            }
        }
    });

    info!("Spawned sidecar with args: {:?}", args);

    Ok(child)
}

fn get_base_dir(app: &tauri::AppHandle, custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = app.path().local_data_dir().unwrap().join("screenpipe");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(&local_data_dir.join("data"))?;
    Ok(local_data_dir)
}

#[tokio::main]
async fn main() {
    let _ = fix_path_env::fix();

    let sidecar_state = SidecarState(Arc::new(Mutex::new(None)));

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

            let port = 3030;
            app.manage(port);

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
            let mut use_dev_mode = false;
            let _ = with_store(app.handle().clone(), stores, path, |store| {
                use_dev_mode = store
                    .get("devMode")
                    .unwrap_or(&Value::Bool(false))
                    .as_bool()
                    .unwrap_or(false);
                Ok(())
            });

            if !use_dev_mode {
                let sidecar_state = app.state::<SidecarState>();
                let app_handle = app.handle().clone();
                let child = spawn_sidecar(&app_handle).unwrap();
                let mut sidecar = sidecar_state.0.lock().unwrap();
                *sidecar = Some(child);
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
        }
        _ => {}
    });
}
