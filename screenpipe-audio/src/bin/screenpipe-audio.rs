use anyhow::{anyhow, Result};
use clap::Parser;
use log::info;
use screenpipe_audio::create_whisper_channel;
use screenpipe_audio::default_input_device;
use screenpipe_audio::default_output_device;
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

    let devices = if args.audio_device.is_empty() {
        vec![default_input_device()?, default_output_device()?]
    } else {
        args.audio_device
            .iter()
            .map(|d| parse_device_spec(d))
            .collect::<Result<Vec<_>>>()?
    };

    if devices.is_empty() {
        return Err(anyhow!("No audio input devices found"));
    }

    let chunk_duration = Duration::from_secs(30);
    let output_path = PathBuf::from("output.wav");
    let (whisper_sender, whisper_receiver) = create_whisper_channel()?;

    // Spawn threads for each device
    let recording_threads: Vec<_> = devices
        .into_iter()
        .enumerate()
        .map(|(i, device)| {
            let whisper_sender = whisper_sender.clone();
            let output_path = output_path.with_file_name(format!("output_{}.wav", i));
            thread::spawn(move || {
                record_and_transcribe(&device, chunk_duration, output_path, whisper_sender)
            })
        })
        .collect();

    // Main loop to receive and print transcriptions
    loop {
        match whisper_receiver.recv_timeout(Duration::from_secs(5)) {
            Ok(result) => {
                info!("Transcription: {:?}", result);
            }
            Err(crossbeam::channel::RecvTimeoutError::Timeout) => {
                // No transcription received in 5 seconds, continue waiting
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
