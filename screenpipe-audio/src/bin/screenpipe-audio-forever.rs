use anyhow::{anyhow, Result};
use clap::Parser;
use log::info;
use screenpipe_audio::core::device::{
    default_input_device, default_output_device, list_audio_devices, parse_audio_device,
    AudioDevice,
};
use screenpipe_audio::core::engine::AudioTranscriptionEngine;
use screenpipe_audio::core::record_and_transcribe;
use screenpipe_audio::core::stream::AudioStream;
use screenpipe_audio::create_whisper_channel;
use screenpipe_audio::vad::{VadEngineEnum, VadSensitivity};
use screenpipe_core::Language;
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

    #[clap(short = 'l', long, value_enum)]
    language: Vec<Language>,
}

fn print_devices(devices: &[AudioDevice]) {
    println!("Available audio devices:");
    for device in devices.iter() {
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

    let languages = args.language;

    let devices = list_audio_devices().await?;

    if args.list_audio_devices {
        print_devices(&devices);
        return Ok(());
    }
}
