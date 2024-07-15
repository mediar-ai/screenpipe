use anyhow::{anyhow, Result};
use clap::Parser;
use log::info;
use screenpipe_audio::create_whisper_channel;
use screenpipe_audio::default_input_device;
use screenpipe_audio::default_output_device;
use screenpipe_audio::list_audio_devices;
use screenpipe_audio::parse_audio_device;
use screenpipe_audio::record_and_transcribe;
use screenpipe_audio::AudioDevice;
use screenpipe_audio::DeviceControl;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {
    #[clap(
        short,
        long,
        help = "Audio device name (can be specified multiple times)"
    )]
    audio_device: Vec<String>,

    #[clap(long, help = "List available audio devices")]
    list_audio_devices: bool,
}

fn print_devices(devices: &[AudioDevice]) {
    println!("Available audio devices:");
    for (i, device) in devices.iter().enumerate() {
        println!("  {}. {}", i + 1, device);
    }
}

// TODO - kinda bad cli here

fn main() -> Result<()> {
    use env_logger::Builder;
    use log::LevelFilter;

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

    let devices = if args.audio_device.is_empty() {
        vec![default_input_device()?, default_output_device()?]
    } else {
        args.audio_device
            .iter()
            .map(|d| parse_audio_device(d))
            .collect::<Result<Vec<_>>>()?
    };

    if devices.is_empty() {
        return Err(anyhow!("No audio input devices found"));
    }

    // delete .mp3 files (output*.mp3)
    std::fs::remove_file("output_0.mp3").unwrap_or_default();
    std::fs::remove_file("output_1.mp3").unwrap_or_default();

    let chunk_duration = Duration::from_secs(5);
    let output_path = PathBuf::from("output.mp3");
    let (whisper_sender, whisper_receiver) = create_whisper_channel()?;
    // Spawn threads for each device
    let recording_threads: Vec<_> = devices
        .into_iter()
        .enumerate()
        .map(|(i, device)| {
            let whisper_sender = whisper_sender.clone();
            let output_path = output_path.with_file_name(format!("output_{}.mp3", i));
            let device_control = Arc::new(AtomicBool::new(true));
            let device_clone = device.clone();

            thread::spawn(move || {
                let device_control_clone = Arc::clone(&device_control);

                record_and_transcribe(
                    &device_clone,
                    chunk_duration,
                    output_path,
                    whisper_sender,
                    device_control_clone,
                )
            })
        })
        .collect();
    let mut consecutive_timeouts = 0;
    let max_consecutive_timeouts = 3; // Adjust this value as needed

    // Main loop to receive and print transcriptions
    loop {
        match whisper_receiver.recv_timeout(Duration::from_secs(5)) {
            Ok(result) => {
                info!("Transcription: {:?}", result);
                consecutive_timeouts = 0; // Reset the counter on successful receive
            }
            Err(crossbeam::channel::RecvTimeoutError::Timeout) => {
                consecutive_timeouts += 1;
                if consecutive_timeouts >= max_consecutive_timeouts {
                    info!("No transcriptions received for a while, stopping...");
                    break;
                }
                continue;
            }
            Err(crossbeam::channel::RecvTimeoutError::Disconnected) => {
                // All senders have been dropped, recording is complete
                break;
            }
        }
    }

    // Wait for all recording threads to finish
    for (i, thread) in recording_threads.into_iter().enumerate() {
        let file_path = thread.join().unwrap()?;
        println!("Recording {} complete: {:?}", i, file_path);
    }

    Ok(())
}
