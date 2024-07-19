#![cfg_attr(feature = "bundle", windows_subsystem = "windows")]

use dioxus::prelude::*;
use dirs::home_dir;
use log::{error, info, LevelFilter};
use logs::MultiWriter;
use screenpipe_server::DatabaseManager;
use sentry;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
mod analytics;
use analytics::AnalyticsManager;

use crate::analytics::start_analytics;
mod logs;

use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, parse_audio_device,
    AudioDevice, DeviceControl,
};
use screenpipe_server::{ResourceMonitor, Server};
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use tokio::sync::mpsc::{self, Sender};

use auto_launch::AutoLaunchBuilder;

fn setup_auto_launch() -> anyhow::Result<()> {
    let auto_launch = AutoLaunchBuilder::new()
        .set_app_name("screenpipe")
        .set_app_path(std::env::current_exe()?.to_str().unwrap())
        .build()?;

    auto_launch.enable()?;
    println!("Auto-launch enabled: {}", auto_launch.is_enabled()?);

    Ok(())
}

async fn initialize_audio(
    disable_audio: bool,
    custom_devices: &[String],
    audio_devices_control_sender: Arc<Sender<(AudioDevice, DeviceControl)>>,
) -> (Vec<Arc<AudioDevice>>, HashMap<AudioDevice, DeviceControl>) {
    let mut audio_devices = Vec::new();
    let mut devices_status = HashMap::new();

    if disable_audio {
        info!("Audio recording is disabled");
        return (audio_devices, devices_status);
    }

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

    if custom_devices.is_empty() {
        if let Ok(input_device) = default_input_device() {
            info!("Default input device found: {:?}", input_device.to_string());
            audio_devices.push(Arc::new(input_device));
        }
        if let Ok(output_device) = default_output_device() {
            info!(
                "Default output device found: {:?}",
                output_device.to_string()
            );
            audio_devices.push(Arc::new(output_device));
        }
    } else {
        for device_str in custom_devices {
            if let Ok(device) = parse_audio_device(device_str) {
                info!("Custom device added: {:?}", device.to_string());
                audio_devices.push(Arc::new(device));
            } else {
                error!("Failed to parse audio device: {}", device_str);
            }
        }
    }

    if audio_devices.is_empty() {
        error!("No audio devices available. Audio recording will be disabled.");
    } else {
        info!("Using audio devices:");
        // for device in &audio_devices {
        //     info!("  {}", device);
        //     let device_clone = (**device).clone();
        //     let sender_clone = audio_devices_control_sender.clone();
        //     spawn(async move {
        //         tokio::time::sleep(Duration::from_secs(15)).await;
        //         let _ = sender_clone
        //             .send((
        //                 device_clone,
        //                 DeviceControl {
        //                     is_running: true,
        //                     is_paused: false,
        //                 },
        //             ))
        //             .await;
        //     });
        // }
    }

    (audio_devices, devices_status)
}

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
) -> anyhow::Result<(
    Arc<Sender<(AudioDevice, DeviceControl)>>,
    Vec<Arc<AudioDevice>>,
)> {
    info!("Setting up server and recording...");

    let (audio_devices_control_sender, audio_devices_control_receiver) = mpsc::channel(64);
    let audio_devices_control_sender = Arc::new(audio_devices_control_sender);
    let audio_sender_for_server = audio_devices_control_sender.clone();
    let audio_sender_for_return = audio_devices_control_sender.clone();

    let (audio_devices, devices_status) = initialize_audio(
        disable_audio,
        &[], // No custom devices for the app version
        audio_devices_control_sender,
    )
    .await;

    // Start resource monitoring
    ResourceMonitor::new(memory_threshold, runtime_threshold, false)
        .start_monitoring(Duration::from_secs(10));

    let db_record = db.clone();
    let db_server = db.clone();

    let (_control_tx, control_rx) = mpsc::channel(64);
    let vision_control = Arc::new(AtomicBool::new(true));
    let vision_control_server_clone = vision_control.clone();

    // Spawn continuous recording task
    spawn(async move {
        let audio_chunk_duration = Duration::from_secs(audio_chunk_duration);
        if let Err(e) = screenpipe_server::start_continuous_recording(
            db_record,
            local_data_dir,
            fps,
            audio_chunk_duration,
            control_rx,
            vision_control,
            audio_devices_control_receiver,
        )
        .await
        {
            log::error!("Continuous recording error: {:?}", e);
        }
    });
    // API plugin for analytics
    let api_plugin = move |req: &axum::http::Request<axum::body::Body>| {
        if req.uri().path() == "/search" {
            let analytics_manager = analytics_manager.clone();
            spawn(async move {
                if let Err(e) = analytics_manager.track_search().await {
                    error!("Failed to track search request: {}", e);
                }
            });
        }
    };

    // Spawn server task
    spawn(async move {
        let server = Server::new(
            db_server,
            std::net::SocketAddr::from(([0, 0, 0, 0], port)),
            vision_control_server_clone,
            audio_sender_for_server.as_ref().clone(), // Clone the inner Sender
        );
        info!("Starting server...");

        if let Err(e) = server.start(devices_status, api_plugin).await {
            error!("Failed to start server: {}", e);
        }
    });

    info!("Server started on http://localhost:{}", port);

    Ok((audio_sender_for_return, audio_devices))
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

async fn start_screenpipe() -> anyhow::Result<(
    Arc<Sender<(AudioDevice, DeviceControl)>>,
    Vec<Arc<AudioDevice>>,
)> {
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

    let debug = true;

    if debug {
        builder.filter(Some("screenpipe"), LevelFilter::Debug);
    }

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
    let (audio_devices_control_sender, audio_devices) = setup_server_and_recording(
        db,
        local_data_dir,
        3030,  // default port
        1.0,   // default fps
        30,    // default audio_chunk_duration
        false, // default disable_audio
        80.0,  // default memory_threshold
        3600,  // default runtime_threshold
        analytics_manager,
    )
    .await?;

    Ok((audio_devices_control_sender, audio_devices))
}

fn main() {
    if let Err(e) = setup_auto_launch() {
        eprintln!("Failed to set up auto-launch: {}", e);
    }

    launch_desktop(app)
}

fn app() -> Element {
    let mut recording = use_signal(|| false);
    let mut audio_sender = use_signal(|| None::<Arc<Sender<(AudioDevice, DeviceControl)>>>);
    let mut audio_devices = use_signal(|| Vec::new());

    use_future(move || async move {
        match start_screenpipe().await {
            Ok((sender, devices)) => {
                audio_sender.set(Some(sender));
                audio_devices.set(devices);
            }
            Err(e) => {
                eprintln!("Failed to start Screenpipe: {}", e);
                std::process::exit(1);
            }
        }
    });

    let start_recording = move |_| {
        let mut recording = recording.clone();
        let sender = audio_sender.read().clone();
        let devices = audio_devices.read().clone();
        spawn(async move {
            if let Some(sender) = sender {
                for device in &devices {
                    let _ = sender
                        .send((
                            (**device).clone(),
                            DeviceControl {
                                is_running: true,
                                is_paused: false,
                            },
                        ))
                        .await;
                }
                recording.set(true);
            }
        });
    };
    rsx! {
        div {
            h1 { "Welcome to screen | ⭐️" }
            p {
                "It's running. We record your screen 24/7! Click the button below to start recording audio."
            }
            br {}

            button {
                onclick: start_recording,
                disabled: "{recording}",
                "Start Recording microphone"
                // "{if *recording { "Recording..." } else { "Start Recording" }}"
            }
            br {}

            a {
                href: "https://github.com/louis030195/screen-pipe",
                "Github"
            }
            br {}
            p {
                "Send feedback: louis@screenpi.pe"
            }
        }
    }
}
