use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::WavWriter;
use screenpipe_audio::{continuous_audio_capture, ControlMessage};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

fn main() -> Result<()> {
    use std::sync::mpsc;

    let (control_tx, control_rx) = mpsc::channel();
    let (result_tx, result_rx) = mpsc::channel();
    let chunk_duration = Duration::from_secs(5);

    let capture_thread =
        thread::spawn(move || continuous_audio_capture(control_rx, result_tx, chunk_duration));

    // Example: Run for 30 seconds, then stop
    for _ in 0..6 {
        if let Ok(result) = result_rx.recv_timeout(Duration::from_secs(5)) {
            println!("Transcription: {}", result.text);
        }
    }

    control_tx.send(ControlMessage::Stop)?;
    capture_thread.join().unwrap()?;

    Ok(())
}
