#![cfg_attr(feature = "bundle", windows_subsystem = "windows")]

use dioxus::desktop::{muda::*, use_wry_event_handler};
use dioxus::prelude::*;
use dirs::home_dir;
use log::{error, info, LevelFilter};
use logs::MultiWriter;
use screenpipe_server::DatabaseManager;
use sentry;
use std::fs::{self, File};
use std::io::Write;
use std::ops::Deref;
use std::path::PathBuf;
use std::sync::Arc;
mod analytics;
use analytics::AnalyticsManager;
use tokio::runtime::Runtime;

use crate::analytics::start_analytics;
mod logs;

use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, DeviceControl,
};
use screenpipe_server::{ResourceMonitor, Server};
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use tokio::sync::mpsc;

async fn setup_server_and_recording(
    db: Arc<DatabaseManager>,
    local_data_dir: Arc<String>,
    port: u16,
    fps: f64,
    audio_chunk_duration: u64,
    disable_audio: bool,
    memory_threshold: f64,
    runtime_threshold: u64,
    analytics_manager: Arc<AnalyticsManager>,
) {
    info!("Setting up server and recording...");

    let (audio_devices_control_sender, audio_devices_control_receiver) = mpsc::channel(64);
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

    // Start resource monitoring
    ResourceMonitor::new(memory_threshold, runtime_threshold, false)
        .start_monitoring(Duration::from_secs(10));

    let db_record = db.clone();
    let db_server = db.clone();

    let (_control_tx, control_rx) = mpsc::channel(64);
    let vision_control = Arc::new(AtomicBool::new(true));
    let vision_control_server_clone = vision_control.clone();

    // Spawn continuous recording task
    let _recording_task = tokio::spawn({
        let local_data_dir = local_data_dir.clone();
        async move {
            let audio_chunk_duration = Duration::from_secs(audio_chunk_duration);
            screenpipe_server::start_continuous_recording(
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

    // API plugin for analytics
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

    // Spawn server task
    tokio::spawn(async move {
        let server = Server::new(
            db_server,
            std::net::SocketAddr::from(([0, 0, 0, 0], port)),
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

async fn initialize_database(local_data_dir: Arc<String>) -> Arc<DatabaseManager> {
    Arc::new(
        DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir))
            .await
            .unwrap(),
    )
}

fn get_local_dir(custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = home_dir()
        .ok_or("Failed to get home directory")
        .unwrap()
        .join(".screenpipe");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(&local_data_dir)?;
    Ok(local_data_dir)
}

async fn start_screenpipe() -> anyhow::Result<()> {
    // Initialize Sentry
    let _guard = sentry::init(("https://cf682877173997afc8463e5ca2fbe3c7@o4507617161314304.ingest.us.sentry.io/4507617170161664", sentry::ClientOptions {
        release: sentry::release_name!(),
        ..Default::default()
    }));

    // Set up logging
    let mut builder = env_logger::Builder::new();
    builder
        .filter(None, LevelFilter::Info)
        .filter_module("tokenizers", LevelFilter::Error)
        .filter_module("rusty_tesseract", LevelFilter::Error)
        .filter_module("symphonia", LevelFilter::Error);

    let base_dir = get_local_dir(None)?;
    fs::create_dir_all(&base_dir)?;

    let log_file = File::create(format!("{}/screenpipe.log", base_dir.to_string_lossy()))?;
    let multi_writer = MultiWriter::new(vec![
        Box::new(log_file) as Box<dyn Write + Send>,
        Box::new(std::io::stdout()) as Box<dyn Write + Send>,
    ]);

    builder.target(env_logger::Target::Pipe(Box::new(multi_writer)));
    builder.format_timestamp_secs().init();

    // Initialize local data directory and database
    let local_data_dir = Arc::new(
        get_local_dir(None)
            .unwrap()
            .join("data")
            .to_string_lossy()
            .into_owned(),
    );
    let db = initialize_database(local_data_dir.clone()).await;

    // Start analytics
    let posthog_api_key = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce".to_string();
    let app_name = "screenpipe";
    let interval_hours = 1;
    let analytics_manager = start_analytics(posthog_api_key, app_name, interval_hours).unwrap();

    // Setup server and recording
    setup_server_and_recording(
        db,
        local_data_dir,
        3000,  // default port
        30.0,  // default fps
        5,     // default audio_chunk_duration
        false, // default disable_audio
        80.0,  // default memory_threshold
        3600,  // default runtime_threshold
        analytics_manager,
    )
    .await;

    Ok(())
}

fn main() {
    // Create a Tokio runtime
    let rt = Runtime::new().unwrap();

    // Start Screenpipe in the background
    if let Err(e) = rt.block_on(start_screenpipe()) {
        eprintln!("Failed to start Screenpipe: {}", e);
        std::process::exit(1);
    }
    // Create a menu bar that only contains the edit menu
    let menu = Menu::new();
    let edit_menu = Submenu::new("Edit", true);

    edit_menu
        .append_items(&[
            &PredefinedMenuItem::undo(None),
            &PredefinedMenuItem::redo(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::cut(None),
            &PredefinedMenuItem::copy(None),
            &PredefinedMenuItem::paste(None),
            &PredefinedMenuItem::select_all(None),
            &MenuItem::with_id("switch-text", "Switch text", true, None),
        ])
        .unwrap();

    menu.append(&edit_menu).unwrap();

    // Create a desktop config that overrides the default menu with the custom menu
    let config = dioxus::desktop::Config::new().with_menu(menu);

    // Launch the app with the custom menu
    LaunchBuilder::new().with_cfg(config).launch(app)
}

fn app() -> Element {
    let mut text = use_signal(String::new);
    // You can use the `use_muda_event_handler` hook to run code when a menu event is triggered.
    use_wry_event_handler(move |muda_event, _| {
        // if muda_event.id() == "switch-text" {
        //     text.set("Switched to text".to_string());
        // }
    });

    rsx! {
        div {
            h1 { "Welcome to screen | ⭐️" }
            // p { "Text: {text}" }
            p { "It's running! Check examples on Github on how to use your data now :)" }
        }
    }
}
