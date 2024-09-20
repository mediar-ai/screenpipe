use anyhow::{anyhow, Result};
use clap::Parser;
use log::info;
use screenpipe_audio::create_whisper_channel;
use screenpipe_audio::default_input_device;
use screenpipe_audio::default_output_device;
use screenpipe_audio::list_audio_devices;
use screenpipe_audio::parse_audio_device;
use screenpipe_audio::record_and_transcribe;
use screenpipe_audio::vad_engine::VadSensitivity;
use screenpipe_audio::AudioDevice;
use screenpipe_audio::AudioTranscriptionEngine;
use screenpipe_audio::VadEngineEnum;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
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

    #[clap(long, help = "Audio chunk duration in seconds")]
    audio_chunk_duration: f32,

    #[clap(long, help = "Deepgram API key")]
    deepgram_api_key: Option<String>,
}

fn print_devices(devices: &[AudioDevice]) {
    println!("Available audio devices:");
    for (_, device) in devices.iter().enumerate() {
        println!("  {}", device);
    }

    #[cfg(target_os = "macos")]
    println!("On macOS, it's not intuitive but output devices are your displays");
}

// ! usage - cargo run --bin screenpipe-audio -- --audio-device "Display 1 (output)"

#[tokio::main]
async fn main() -> Result<()> {
    use env_logger::Builder;
    use log::LevelFilter;

    Builder::new()
        .filter(None, LevelFilter::Debug)
        .filter_module("tokenizers", LevelFilter::Error)
        .init();

    let args = Args::parse();

    let devices = list_audio_devices().await?;

    if args.list_audio_devices {
        print_devices(&devices);
        return Ok(());
    }

    let devices = if args.audio_device.is_empty() {
        vec![default_input_device()?, default_output_device().await?]
    } else {
        args.audio_device
            .iter()
            .map(|d| parse_audio_device(d))
            .collect::<Result<Vec<_>>>()?
    };

    if devices.is_empty() {
        return Err(anyhow!("No audio input devices found"));
    }

    let chunk_duration = Duration::from_secs_f32(args.audio_chunk_duration);
    let (whisper_sender, whisper_receiver, _) = create_whisper_channel(
        Arc::new(AudioTranscriptionEngine::WhisperDistilLargeV3),
        VadEngineEnum::Silero, // Or VadEngineEnum::WebRtc, hardcoded for now
        args.deepgram_api_key,
        &PathBuf::from("output.mp4"),
        VadSensitivity::Medium,
    )
    .await?;
    // Spawn threads for each device
    let _recording_threads: Vec<_> = devices
        .into_iter()
        .enumerate()
        .map(|(i, device)| {
            let device = Arc::new(device);
            let whisper_sender = whisper_sender.clone();

            let device_control = Arc::new(AtomicBool::new(true));

            tokio::spawn(async move {
                loop {
                    let result = record_and_transcribe(
                        Arc::clone(&device),
                        chunk_duration,
                        whisper_sender.clone(),
                        Arc::clone(&device_control),
                    )
                    .await;

                    if let Err(e) = result {
                        eprintln!("Error in recording thread {}: {:?}", i, e);
                        // Optionally add a short delay before retrying
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            })
        })
        .collect();

    // Main loop to receive and print transcriptions
    loop {
        match whisper_receiver.recv() {
            Ok(result) => {
                info!("Transcription: {:?}", result);
            }
            Err(e) => {
                eprintln!("Error receiving transcription: {:?}", e);
            }
        }
    }
}
