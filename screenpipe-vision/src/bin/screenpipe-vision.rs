use screenpipe_vision::{continuous_capture, ControlMessage};
use std::time::Duration;
use tokio::sync::mpsc::channel;
use clap::Parser;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Save text files
    #[arg(long, default_value_t = false)]
    save_text_files: bool,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let (control_tx, mut control_rx) = channel(512);
    let (result_tx, mut result_rx) = channel(512);

    let save_text_files = cli.save_text_files;

    let capture_thread = tokio::spawn(async move {
        continuous_capture(&mut control_rx, result_tx, Duration::from_secs(1), save_text_files).await
    });

    // Example: Process results for 10 seconds, then pause for 5 seconds, then stop
    let start_time = std::time::Instant::now();
    loop {
        if let Some(result) = result_rx.recv().await {
            println!("OCR Text length: {}", result.text.len());
        }

        let elapsed = start_time.elapsed();
        if elapsed >= Duration::from_secs(10) && elapsed < Duration::from_secs(15) {
            control_tx.send(ControlMessage::Pause).await.unwrap();
        } else if elapsed >= Duration::from_secs(15) {
            control_tx.send(ControlMessage::Stop).await.unwrap();
            break;
        }

        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    capture_thread.await.unwrap();
}