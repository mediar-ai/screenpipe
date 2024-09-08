use std::{
    collections::HashMap,
    fs,
    net::SocketAddr,
    ops::Deref,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
    time::Duration,
};

use clap::Parser;
#[allow(unused_imports)]
use colored::Colorize;
use crossbeam::queue::SegQueue;
use dirs::home_dir;
use futures::{pin_mut, stream::FuturesUnordered, StreamExt};
use log::{debug, error, info};
use screenpipe_audio::AudioTranscriptionEngine as CoreAudioTranscriptionEngine;
use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, parse_audio_device,
    AudioDevice, DeviceControl,
};
use screenpipe_core::find_ffmpeg_path;
use screenpipe_server::{
    cli::{Cli, CliAudioTranscriptionEngine, CliOcrEngine, Command, PipeCommand},
    start_continuous_recording, DatabaseManager, PipeManager, ResourceMonitor, Server,
};
use screenpipe_vision::monitor::{get_monitor_by_id, list_monitors};
use screenpipe_vision::utils::OcrEngine as CoreOcrEngine;
use serde_json::{json, Value};
use tokio::{
    runtime::Runtime,
    signal,
    sync::{broadcast, mpsc::channel},
    time::{interval_at, Instant},
};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::prelude::__tracing_subscriber_SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::Layer;
use tracing_subscriber::{fmt, EnvFilter};

fn print_devices(devices: &[AudioDevice]) {
    println!("Available audio devices:");
    for device in devices.iter() {
        println!("  {}", device);
    }

    #[cfg(target_os = "macos")]
    println!("On macOS, it's not intuitive but output devices are your displays");
}

