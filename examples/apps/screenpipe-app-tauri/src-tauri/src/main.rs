// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use log::{debug, error, info, LevelFilter};
use logs::MultiWriter;
use tauri::Config;

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


use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    utils::assets::EmbeddedAssets
};
use tauri::image::Image;

mod analytics;

use crate::analytics::start_analytics;
mod logs;

struct SidecarState(Arc<Mutex<Option<CommandChild>>>);


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
        .manage(sidecar_state)
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
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

            // Add System Tray 
            let toggle = MenuItemBuilder::with_id("toggle", "Screenpipe").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&toggle]).build()?;

            let icon_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("icons")
                .join("32x32.png");

            let icon = Image::from_path(icon_path).expect("Failed to load icon");

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .icon(icon)
                .on_menu_event(move |_app, event| match event.id().as_ref() {
                    "toggle" => {
                        println!("toggle clicked");
                    }
                    _ => (),
                })
                .on_tray_icon_event(|_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        println!("tray closed");
                    }
                })
                .build(app)?;

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
