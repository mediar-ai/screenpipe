use anyhow::Result;
use env_logger::Env;
use log::info;
use screenpipe_audio::{continuous_audio_capture, ControlMessage};
use std::thread;
use std::time::Duration;

fn main() -> Result<()> {
    use env_logger::Builder;
    use log::LevelFilter;
    use std::sync::mpsc;

    let _ = Builder::new()
        .filter(None, LevelFilter::Info)
        .filter_module("tokenizers", LevelFilter::Error)
        .init();


    let (control_tx, control_rx) = mpsc::channel();
    let (result_tx, result_rx) = mpsc::channel();
    let chunk_duration = Duration::from_secs(5);

    let capture_thread =
        thread::spawn(move || continuous_audio_capture(control_rx, result_tx, chunk_duration));

    while true {
        if let Ok(result) = result_rx.recv_timeout(Duration::from_secs(5)) {
            info!("Transcription: {}", result.text);
        }
    }

    control_tx.send(ControlMessage::Stop)?;
    capture_thread.join().unwrap()?;

    Ok(())
}
