use anyhow::Result;
use reqwest;
use screenpipe_audio::stt_v2::{init_whisper, WhisperInput};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;

const AUDIO_URL: &str =
    "https://github.com/thewh1teagle/sherpa-rs/releases/download/v0.1.0/sam_altman.wav";
const AUDIO_PATH: &str = "sam_altman.wav";

async fn download_audio() -> Result<()> {
    println!("downloading sample audio...");
    let response = reqwest::get(AUDIO_URL).await?;
    let bytes = response.bytes().await?;
    fs::write(AUDIO_PATH, bytes).await?;
    println!("audio downloaded successfully");
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    // download sample audio if it doesn't exist
    if !PathBuf::from(AUDIO_PATH).exists() {
        download_audio().await?;
    }

    // load audio file using hound
    let mut reader = hound::WavReader::open(AUDIO_PATH)?;
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.unwrap() as f32 / 32768.0)
        .collect();

    let sample_rate = reader.spec().sample_rate as usize;
    let channels = reader.spec().channels as usize;

    println!("processing audio file: {}", AUDIO_PATH);
    println!("sample rate: {}, channels: {}", sample_rate, channels);

    // init whisper and get channels
    let (tx, mut rx) = init_whisper().await?;

    // create dummy device for example
    let device = Arc::new(screenpipe_audio::AudioDevice {
        name: "test".into(),
        device_type: screenpipe_audio::DeviceType::Input,
    });

    // create output path
    let output_path = PathBuf::from("output.txt");

    // create input
    let input = WhisperInput {
        samples: samples.clone(),
        sample_rate: sample_rate as u32,
        channels: channels as u16,
        device: device.name.clone(),
        output_path: output_path.clone(),
    };

    // send input for processing
    tx.send(input).await?;

    // receive and print results
    while let Some(output) = rx.recv().await {
        if let Some(text) = output.transcription {
            println!("transcription: {}", text);
        }
        if let Some(error) = output.error {
            println!("error: {}", error);
        }
    }

    Ok(())
}
