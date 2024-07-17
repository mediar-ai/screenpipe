// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use dirs::home_dir;
use log::{error, info, LevelFilter};
use reqwest::Client;
use screenpipe_audio::{default_input_device, default_output_device, DeviceControl};
use screenpipe_server::{start_continuous_recording, DatabaseManager, ResourceMonitor, Server};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};
use tauri_plugin_autostart::MacosLauncher;
mod analytics;
use analytics::{start_analytics, AnalyticsManager};
mod logs;
use logs::MultiWriter;

async fn toggle_recording(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let port = app.state::<u16>();
    let base_url = format!("http://localhost:{}", *port);

    info!("Toggling recording. Base URL: {}", base_url);

    // Toggle vision recording
    let vision_status: Value = client
        .get(format!("{}/vision/status", base_url))
        .send()
        .await?
        .json()
        .await?;
    let is_vision_running = vision_status["is_running"].as_bool().unwrap_or(false);
    info!("Current vision status: {}", is_vision_running);

    if is_vision_running {
        info!("Stopping vision recording");
        client
            .post(format!("{}/vision/stop", base_url))
            .send()
            .await?;
    } else {
        info!("Starting vision recording");
        client
            .post(format!("{}/vision/start", base_url))
            .send()
            .await?;
    }

    // Toggle audio devices
    info!("Fetching audio devices");
    let devices: Vec<Value> = client
        .get(format!("{}/audio/list", base_url))
        .send()
        .await?
        .json()
        .await?;

    for device in devices {
        let device_id = device["id"].as_str().unwrap();
        let is_running = device["is_running"].as_bool().unwrap_or(false);
        info!("Audio device {}: current status {}", device_id, is_running);

        if is_running {
            info!("Stopping audio device {}", device_id);
            client
                .post(format!("{}/audio/stop", base_url))
                .json(&serde_json::json!({"device_id": device_id}))
                .send()
                .await?;
        } else {
            info!("Starting audio device {}", device_id);
            client
                .post(format!("{}/audio/start", base_url))
                .json(&serde_json::json!({"device_id": device_id}))
                .send()
                .await?;
        }
    }

    // Update tray menu item
    let item_handle = app.tray_handle().get_item("toggle_recording");
    if is_vision_running {
        info!("Updating tray menu item to 'Start Recording'");
        item_handle.set_title("Start Recording")?;
    } else {
        info!("Updating tray menu item to 'Stop Recording'");
        item_handle.set_title("Stop Recording")?;
    }

    info!("Toggle recording completed successfully");
    Ok(())
}

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

fn make_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let send_feedback = CustomMenuItem::new("send_feedback".to_string(), "Send Feedback");
    let toggle_analytics = CustomMenuItem::new("toggle_analytics".to_string(), "Disable Analytics");
    let toggle_autostart = CustomMenuItem::new("toggle_autostart".to_string(), "Disable Autostart");

    let tray_menu = SystemTrayMenu::new()
        .add_item(send_feedback)
        .add_item(toggle_analytics)
        .add_item(toggle_autostart)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

#[derive(Serialize, Deserialize, Default)]
struct Preferences {
    autostart_enabled: bool,
}

fn get_preferences_path() -> PathBuf {
    home_dir()
        .unwrap()
        .join(".screenpipe")
        .join("preferences.json")
}

fn load_preferences() -> Preferences {
    let path = get_preferences_path();
    fs::read_to_string(&path)
        .map(|contents| serde_json::from_str(&contents).unwrap_or_default())
        .unwrap_or_default()
}

fn save_preferences(prefs: &Preferences) {
    let path = get_preferences_path();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, serde_json::to_string_pretty(prefs).unwrap()).unwrap();
}

