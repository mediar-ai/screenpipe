use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::WavWriter;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::stt::stt;

pub struct CaptureResult {
    pub audio: Vec<f32>,
    pub text: String,
}

pub fn continuous_audio_capture(
    control_rx: Receiver<ControlMessage>,
    result_tx: Sender<CaptureResult>,
    chunk_duration: Duration,
) -> Result<()> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .expect("No input device available");
    let config = device.default_input_config()?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    let audio_buffer = Arc::new(Mutex::new(Vec::new()));
    let audio_buffer_clone = audio_buffer.clone();

    let is_paused = Arc::new(Mutex::new(false));
    let should_stop = Arc::new(Mutex::new(false));

    let is_paused_clone = is_paused.clone();
    let stream = device.build_input_stream(
        &config.into(),
        move |data: &[f32], _: &_| {
            if !*is_paused_clone.lock().unwrap() {
                audio_buffer_clone.lock().unwrap().extend_from_slice(data);
            }
        },
        |err| eprintln!("An error occurred on the input audio stream: {}", err),
        None,
    )?;

    stream.play()?;

    let is_paused_clone = is_paused.clone();
    let should_stop_clone = should_stop.clone();

    let process_audio = move || -> Result<()> {
        loop {
            // Check for control messages
            if let Ok(message) = control_rx.try_recv() {
                match message {
                    ControlMessage::Pause => *is_paused_clone.lock().unwrap() = true,
                    ControlMessage::Resume => *is_paused_clone.lock().unwrap() = false,
                    ControlMessage::Stop => {
                        *should_stop_clone.lock().unwrap() = true;
                        break;
                    }
                }
            }

            if *is_paused_clone.lock().unwrap() {
                thread::sleep(Duration::from_millis(100));
                continue;
            }

            thread::sleep(chunk_duration);

            let mut audio_data = audio_buffer.lock().unwrap();
            if !audio_data.is_empty() {
                let chunk = audio_data.clone();
                audio_data.clear();
                drop(audio_data);

                // Process the audio chunk (save to file and transcribe)
                let temp_file = std::env::temp_dir().join("temp_audio.wav");
                let spec = hound::WavSpec {
                    channels: channels as u16,
                    sample_rate,
                    bits_per_sample: 32,
                    sample_format: hound::SampleFormat::Float,
                };
                let mut writer = WavWriter::create(&temp_file, spec)?;
                for sample in chunk.iter() {
                    writer.write_sample(*sample)?;
                }
                writer.finalize()?;

                let transcription = stt(temp_file.to_str().unwrap())?;
                std::fs::remove_file(temp_file)?;

                result_tx.send(CaptureResult {
                    audio: chunk,
                    text: transcription,
                })?;
            }

            if *should_stop_clone.lock().unwrap() {
                break;
            }
        }
        Ok(())
    };

    process_audio()?;
    Ok(())
}

pub enum ControlMessage {
    Pause,
    Resume,
    Stop,
}

// a function to save an audio to file
pub fn save_audio_to_file(audio: &[f32], file_path: &str) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 44100,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut writer = WavWriter::create(file_path, spec)?;
    for sample in audio.iter() {
        writer.write_sample(*sample)?;
    }
    writer.finalize()?;
    Ok(())
}
