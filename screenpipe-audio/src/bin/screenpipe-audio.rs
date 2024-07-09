use anyhow::{anyhow, Result};
use clap::Parser;
use log::info;
use screenpipe_audio::list_audio_devices;
use screenpipe_audio::parse_device_spec;
use screenpipe_audio::record_and_transcribe;
use screenpipe_audio::AudioDevice;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {
    #[clap(short, long, help = "Audio device name")]
    audio_device: Option<String>,

    #[clap(long, help = "List available audio devices")]
    list_audio_devices: bool,
}

fn print_devices(devices: &[AudioDevice]) {
    println!("Available audio devices:");
    for (i, device) in devices.iter().enumerate() {
        println!("  {}. {}", i + 1, device);
    }
}

fn main() -> Result<()> {
    use env_logger::Builder;
    use log::LevelFilter;
    use std::sync::mpsc;

    Builder::new()
        .filter(None, LevelFilter::Info)
        .filter_module("tokenizers", LevelFilter::Error)
        .init();

    let args = Args::parse();

    let devices = list_audio_devices()?;

    if args.list_audio_devices {
        print_devices(&devices);
        return Ok(());
    }

    let device = match args.audio_device {
        Some(d) => parse_device_spec(&d).unwrap(),
        None => {
            if devices.is_empty() {
                return Err(anyhow!("No audio input devices found"));
            }
            eprintln!("No audio device specified. Available devices are:");
            print_devices(&devices);
            eprintln!("\nPlease specify one or more devices with:");
            eprintln!(
                "  {} --audio-device \"Device Name (input)\" [--audio-device \"Another Device (output)\"]",
                std::env::args().next().unwrap()
            );
            return Err(anyhow!("No device specified"));
        }
    };

    let (result_tx, result_rx) = mpsc::channel();
    let chunk_duration = Duration::from_secs(30);
    let output_path = PathBuf::from("output.wav");
    // Spawn a thread to handle the recording and transcription
    let recording_thread = thread::spawn(move || {
        record_and_transcribe(&device, chunk_duration, result_tx, output_path)
    });

    // Main loop to receive and print transcriptions
    loop {
        match result_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(result) => {
                info!("Transcription: {}", result.text);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // No transcription received in 5 seconds, continue waiting
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                // Sender has been dropped, recording is complete
                break;
            }
        }
    }

    // Wait for the recording thread to finish
    let file_path = recording_thread.join().unwrap()?;
    println!("Recording complete: {:?}", file_path);

    Ok(())
}
