// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use log::{debug, error, info, LevelFilter};
use logs::MultiWriter;
use tauri::Config;

use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::Write;
use tauri_plugin_shell::process::CommandEvent;

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
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
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::{with_store, StoreCollection};
use uuid::Uuid;
mod analytics;

use crate::analytics::start_analytics;
mod logs;

struct SidecarState(Arc<Mutex<Option<CommandChild>>>);

#[tauri::command]
async fn kill_all_sreenpipes(
    state: State<'_, SidecarState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Killing screenpipe");

    if let Some(child) = state.0.lock().unwrap().take() {
        child.kill().map_err(|e| e.to_string())?;
    }

    // Hard kill the sidecar
    #[cfg(not(target_os = "windows"))]
    {
        let _ = tokio::process::Command::new("pkill")
            .arg("-f")
            .arg("screenpipe")
            .output()
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = tokio::process::Command::new("taskkill")
            .args(&["/F", "/IM", "screenpipe.exe"])
            .output()
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
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

    let (mut rx, child) = result.unwrap();

    tauri::async_runtime::spawn(async move {
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

    let _guard = sentry::init((
        "https://cf682877173997afc8463e5ca2fbe3c7@o4507617161314304.ingest.us.sentry.io/4507617170161664", sentry::ClientOptions {
        release: sentry::release_name!(),
        traces_sample_rate: 0.2,
        ..Default::default()
      }));

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
        .setup(move |app| {
            // run this on windows only
            if cfg!(windows) {
                // Get the directory of the executable
                let exe_dir = env::current_exe()
                    .expect("Failed to get current executable path")
                    .parent()
                    .expect("Failed to get parent directory of executable")
                    .to_path_buf();

                // Set the TESSDATA_PREFIX environment variable
                let tessdata_path = exe_dir.join("tessdata");
                unsafe {
                    env::set_var("TESSDATA_PREFIX", tessdata_path);
                }
            }

            // Get the autostart manager
            let autostart_manager = app.autolaunch();
            // Enable autostart
            let _ = autostart_manager.enable();
            // Check enable state
            debug!(
                "registered for autostart? {}",
                autostart_manager.is_enabled().unwrap()
            );
            // Disable autostart
            let app_handle = app.handle().clone();

            let base_dir =
                get_base_dir(&app_handle, None).expect("Failed to ensure local data directory");
            let port = 3030;

            app.manage(port);

            let debug = true;

            let mut builder = env_logger::Builder::new();
            builder
                .filter(None, LevelFilter::Info)
                .filter_module("tokenizers", LevelFilter::Error)
                .filter_module("rusty_tesseract", LevelFilter::Error)
                .filter_module("symphonia", LevelFilter::Error);

            if debug {
                builder.filter_module("screenpipe", LevelFilter::Debug);
                builder.filter_module("app", LevelFilter::Debug);
            }

            let log_file =
                File::create(format!("{}/screenpipe-app.log", base_dir.to_string_lossy())).unwrap();
            let multi_writer = MultiWriter::new(vec![
                Box::new(log_file) as Box<dyn Write + Send>,
                Box::new(std::io::stdout()) as Box<dyn Write + Send>,
            ]);

            builder.target(env_logger::Target::Pipe(Box::new(multi_writer)));
            builder.format_timestamp_secs().init();

            info!("Local data directory: {}", base_dir.display());

            let posthog_api_key = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce".to_string();
            let interval_hours = 1;

            let path = base_dir.join("store.bin");

            if !path.exists() {
                let _ = File::create(path.clone()).unwrap();
            }

            if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                // Add System Tray
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
                            // if let Err(err) = tray.app_handle().emit("cap://tray/clicked", ()) {
                            //     eprintln!("Failed to emit event for tray {}", err);
                            // };
                        }
                    }
                    _ => {}
                });
            }

            let stores = app.app_handle().state::<StoreCollection<Wry>>();

            // Initialize the store with default values if it doesn't exist
            let _ = with_store(
                app.app_handle().clone(),
                stores.clone(),
                path.clone(),
                |store| {
                    if store.keys().count() == 0 {
                        // Set default values
                        store.insert("analyticsEnabled".to_string(), Value::Bool(true))?;
                        store.insert(
                            "config".to_string(),
                            serde_json::to_value(Config::default())?,
                        )?;
                        store.save()?;
                    }
                    Ok(())
                },
            );

            let path_clone = path.clone();
            let stores_clone = stores.clone();

            // Now use the store
            let _ = with_store(
                app.app_handle().clone(),
                stores_clone,
                path_clone,
                |store| {
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
                },
            );

            let mut use_dev_mode = false;
            let _ = with_store(app.app_handle().clone(), stores, path, |store| {
                use_dev_mode = store
                    .get("devMode")
                    .unwrap_or(&Value::Bool(false))
                    .as_bool()
                    .unwrap_or(false);

                Ok(())
            });

            if !use_dev_mode {
                // Spawn the sidecar initially
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

    // Run the app
    app.run(|app_handle, event| match event {
        tauri::RunEvent::Ready { .. } => {
            debug!("Ready event");
        }
        tauri::RunEvent::ExitRequested { .. } => {
            debug!("ExitRequested event");
            // kill all screenpipe processes if the user is not using dev mode using pkill
            // get dev mode from the store
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
                    #[cfg(not(target_os = "windows"))]
                    {
                        let _ = tokio::process::Command::new("pkill")
                            .arg("-f")
                            .arg("screenpipe")
                            .output()
                            .await;
                    }
                    #[cfg(target_os = "windows")]
                    {
                        let _ = tokio::process::Command::new("taskkill")
                            .args(&["/F", "/IM", "screenpipe.exe"])
                            .output()
                            .await;
                    }
                });
            }
        }
        _ => {}
    });
}
