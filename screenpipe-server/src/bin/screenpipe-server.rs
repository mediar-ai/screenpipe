use std::{
    fs,
    net::SocketAddr,
    sync::{mpsc::channel, Arc},
    time::Duration,
};

use clap::Parser;
use log::{info, LevelFilter};

use screenpipe_server::{start_continuous_recording, DatabaseManager, ResourceMonitor, Server};

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
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    let cli = Cli::parse();

    ResourceMonitor::new(cli.memory_threshold, cli.runtime_threshold)
        .start_monitoring(Duration::from_secs(10)); // Log every 10 seconds

    env_logger::Builder::new()
        .filter(None, LevelFilter::Info)
        .filter_module("tokenizers", LevelFilter::Error)
        .filter_module("rusty_tesseract", LevelFilter::Error)
        .init();

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
