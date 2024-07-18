// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use dirs::home_dir;
use log::{error, info, LevelFilter};
use logs::MultiWriter;
use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, DeviceControl,
};
use screenpipe_server::{start_continuous_recording, DatabaseManager, ResourceMonitor, Server};
use serde::{Deserialize, Serialize};

use serde_json::Value;
use tauri::{State, Wry};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::{with_store, StoreCollection};

use std::fs::File;
use std::io::Write;
use std::ops::Deref;
use std::path::PathBuf;
use std::{
    fs,
    net::SocketAddr,
    sync::{atomic::AtomicBool, Arc},
    time::Duration,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_cli::CliExt;

use tauri_plugin_autostart::MacosLauncher;
mod analytics;
use analytics::AnalyticsManager;

use crate::analytics::start_analytics;
mod logs;

fn ensure_local_data_dir(
    custom_path: Option<String>,
) -> Result<String, Box<dyn std::error::Error>> {
    let default_path = home_dir()
        .ok_or("Failed to get home directory")?
        .join(".screenpipe")
        .join("data");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(&local_data_dir)?;
    Ok(local_data_dir.to_string_lossy().into_owned())
}

async fn initialize_database(local_data_dir: Arc<String>) -> Arc<DatabaseManager> {
    Arc::new(
        DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir))
            .await
            .unwrap(),
    )
}

#[derive(Default)]
struct TrayState {
    menu: Option<tauri::menu::Menu<tauri::Wry>>,
}

#[derive(Serialize, Deserialize)]
struct Preferences {
    autostart_enabled: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            autostart_enabled: true, // Set to true by default
        }
    }
}

async fn setup_server_and_recording(
    app: tauri::AppHandle,
    db: Arc<DatabaseManager>,
    local_data_dir: Arc<String>,
    port: u16,
    fps: f64,
    audio_chunk_duration: u64,
    disable_audio: bool,
    memory_threshold: f64,
    runtime_threshold: u64,
) {
    info!("Setting up server and recording...");
    info!("Configuration: port={}, fps={}, audio_chunk_duration={}s, disable_audio={}, memory_threshold={}%, runtime_threshold={}s",
        port, fps, audio_chunk_duration, disable_audio, memory_threshold, runtime_threshold);

    let (audio_devices_control_sender, audio_devices_control_receiver) =
        tokio::sync::mpsc::channel(64);
    let mut audio_devices = Vec::new();
    let mut devices_status = std::collections::HashMap::new();

    if !disable_audio {
        info!("Initializing audio devices...");
        let all_audio_devices = list_audio_devices().unwrap_or_default();

        for device in all_audio_devices {
            let device_control = DeviceControl {
                is_running: false,
                is_paused: false,
            };
            info!("Audio device: {:?}", device.to_string());
            devices_status.insert(device, device_control);
        }

        if let Ok(input_device) = default_input_device() {
            info!("Default input device found: {:?}", input_device.to_string());
            audio_devices.push(Arc::new(input_device.clone()));
            devices_status.get_mut(&input_device).unwrap().is_running = true;
        }
        if let Ok(output_device) = default_output_device() {
            info!(
                "Default output device found: {:?}",
                output_device.to_string()
            );
            audio_devices.push(Arc::new(output_device.clone()));
            devices_status.get_mut(&output_device).unwrap().is_running = true;
        }

        if audio_devices.is_empty() {
            error!("No audio devices available. Audio recording will be disabled.");
        } else {
            info!("Using audio devices:");
            for device in &audio_devices {
                info!("  {}", device);
                let device_clone = device.deref().clone();
                let sender_clone = audio_devices_control_sender.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(15)).await;
                    let _ = sender_clone
                        .send((
                            device_clone,
                            DeviceControl {
                                is_running: true,
                                is_paused: false,
                            },
                        ))
                        .await;
                });
            }
        }
    } else {
        info!("Audio recording is disabled");
    }

    info!("Starting resource monitoring...");
    ResourceMonitor::new(memory_threshold, runtime_threshold, false)
        .start_monitoring(Duration::from_secs(10));

    let db_record = db.clone();
    let db_server = db.clone();

    let (_control_tx, control_rx) = tokio::sync::mpsc::channel(64);
    let vision_control = Arc::new(AtomicBool::new(true));
    let vision_control_server_clone = vision_control.clone();

    info!("Spawning continuous recording task...");
    let _recording_task = tokio::spawn({
        let local_data_dir = local_data_dir.clone();
        async move {
            let audio_chunk_duration = Duration::from_secs(audio_chunk_duration);

            info!("Starting continuous recording...");
            start_continuous_recording(
                db_record,
                local_data_dir,
                fps,
                audio_chunk_duration,
                control_rx,
                vision_control,
                audio_devices_control_receiver,
            )
            .await
        }
    });
    let _app_handle = app.app_handle();

    let analytics_manager = app.state::<Arc<AnalyticsManager>>().inner().clone();
    let api_plugin = move |req: &axum::http::Request<axum::body::Body>| {
        if req.uri().path() == "/search" {
            let analytics_manager = analytics_manager.clone();
            tokio::spawn(async move {
                if let Err(e) = analytics_manager.track_search().await {
                    error!("Failed to track search request: {}", e);
                }
            });
        }
    };
    info!("Spawning server task...");
    tokio::spawn(async move {
        let server = Server::new(
            db_server,
            SocketAddr::from(([0, 0, 0, 0], port)),
            vision_control_server_clone,
            audio_devices_control_sender,
        );
        info!("Starting server...");

        if let Err(e) = server.start(devices_status, api_plugin).await {
            error!("Failed to start server: {}", e);
        }
    });

    info!("Server started on http://localhost:{}", port);
}

