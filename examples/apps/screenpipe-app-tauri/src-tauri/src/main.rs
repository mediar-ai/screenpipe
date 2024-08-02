// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use dirs::home_dir;
use log::{debug, error, info, LevelFilter};
use logs::MultiWriter;
use tauri::Config;
use tauri_plugin_shell::ShellExt;

use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::Write;

use std::fs;
use std::path::PathBuf;

use tauri::Manager;
use tauri::Wry;
use tauri_plugin_store::{with_store, StoreCollection};

use std::sync::{Arc, Mutex};
use tauri::State;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_shell::process::CommandChild;

mod analytics;

use crate::analytics::start_analytics;
mod logs;

struct SidecarState(Arc<Mutex<Option<CommandChild>>>);

#[tauri::command]
async fn is_running_multiple_instances(
    _state: State<'_, SidecarState>,
    _app: tauri::AppHandle,
) -> Result<u32, String> {
    debug!("is_running_multiple_instances");

    // list screenpipe processes
    let output = if cfg!(windows) {
        tokio::process::Command::new("tasklist")
            .output()
            .await
            .map_err(|e| e.to_string())?
    } else {
        tokio::process::Command::new("ps")
            .arg("-e")
            .arg("-o")
            .arg("pid,comm")
            .output()
            .await
            .map_err(|e| e.to_string())?
    };

    // filter by screenpipe
    let output = String::from_utf8_lossy(&output.stdout);
    let lines = output.split('\n');
    let mut count = 0;
    for line in lines {
        debug!("line: {}", line);
        if line.contains("screenpipe") {
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
async fn kill_all_sreenpipes(
    state: State<'_, SidecarState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Killing screenpipe");

    if let Some(child) = state.0.lock().unwrap().take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    // hard kill the sidecar on port 3030
    let _ = tokio::process::Command::new("pkill")
        .arg("-f")
        .arg("screenpipe")
        .output()
        .await
        .map_err(|e| e.to_string())?;
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

    let use_cloud_audio = with_store(app.clone(), stores, path, |store| {
        Ok(store
            .get("useCloudAudio")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)) // Default to true if not set
    })
    .map_err(|e| e.to_string())?;

    let mut args = vec!["--port", "3030", "--debug", "--self-healing"];
    if !use_cloud_audio {
        args.push("--cloud-audio-off");
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

        let (_, child) = c.spawn().map_err(|e| e.to_string())?;

        debug!("Spawned sidecar with args: {:?}", args);

        return Ok(child);
    }

    let (_, child) = sidecar.args(&args).spawn().map_err(|e| e.to_string())?;

    debug!("Spawned sidecar with args: {:?}", args);

    Ok(child)
}

fn get_base_dir(app: &tauri::AppHandle, custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = app.path().local_data_dir();

    let local_data_dir = custom_path
        .map(PathBuf::from)
        .unwrap_or(default_path.unwrap());

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        // .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            spawn_screenpipe,
            kill_all_sreenpipes,
            is_running_multiple_instances
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
                env::set_var("TESSDATA_PREFIX", tessdata_path);
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
            // let _ = autostart_manager.disable();
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
            let app_name = "screenpipe";
            let interval_hours = 1;

            let path = base_dir.join("store.bin");

            if !path.exists() {
                let _ = File::create(path.clone()).unwrap();
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
                        store.insert("useCloudAudio".to_string(), Value::Bool(true))?;
                        store.insert(
                            "config".to_string(),
                            serde_json::to_value(Config::default())?,
                        )?;
                        store.save()?;
                    }
                    Ok(())
                },
            );

            // Now use the store
            let _ = with_store(app.app_handle().clone(), stores, path, |store| {
                store.save()?;

                let is_analytics_enabled = store
                    .get("analyticsEnabled")
                    .unwrap_or(&Value::Bool(true))
                    .as_bool()
                    .unwrap_or(true);

                if is_analytics_enabled {
                    match start_analytics(posthog_api_key, app_name, interval_hours) {
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

            // Spawn the sidecar initially
            let sidecar_state = app.state::<SidecarState>();
            let app_handle = app.handle().clone();
            let child = spawn_sidecar(&app_handle).expect("Failed to spawn sidecar");
            let mut sidecar = sidecar_state.0.lock().unwrap();
            *sidecar = Some(child);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Run the app
    app.run(|_app_handle, event| match event {
        tauri::RunEvent::Ready { .. } => {
            debug!("Ready event");
        }
        tauri::RunEvent::ExitRequested { .. } => {
            debug!("ExitRequested event");
        }
        _ => {}
    });
}
