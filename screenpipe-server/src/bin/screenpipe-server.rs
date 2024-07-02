use std::{
    fs,
    sync::{mpsc::channel, Arc, Mutex},
};

use tokio::sync::oneshot;
use tokio::time::Duration;

use screenpipe_server::start_frame_server;
use screenpipe_server::{start_continuous_recording, DatabaseManager, RecorderControl};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    use env_logger::Builder;
    use log::LevelFilter;

    let _ = Builder::new()
        .filter(None, LevelFilter::Info)
        .filter_module("tokenizers", LevelFilter::Error)
        .filter_module("rusty_tesseract", LevelFilter::Error)
        .init();

    let local_data_dir = ensure_local_data_dir()?;
    let local_data_dir_clone = local_data_dir.clone();
    let db = Arc::new(Mutex::new(None));
    setup_db(local_data_dir.clone(), db.clone());

    // Channel for controlling the recorder
    let (control_tx, control_rx) = channel();

    // Start continuous recording in a separate task
    let recording_task = tokio::spawn(async move {
        let fps = 10.0;
        let audio_chunk_duration = Duration::from_secs(5);

        start_continuous_recording(
            &format!("{}/db.sqlite", local_data_dir),
            &local_data_dir,
            fps,
            audio_chunk_duration,
            control_rx,
        )
    });

    // Start the frame server
    let (tx, rx) = oneshot::channel();
    tokio::spawn(async move {
        start_frame_server(tx, local_data_dir_clone.to_string(), db.clone()).await;
    });

    // Wait for the server to start
    let _ = rx.await;
    println!("Server started on http://localhost:3030");

    // Keep the main thread running
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        // You can add logic here to send control messages if needed
        // For example:
        // control_tx.send(RecorderControl::Pause).await?;
        // control_tx.send(RecorderControl::Resume).await?;
    }

    // This part will never be reached in the current implementation
    // control_tx.send(RecorderControl::Stop).await?;
    // recording_task.await??;

    Ok(())
}

fn ensure_local_data_dir() -> anyhow::Result<String> {
    let local_data_dir = "./data".to_string(); // TODO: Use $HOME/.screenpipe/data
    fs::create_dir_all(&local_data_dir)?;
    Ok(local_data_dir)
}

fn setup_db(local_data_dir: String, db: Arc<Mutex<Option<DatabaseManager>>>) {
    let mut db = db.lock().unwrap();
    let db_ = DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir)).unwrap();
    *db = Some(db_);
}