async fn setup_server_and_recording(
    app: &tauri::App,
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
        if let Ok(input_device) = default_input_device() {
            info!("Default input device found: {:?}", input_device.to_string());
            audio_devices.push(Arc::new(input_device.clone()));
            devices_status.insert(
                input_device,
                DeviceControl {
                    is_running: true,
                    is_paused: false,
                },
            );
        } else {
            info!("No default input device found");
        }
        if let Ok(output_device) = default_output_device() {
            info!(
                "Default output device found: {:?}",
                output_device.to_string()
            );
            audio_devices.push(Arc::new(output_device.clone()));
            devices_status.insert(
                output_device,
                DeviceControl {
                    is_running: true,
                    is_paused: false,
                },
            );
        } else {
            info!("No default output device found");
        }

        if audio_devices.is_empty() {
            error!("No audio devices available. Audio recording will be disabled.");
        } else {
            info!("Using audio devices:");
            for device in &audio_devices {
                info!("  {}", device);

                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                let device_clone = device.deref().clone();
                let sender_clone = audio_devices_control_sender.clone();
                // send signal after everything started
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(15)).await;
                    let _ = sender_clone.send((device_clone, device_control)).await;
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
    let prefs = load_preferences();
    let autostart_enabled = if prefs.autostart_enabled {
        "true"
    } else {
        "false"
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![autostart_enabled]),
        ))
        .setup(move |app| {
            let matches = app.get_cli_matches().unwrap();

            let custom_data_dir = matches
                .args
                .get("data-dir")
                .and_then(|v| v.value.as_str().map(String::from));

            let fps = matches
                .args
                .get("fps")
                .and_then(|v| v.value.as_f64())
                .unwrap_or(1.0);
            let audio_chunk_duration = matches
                .args
                .get("audio-chunk-duration")
                .and_then(|v| v.value.as_u64())
                .unwrap_or(30);
            let port = matches
                .args
                .get("port")
                .and_then(|v| v.value.as_u64())
                .unwrap_or(3035) as u16;
            let disable_audio = matches.args.get("disable-audio").is_none();
            let memory_threshold = matches
                .args
                .get("memory-threshold")
                .and_then(|v| v.value.as_f64())
                .unwrap_or(80.0);
            let runtime_threshold = matches
                .args
                .get("runtime-threshold")
                .and_then(|v| v.value.as_u64())
                .unwrap_or(60);
            let debug = matches.args.get("debug").is_some();

            let mut builder = env_logger::Builder::new();
            builder
                .filter(None, LevelFilter::Info)
                .filter_module("tokenizers", LevelFilter::Error)
                .filter_module("rusty_tesseract", LevelFilter::Error)
                .filter_module("symphonia", LevelFilter::Error);

            if debug {
                builder.filter_module("screenpipe", LevelFilter::Debug);
            }

            let local_data_dir = Arc::new(ensure_local_data_dir(custom_data_dir).unwrap());
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

            match start_analytics(posthog_api_key, app_name, interval_hours) {
                Ok(analytics_manager) => {
                    app.manage(analytics_manager);
                }
                Err(e) => {
                    error!("Failed to start analytics: {}", e);
                }
            }

            let tray_handle = app.tray_handle();
            let autostart_item = tray_handle.get_item("toggle_autostart");
            if prefs.autostart_enabled {
                autostart_item.set_title("Disable Autostart").unwrap();
            } else {
                autostart_item.set_title("Enable Autostart").unwrap();
            }

            app.manage(prefs);

            // Store configuration in app state
            app.manage(Arc::clone(&local_data_dir));
            app.manage(port);
            app.manage(fps);
            app.manage(audio_chunk_duration);
            app.manage(disable_audio);
            app.manage(memory_threshold);
            app.manage(runtime_threshold);

            Ok(())
        })
        .system_tray(make_tray())
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "send_feedback" => {
                        // Implement send_feedback logic
                        // open email to louis@screenpi.pe
                        let email = "louis@screenpi.pe";
                        let subject = "Screenpipe Feedback";
                        let body = r#"Please enter your feedback here...
                        
... or let's chat?
https://cal.com/louis030195/screenpipe
                        "#;
                        let url = format!("mailto:{}?subject={}&body={}", email, subject, body);
                        let app_handle = app.app_handle();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) =
                                tauri::api::shell::open(&app_handle.shell_scope(), url, None)
                            {
                                error!("Failed to open URL: {}", e);
                            }
                        });
                    }
                    "toggle_analytics" => {
                        let analytics_manager = app.state::<Arc<AnalyticsManager>>();
                        let is_enabled = analytics_manager.toggle_analytics();
                        let item_handle = app.tray_handle().get_item("toggle_analytics");
                        if is_enabled {
                            item_handle.set_title("Disable Analytics").unwrap();
                        } else {
                            item_handle.set_title("Enable Analytics").unwrap();
                        }
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    "toggle_recording" => {
                        let app_handle = app.app_handle();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = toggle_recording(&app_handle).await {
                                error!("Error toggling recording: {}", e);
                            }
                        });
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Initialize the database after the app is built
    let local_data_dir = app.state::<Arc<String>>();
    let db = initialize_database(Arc::clone(&local_data_dir)).await;
    app.manage(db.clone());

    // Setup server and recording after database initialization
    let port = *app.state::<u16>();
    let fps = *app.state::<f64>();
    let audio_chunk_duration = *app.state::<u64>();
    let disable_audio = *app.state::<bool>();
    let memory_threshold = *app.state::<f64>();
    let runtime_threshold = *app.state::<u64>();

    setup_server_and_recording(
        &app,
        db,
        local_data_dir.inner().clone(),
        port,
        fps,
        audio_chunk_duration,
        disable_audio,
        memory_threshold,
        runtime_threshold,
    )
    .await;

    // Run the app
    app.run(|_, _| {});
}