const DISPLAY: &str = r"
                                            _          
   __________________  ___  ____     ____  (_____  ___ 
  / ___/ ___/ ___/ _ \/ _ \/ __ \   / __ \/ / __ \/ _ \
 (__  / /__/ /  /  __/  __/ / / /  / /_/ / / /_/ /  __/
/____/\___/_/   \___/\___/_/ /_/  / .___/_/ .___/\___/ 
                                 /_/     /_/           

";

fn get_base_dir(custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = home_dir()
        .ok_or_else(|| anyhow::anyhow!("Failed to get home directory"))?
        .join(".screenpipe");

    let base_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);
    let data_dir = base_dir.join("data");

    fs::create_dir_all(&data_dir)?;
    Ok(base_dir)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let local_data_dir = get_base_dir(cli.data_dir)?;
    let local_data_dir_clone = local_data_dir.clone();

    let pipe_manager = Arc::new(PipeManager::new(local_data_dir_clone.clone()));

    if let Some(pipe_command) = cli.command {
        match pipe_command {
            Command::Pipe { subcommand } => {
                handle_pipe_command(subcommand, &pipe_manager).await?;
                return Ok(());
            }
        }
    }

    if find_ffmpeg_path().is_none() {
        eprintln!("ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.");
        std::process::exit(1);
    }

    // Set up file appender
    let file_appender =
        RollingFileAppender::new(Rotation::NEVER, local_data_dir.clone(), "screenpipe.log");

    // Create a custom layer for file logging
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .with_filter(EnvFilter::new("info"));

    // Create a custom layer for console logging
    let console_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_filter(EnvFilter::new("debug"));

    // Build the EnvFilter
    let env_filter = EnvFilter::from_default_env()
        .add_directive("info".parse().unwrap())
        .add_directive("tokenizers=error".parse().unwrap())
        .add_directive("rusty_tesseract=error".parse().unwrap())
        .add_directive("symphonia=error".parse().unwrap())
        .add_directive("external_cloud_integrations=debug".parse().unwrap());

    let env_filter = if cli.debug {
        env_filter.add_directive("screenpipe=debug".parse().unwrap())
    } else {
        env_filter
    };

    // Initialize the tracing subscriber with both layers and the EnvFilter
    tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer)
        .with(console_layer)
        .init();

    // Add warning for Linux and Windows users
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        use log::warn;
        warn!("Screenpipe hasn't been extensively tested on this OS. We'd love your feedback!");
        println!(
            "{}",
            "Would love your feedback on the UX, let's a 15 min call soon:".bright_yellow()
        );
        println!(
            "{}",
            "https://cal.com/louis030195/screenpipe"
                .bright_blue()
                .underline()
        );
    }
    let all_audio_devices = list_audio_devices().await?;
    let mut devices_status = HashMap::new();
    if cli.list_audio_devices {
        print_devices(&all_audio_devices);
        return Ok(());
    }
    let all_monitors = list_monitors().await;
    if cli.list_monitors {
        println!("Available monitors:");
        for monitor in all_monitors.iter() {
            println!("  {}. {:?}", monitor.id(), monitor);
        }
        return Ok(());
    }

    let mut audio_devices = Vec::new();

    let audio_devices_control = Arc::new(SegQueue::new());

    let audio_devices_control_server = audio_devices_control.clone();

    // Add all available audio devices to the controls
    for device in &all_audio_devices {
        let device_control = DeviceControl {
            is_running: false,
            is_paused: false,
        };
        devices_status.insert(device.clone(), device_control);
    }

    if !cli.disable_audio {
        if cli.audio_device.is_empty() {
            // Use default devices
            if let Ok(input_device) = default_input_device() {
                audio_devices.push(Arc::new(input_device.clone()));
                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                devices_status.insert(input_device, device_control);
            }
            // audio output only on macos <15.0 atm ?
            // see https://github.com/mediar-ai/screenpipe/pull/106
            if let Ok(output_device) = default_output_device().await {
                audio_devices.push(Arc::new(output_device.clone()));
                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                devices_status.insert(output_device, device_control);
            }
        } else {
            // Use specified devices
            for d in &cli.audio_device {
                let device = parse_audio_device(d).expect("Failed to parse audio device");
                audio_devices.push(Arc::new(device.clone()));
                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                devices_status.insert(device, device_control);
            }
        }

        if audio_devices.is_empty() {
            eprintln!("No audio devices available. Audio recording will be disabled.");
        } else {
            for device in &audio_devices {
                info!("  {}", device);

                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                let device_clone = device.deref().clone();
                let sender_clone = audio_devices_control.clone();
                // send signal after everything started
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(15)).await;
                    sender_clone.push((device_clone, device_control));
                });
            }
        }
    }

    let (restart_sender, mut restart_receiver) = channel(10);
    let resource_monitor = ResourceMonitor::new(
        cli.self_healing,
        Duration::from_secs(60),
        3,
        restart_sender,
        cli.port,
    );
    resource_monitor.start_monitoring(Duration::from_secs(10));

    let db = Arc::new(
        DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir.to_string_lossy()))
            .await
            .map_err(|e| {
                eprintln!("Failed to initialize database: {:?}", e);
                e
            })?,
    );
    info!(
        "Database initialized, will store files in {}",
        local_data_dir.to_string_lossy()
    );
    let db_server = db.clone();

    // Channel for controlling the recorder ! TODO RENAME SHIT
    let vision_control = Arc::new(AtomicBool::new(true));

    let vision_control_server_clone = vision_control.clone();

    // Before the loop starts, clone friend_wearable_uid
    let friend_wearable_uid = cli.friend_wearable_uid.clone();

    let warning_ocr_engine_clone = cli.ocr_engine.clone();
    let warning_audio_transcription_engine_clone = cli.audio_transcription_engine.clone();
    let monitor_id = cli.monitor_id.unwrap_or(all_monitors.first().unwrap().id());

    // try to use the monitor selected, if not available throw an error
    get_monitor_by_id(monitor_id).await.unwrap_or_else(|| {
        eprintln!(
            "{}",
            format!(
                "Monitor with id {} not found. Try 'screenpipe --list-monitors'",
                monitor_id
            )
            .red()
        );
        std::process::exit(1);
    });
    let ocr_engine_clone = cli.ocr_engine.clone();
    let restart_interval = cli.restart_interval;

    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    let audio_runtime = Runtime::new().unwrap();
    let vision_runtime = Runtime::new().unwrap();

    let db_clone = Arc::clone(&db);
    let output_path_clone = Arc::new(local_data_dir.join("data").to_string_lossy().into_owned());
    let vision_control_clone = Arc::clone(&vision_control);
    let shutdown_tx_clone = shutdown_tx.clone();
    let friend_wearable_uid_clone = friend_wearable_uid.clone();  // Clone here

    let fps = if cli.fps.is_finite() && cli.fps > 0.0 {
        cli.fps
    } else {
        eprintln!("Invalid FPS value: {}. Using default of 1.0", cli.fps);
        1.0
    };

    let vision_handle = vision_runtime.spawn(async move {
        start_continuous_recording(
            db_clone,
            output_path_clone,
            fps,
            Duration::from_secs(cli.audio_chunk_duration),
            vision_control_clone,
            Arc::new(SegQueue::new()),  // Empty audio devices for vision-only
            true,  // Disable audio for vision worker
            cli.save_text_files,
            Arc::new(CoreAudioTranscriptionEngine::WhisperTiny),  // Dummy value, not used
            Arc::new(cli.ocr_engine.clone().into()),
            friend_wearable_uid_clone,  // Use the cloned version
            monitor_id,
            cli.use_pii_removal,
            cli.disable_vision,
        )
        .await
    });

    let db_clone = Arc::clone(&db);
    let output_path_clone = Arc::new(local_data_dir.join("data").to_string_lossy().into_owned());
    let audio_devices_control_clone = Arc::clone(&audio_devices_control);
    let shutdown_tx_clone = shutdown_tx.clone();
    let friend_wearable_uid_clone = friend_wearable_uid.clone();  // Clone again for audio

    let audio_handle = audio_runtime.spawn(async move {
        start_continuous_recording(
            db_clone,
            output_path_clone,
            1.0,  // FPS not relevant for audio
            Duration::from_secs(cli.audio_chunk_duration),
            Arc::new(AtomicBool::new(true)),  // Dummy vision control
            audio_devices_control_clone,
            cli.disable_audio,
            false,  // Don't save text files for audio
            Arc::new(cli.audio_transcription_engine.clone().into()),
            Arc::new(CoreOcrEngine::Tesseract),  // Dummy value, not used
            friend_wearable_uid_clone,  // Use the cloned version
            0,  // Monitor ID not relevant for audio
            false,  // PII removal not relevant for audio
            false,  // Don't disable audio
        )
        .await
    });

    let local_data_dir_clone_2 = local_data_dir_clone.clone();

    let api_plugin = |req: &axum::http::Request<axum::body::Body>| {
        if req.uri().path() == "/search" {
            // Track search requests
        }
    };
    let server = Server::new(
        db_server,
        SocketAddr::from(([0, 0, 0, 0], cli.port)),
        vision_control_server_clone,
        audio_devices_control_server,
        local_data_dir_clone_2,
        pipe_manager.clone(),
    );

    let mut pipe_futures = FuturesUnordered::new();

    // print screenpipe in gradient
    println!("\n\n{}", DISPLAY.truecolor(147, 112, 219).bold());
    println!(
        "\n{}",
        "Build AI apps that have the full context"
            .bright_yellow()
            .italic()
    );
    println!(
        "{}\n\n",
        "Open source | Runs locally | Developer friendly".bright_green()
    );

    println!("┌─────────────────────┬────────────────────────────────────┐");
    println!("│ Setting             │ Value                              │");
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ FPS                 │ {:<34} │", cli.fps);
    println!(
        "│ Audio Chunk Duration│ {:<34} │",
        format!("{} seconds", cli.audio_chunk_duration)
    );
    println!("│ Port                │ {:<34} │", cli.port);
    println!("│ Audio Disabled      │ {:<34} │", cli.disable_audio);
    println!("│ Vision Disabled     │ {:<34} │", cli.disable_vision);
    println!("│ Self Healing        │ {:<34} │", cli.self_healing);
    println!("│ Save Text Files     │ {:<34} │", cli.save_text_files);
    println!(
        "│ Audio Engine        │ {:<34} │",
        format!("{:?}", warning_audio_transcription_engine_clone)
    );
    println!(
        "│ OCR Engine          │ {:<34} │",
        format!("{:?}", ocr_engine_clone)
    );
    println!("│ Monitor ID          │ {:<34} │", monitor_id);
    println!(
        "│ Data Directory      │ {:<34} │",
        local_data_dir_clone.display()
    );
    println!("│ Debug Mode          │ {:<34} │", cli.debug);
    println!(
        "│ Restart Interval    │ {:<34} │",
        if cli.restart_interval > 0 {
            format!("Every {} minutes", cli.restart_interval)
        } else {
            "Disabled".to_string()
        }
    );
    const VALUE_WIDTH: usize = 34;

    // Function to truncate and pad strings
    fn format_cell(s: &str, width: usize) -> String {
        if s.len() > width {
            format!("{}...", &s[..width - 3])
        } else {
            format!("{:<width$}", s, width = width)
        }
    }

    // In the main function, replace the audio devices section with:
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ Audio Devices       │                                    │");
    const MAX_DEVICES_TO_DISPLAY: usize = 5;

    if cli.disable_audio {
        println!("│ {:<19} │ {:<34} │", "", "Disabled");
    } else if audio_devices.is_empty() {
        println!("│ {:<19} │ {:<34} │", "", "No devices available");
    } else {
        let total_devices = audio_devices.len();
        for (_, device) in audio_devices
            .iter()
            .enumerate()
            .take(MAX_DEVICES_TO_DISPLAY)
        {
            let device_str = device.deref().to_string();
            let formatted_device = format_cell(&device_str, VALUE_WIDTH);

            println!("│ {:<19} │ {:<34} │", "", formatted_device);
        }
        if total_devices > MAX_DEVICES_TO_DISPLAY {
            println!(
                "│ {:<19} │ {:<34} │",
                "",
                format!("... and {} more", total_devices - MAX_DEVICES_TO_DISPLAY)
            );
        }
    }

    println!("└─────────────────────┴────────────────────────────────────┘");

    // Add warning for cloud arguments
    if warning_audio_transcription_engine_clone == CliAudioTranscriptionEngine::Deepgram
        || warning_ocr_engine_clone == CliOcrEngine::Unstructured
    {
        println!(
            "{}",
            "WARNING: You are using cloud now. Make sure to understand the data privacy risks."
                .bright_yellow()
        );
    } else {
        println!(
            "{}",
            "You are using local processing. All your data stays on your computer.\n"
                .bright_yellow()
        );
    }

    // Start pipes
    debug!("Starting pipes");
    let pipes = pipe_manager.list_pipes().await;
    for pipe in pipes {
        debug!("Pipe: {:?}", pipe.id);
        if !pipe.enabled {
            debug!("Pipe {} is disabled, skipping", pipe.id);
            continue;
        }
        match pipe_manager.start_pipe(&pipe.id).await {
            Ok(future) => pipe_futures.push(future),
            Err(e) => eprintln!("Failed to start pipe {}: {}", pipe.id, e),
        }
    }

    let server_future = server.start(devices_status, api_plugin);
    pin_mut!(server_future);

    let pipes_future = async {
        loop {
            if let Some(result) = pipe_futures.next().await {
                info!("Pipe completed: {:?}", result);
            } else {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    };
    pin_mut!(pipes_future);

    let ctrl_c_future = signal::ctrl_c();
    pin_mut!(ctrl_c_future);

    tokio::select! {
        _ = vision_handle => info!("Vision recording completed"),
        _ = audio_handle => info!("Audio recording completed"),
        result = &mut server_future => {
            match result {
                Ok(_) => info!("Server stopped normally"),
                Err(e) => error!("Server stopped with error: {:?}", e),
            }
        }
        _ = &mut pipes_future => {
            info!("All pipes completed, but server is still running");
        }
        _ = ctrl_c_future => {
            info!("Received Ctrl+C, initiating shutdown");
            let _ = shutdown_tx.send(());
        }
    }

    // Ensure both runtimes are shut down
    drop(vision_runtime);
    drop(audio_runtime);

    info!("Shutdown complete");
    Ok(())
}

async fn handle_pipe_command(pipe: PipeCommand, pipe_manager: &PipeManager) -> anyhow::Result<()> {
    // Handle pipe subcommands
    match pipe {
        PipeCommand::List => {
            let pipes = pipe_manager.list_pipes().await;
            println!("Available pipes:");
            for pipe in pipes {
                println!("  ID: {}, Enabled: {}", pipe.id, pipe.enabled);
            }
        }
        PipeCommand::Download { url } => match pipe_manager.download_pipe(&url).await {
            Ok(pipe_id) => println!("Pipe downloaded successfully. ID: {}", pipe_id),
            Err(e) => eprintln!("Failed to download pipe: {}", e),
        },
        PipeCommand::Info { id } => match pipe_manager.get_pipe_info(&id).await {
            Some(info) => println!("Pipe info: {:?}", info),
            None => eprintln!("Pipe not found"),
        },
        PipeCommand::Enable { id } => {
            match pipe_manager
                .update_config(&id, json!({"enabled": true}))
                .await
            {
                Ok(_) => println!("Pipe {} enabled", id),
                Err(e) => eprintln!("Failed to enable pipe: {}", e),
            }
        }
        PipeCommand::Disable { id } => {
            match pipe_manager
                .update_config(&id, json!({"enabled": false}))
                .await
            {
                Ok(_) => println!("Pipe {} disabled", id),
                Err(e) => eprintln!("Failed to disable pipe: {}", e),
            }
        }
        PipeCommand::Update { id, config } => {
            let config: Value = serde_json::from_str(&config)
                .map_err(|e| anyhow::anyhow!("Invalid JSON: {}", e))?;
            match pipe_manager.update_config(&id, config).await {
                Ok(_) => println!("Pipe {} config updated", id),
                Err(e) => eprintln!("Failed to update pipe config: {}", e),
            }
        }
    }
    Ok(())
}
