use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use screenpipe_audio::stt_v2::{init_whisper, WhisperInput};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

const SAMPLE_RATE: u32 = 16000;
const CHANNELS: u16 = 1;
const BUFFER_DURATION_SECS: f32 = 30.0; // process 30 seconds chunks

#[tokio::main]
async fn main() -> Result<()> {
    // init whisper and get channels
    let (whisper_tx, mut whisper_rx) = init_whisper().await?;

    // setup audio capture
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .expect("no input device available");

    println!("using input device: {}", device.name()?);

    // channel for audio samples
    let (samples_tx, mut samples_rx) = mpsc::channel::<f32>(1024);

    // configure input
    let config = device.default_input_config()?.config(); // Add .config() here

    // create device info
    let device_info = Arc::new(screenpipe_audio::AudioDevice {
        name: device.name()?,
        device_type: screenpipe_audio::DeviceType::Input,
    });

    // setup audio capture stream
    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            for &sample in data {
                let _ = samples_tx.blocking_send(sample);
            }
        },
        move |err| {
            println!("an error occurred on stream: {}", err);
        },
        None,
    )?;

    stream.play()?;
    println!("started recording...");

    // buffer to accumulate samples
    let buffer_size = (SAMPLE_RATE as f32 * BUFFER_DURATION_SECS) as usize;
    let mut buffer = Vec::with_capacity(buffer_size);

    // create output path (you might want to customize this)
    let output_path = PathBuf::from("continuous_output.txt");

    // process audio in chunks
    tokio::spawn(async move {
        while let Some(sample) = samples_rx.recv().await {
            buffer.push(sample);

            if buffer.len() >= buffer_size {
                let input = WhisperInput {
                    samples: buffer.clone(),
                    sample_rate: SAMPLE_RATE,
                    channels: CHANNELS,
                    device: device_info.name.clone(),
                    output_path: output_path.clone(),
                };

                if let Err(e) = whisper_tx.send(input).await {
                    println!("error sending to whisper: {}", e);
                    break;
                }

                // clear buffer but keep capacity
                buffer.clear();
            }
        }
    });

    // receive and print results
    while let Some(output) = whisper_rx.recv().await {
        if let Some(text) = output.transcription {
            println!("transcription text: {}", text);
        }
        if let Some(speaker) = output.speaker {
            println!("speaker: {}", speaker);
        }
        if let Some(error) = output.error {
            println!("error: {}", error);
        }
    }

    Ok(())
}