#[tokio::main]
async fn main() {
    let _guard = sentry::init(("https://cf682877173997afc8463e5ca2fbe3c7@o4507617161314304.ingest.us.sentry.io/4507617170161664", sentry::ClientOptions {
        release: sentry::release_name!(),
        ..Default::default()
      }));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(TrayState::default())
        .setup(move |app| {
            let cli = app.cli().matches().expect("Failed to get CLI matches");

            let local_data_dir = Arc::new(
                ensure_local_data_dir(
                    cli.args
                        .get("data-dir")
                        .and_then(|v| Some(v.value.to_string())),
                )
                .expect("Failed to ensure local data directory"),
            );

            let port = cli
                .args
                .get("port")
                .and_then(|v| v.value.as_u64())
                .unwrap_or(3000) as u16;
            let fps = cli
                .args
                .get("fps")
                .and_then(|v| v.value.as_f64())
                .unwrap_or(30.0);
            let audio_chunk_duration = cli
                .args
                .get("audio-chunk-duration")
                .and_then(|v| v.value.as_u64())
                .unwrap_or(5);
            let disable_audio = cli
                .args
                .get("disable-audio")
                .and_then(|v| v.value.as_bool())
                .unwrap_or(false);
            let memory_threshold = cli
                .args
                .get("memory-threshold")
                .and_then(|v| v.value.as_f64())
                .unwrap_or(80.0);
            let runtime_threshold = cli
                .args
                .get("runtime-threshold")
                .and_then(|v| v.value.as_u64())
                .unwrap_or(3600);

            app.manage(port);

            let debug = cli
                .args
                .get("debug")
                .and_then(|v| v.value.as_bool())
                .unwrap_or(false);

            let mut builder = env_logger::Builder::new();
            builder
                .filter(None, LevelFilter::Info)
                .filter_module("tokenizers", LevelFilter::Error)
                .filter_module("rusty_tesseract", LevelFilter::Error)
                .filter_module("symphonia", LevelFilter::Error);

            if debug {
                builder.filter_module("screenpipe", LevelFilter::Debug);
            }

            // Add file logging
            let log_dir = home_dir()
                .ok_or("Failed to get home directory")?
                .join(".screenpipe");

            let log_file =
                File::create(format!("{}/screenpipe.log", log_dir.to_string_lossy())).unwrap();
            // Create a multi-writer that writes to both file and stdout
            let multi_writer = MultiWriter::new(vec![
                Box::new(log_file) as Box<dyn Write + Send>,
                Box::new(std::io::stdout()) as Box<dyn Write + Send>,
            ]);

            builder.target(env_logger::Target::Pipe(Box::new(multi_writer)));
            builder.format_timestamp_secs().init();
            let posthog_api_key = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce".to_string();
            let app_name = "screenpipe";
            let interval_hours = 1; // Send event every 1 hour

            let path = log_dir.join("store.bin");

            // create file if not exists
            if !path.exists() {
                let _ = File::create(path.clone()).unwrap();
            }

            let stores = app.app_handle().state::<StoreCollection<Wry>>();

            let _ = with_store(app.app_handle().clone(), stores, path, |store| {
                // Note that values must be serde_json::Value instances,
                // otherwise, they will not be compatible with the JavaScript bindings.
                // store.insert("some-key".to_string(), json!({ "value": 5 }))?;

                // Get a value from the store.
                // let value = store
                //     .get("some-key")
                //     .expect("Failed to get value from store");
                // println!("{}", value); // {"value":5}

                // You can manually save the store after making changes.
                // Otherwise, it will save upon graceful exit as described above.
                store.save()?;

                let is_analytics_enabled = store
                    .get("analytics_enabled")
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

            let handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let db = initialize_database(local_data_dir.clone()).await;
                handle.manage(db.clone());

                setup_server_and_recording(
                    handle,
                    db,
                    local_data_dir,
                    port,
                    fps,
                    audio_chunk_duration,
                    disable_audio,
                    memory_threshold,
                    runtime_threshold,
                )
                .await;
            });

            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let send_feedback_item =
                MenuItemBuilder::with_id("send_feedback", "Send Feedback").build(app)?;
            let toggle_analytics_item =
                MenuItemBuilder::with_id("toggle_analytics", "Disable Analytics").build(app)?;
            let toggle_autostart_item =
                MenuItemBuilder::with_id("toggle_autostart", "Disable Autostart").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&send_feedback_item)
                .item(&toggle_analytics_item)
                .item(&toggle_autostart_item)
                .separator()
                .item(&quit_item)
                .build()?;

            app.manage(TrayState {
                menu: Some(menu.clone()),
            });

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    let tray_state: State<TrayState> = app.state();
                    let menu = tray_state.menu.as_ref().unwrap();

                    match event.id().as_ref() {
                        "quit" => {
                            std::process::exit(0);
                        }
                        "send_feedback" => {
                            let email = "louis@screenpi.pe";
                            let subject = "Screenpipe Feedback";
                            let body = r#"Please enter your feedback here...
                            
    ... or let's chat?
    https://cal.com/louis030195/screenpipe
                            "#;
                            let url = format!("mailto:{}?subject={}&body={}", email, subject, body);
                            let app_handle = app.app_handle();
                            if let Err(e) = app_handle.shell().open(url, None) {
                                error!("Failed to open URL: {}", e);
                            }
                        }
                        "toggle_analytics" => {
                            let analytics_manager = app.state::<Arc<AnalyticsManager>>();
                            let is_enabled = analytics_manager.toggle_analytics();
                            if let Some(item) = menu.get("toggle_analytics") {
                                if is_enabled {
                                    let _ =
                                        item.as_menuitem().unwrap().set_text("Enable Analytics");
                                } else {
                                    let _ =
                                        item.as_menuitem().unwrap().set_text("Disable Analytics");
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Run the app
    app.run(|_, _| {});
}
