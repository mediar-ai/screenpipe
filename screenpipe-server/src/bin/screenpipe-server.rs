use std::{
    fs,
    net::SocketAddr,
    sync::{mpsc::channel, Arc},
    time::Duration,
};

use clap::Parser;
use colored::Colorize;
use log::{info, warn, LevelFilter};
use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, parse_device_spec,
};

use screenpipe_server::{start_continuous_recording, DatabaseManager, ResourceMonitor, Server}; // Import the list_audio_devices function
#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// FPS for continuous recording
    #[arg(short, long, default_value_t = 5.0)]
    fps: f64,

    /// Audio chunk duration in seconds
    #[arg(short, long, default_value_t = 30)]
    audio_chunk_duration: u64,

    /// Port to run the server on
    #[arg(short, long, default_value_t = 3030)]
    port: u16,

    /// Disable audio recording
    #[arg(long, default_value_t = false)]
    disable_audio: bool,

    /// Memory usage threshold for restart (in percentage)
    #[arg(long, default_value_t = 80.0)]
    memory_threshold: f64,

    /// Runtime threshold for restart (in minutes)
    #[arg(long, default_value_t = 60)]
    runtime_threshold: u64,

    /// Audio devices to use (can be specified multiple times)
    #[arg(long)]
    audio_device: Vec<String>,

    /// List available audio devices
    #[arg(long)]
    list_audio_devices: bool,

    /// Data directory
    #[arg(long, default_value_t = String::from("./data"))]
    data_dir: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    let cli = Cli::parse();

    env_logger::Builder::new()
        .filter(None, LevelFilter::Info)
        .filter_module("tokenizers", LevelFilter::Error)
        .filter_module("rusty_tesseract", LevelFilter::Error)
        .init();

    // Add warning for Linux and Windows users
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
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

    if cli.list_audio_devices {
        let devices = list_audio_devices()?;
        println!("Available audio devices:");
        for (i, device) in devices.iter().enumerate() {
            println!("  {}. {}", i + 1, device);
        }
        return Ok(());
    }

    let mut audio_devices = Vec::new();

    if !cli.disable_audio {
        if cli.audio_device.is_empty() {
            // Add default input device
            if let Ok(input_device) = default_input_device() {
                audio_devices.push(Arc::new(input_device));
            }
            // Add default output device
            if let Ok(output_device) = default_output_device() {
                audio_devices.push(Arc::new(output_device));
            }
        } else {
            // Use specified devices
            for d in &cli.audio_device {
                audio_devices.push(Arc::new(
                    parse_device_spec(d).expect("Failed to parse audio device specification"),
                ));
            }
        }

        if audio_devices.is_empty() {
            eprintln!("No audio devices available. Audio recording will be disabled.");
        } else {
            info!("Using audio devices:");
            for device in &audio_devices {
                info!("  {}", device);
            }
        }
    }

    ResourceMonitor::new(cli.memory_threshold, cli.runtime_threshold)
        .start_monitoring(Duration::from_secs(10)); // Log every 10 seconds

    let local_data_dir = cli.data_dir; // TODO: Use $HOME/.screenpipe/data
    fs::create_dir_all(&local_data_dir)?;
    let local_data_dir = Arc::new(local_data_dir);
    let local_data_dir_record = local_data_dir.clone();
    let db = Arc::new(
        DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir))
            .await
            .unwrap(),
    );
    let db_record = db.clone();
    let db_server = db.clone();

    // Channel for controlling the recorder
    let (_control_tx, control_rx) = channel();

    // Start continuous recording in a separate task
    let _recording_task = tokio::spawn({
        async move {
            let audio_chunk_duration = Duration::from_secs(cli.audio_chunk_duration);

            start_continuous_recording(
                db_record,
                local_data_dir_record,
                cli.fps,
                audio_chunk_duration,
                control_rx,
                !cli.disable_audio,
                audio_devices,
            )
            .await
        }
    });

    tokio::spawn(async move {
        let server = Server::new(db_server, SocketAddr::from(([0, 0, 0, 0], cli.port)));
        server.start().await.unwrap();
    });

    // Wait for the server to start
    info!("Server started on http://localhost:{}", cli.port);

    // Keep the main thread running
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
