use std::{
    fs,
    net::SocketAddr,
    sync::{mpsc::channel, Arc},
    time::Duration,
};

use clap::Parser;
use log::{info, LevelFilter};
use screenpipe_audio::{list_audio_devices, parse_device_spec};
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

    if cli.list_audio_devices {
        let devices = list_audio_devices()?;
        println!("Available audio devices:");
        for (i, device) in devices.iter().enumerate() {
            println!("  {}. {}", i + 1, device);
        }
        return Ok(());
    }

    let mut audio_devices = Vec::new();

    if !cli.disable_audio && cli.audio_device.is_empty() {
        let devices = list_audio_devices()?;
        eprintln!("No audio devices specified. Available devices are:");
        for (i, device) in devices.iter().enumerate() {
            eprintln!("  {}. {}", i + 1, device);
        }
        eprintln!("\nPlease specify one or more devices with:");
        eprintln!(
            "  {} --audio-device \"Device Name (input)\" [--audio-device \"Another Device (output)\"]",
            std::env::args().next().unwrap()
        );
        eprintln!("ATM only input devices are supported");
        return Err(anyhow::anyhow!("No audio devices specified"));
    } else {
        // if audio device contains (output) throw error say not implemented yet and link to https://github.com/louis030195/screen-pipe/issues/24
        cli.audio_device.iter().for_each(|d| {
            if d.contains("(output)") {
                eprintln!("Output audio devices are not supported yet.");
                eprintln!(
                    "Please help on this issue at https://github.com/louis030195/screen-pipe/issues/24"
                );
                std::process::exit(1);
            }
        });

        cli.audio_device.iter().for_each(|d| {
            audio_devices.push(Arc::new(
                parse_device_spec(d).expect("Failed to parse audio device specification"),
            ))
        });
    }

    ResourceMonitor::new(cli.memory_threshold, cli.runtime_threshold)
        .start_monitoring(Duration::from_secs(10)); // Log every 10 seconds

    let local_data_dir = Arc::new(ensure_local_data_dir()?);
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

fn ensure_local_data_dir() -> anyhow::Result<String> {
    let local_data_dir = "./data".to_string(); // TODO: Use $HOME/.screenpipe/data
    fs::create_dir_all(&local_data_dir)?;
    Ok(local_data_dir)
}
