use anyhow::{anyhow, Result};
use clap::Parser;
use cpal::traits::{DeviceTrait, HostTrait};
use log::info;
use screenpipe_audio::continuous_audio_capture;
use screenpipe_audio::list_audio_devices;
use screenpipe_audio::parse_device_spec;
use screenpipe_audio::AudioDevice;
use std::thread;
use std::time::Duration;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {
    #[clap(short, long, help = "Audio device name")]
    device: Option<String>,

    #[clap(long, help = "List available audio devices")]
    list_devices: bool,
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

    if args.list_devices {
        print_devices(&devices);
        return Ok(());
    }

    let device = match args.device {
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

    let (_control_tx, control_rx) = mpsc::channel();
    let (result_tx, result_rx) = mpsc::channel();
    let chunk_duration = Duration::from_secs(5);
    let _capture_thread = thread::spawn(move || {
        continuous_audio_capture(&device, control_rx, result_tx, chunk_duration)
    });

    loop {
        if let Ok(result) = result_rx.recv_timeout(Duration::from_secs(5)) {
            info!("Transcription: {}", result.text);
        }
    }
}
