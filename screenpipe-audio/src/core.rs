use anyhow::{anyhow, Result};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::WavWriter;
use log::{error, info};
use serde::Serialize;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::{fmt, thread};
use tempfile::NamedTempFile;

use crate::stt::stt;

pub struct CaptureResult {
    pub audio: Vec<f32>,
    pub text: String,
}

pub enum DeviceSpec {
    Input(Option<String>),
    Output(Option<String>),
}

impl DeviceSpec {
    pub fn from_name(name: &str) -> Result<Self> {
        if name.trim().is_empty() {
            return Err(anyhow!("Device name cannot be empty"));
        }

        if name.to_lowercase().ends_with("(input)") {
            Ok(DeviceSpec::Input(Some(
                name.trim_end_matches("(input)").trim().to_string(),
            )))
        } else if name.to_lowercase().ends_with("(output)") {
            Ok(DeviceSpec::Output(Some(
                name.trim_end_matches("(output)").trim().to_string(),
            )))
        } else {
            Err(anyhow!(
                "Device type (input/output) not specified in the name"
            ))
        }
    }
}

// impl display for DeviceSpec
impl fmt::Display for DeviceSpec {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            DeviceSpec::Input(name) => {
                write!(f, "Input: {}", name.as_ref().unwrap_or(&"None".to_string()))
            }
            DeviceSpec::Output(name) => write!(
                f,
                "Output: {}",
                name.as_ref().unwrap_or(&"None".to_string())
            ),
        }
    }
}

// impl copy for DeviceSpec
impl Clone for DeviceSpec {
    fn clone(&self) -> Self {
        match self {
            DeviceSpec::Input(name) => DeviceSpec::Input(name.clone()),
            DeviceSpec::Output(name) => DeviceSpec::Output(name.clone()),
        }
    }
}

// Helper function to create DeviceSpec from a name or None
pub fn parse_device_spec(name: &str) -> Result<DeviceSpec> {
    DeviceSpec::from_name(name)
}

pub fn continuous_audio_capture(
    device_spec: &DeviceSpec,
    control_rx: Receiver<ControlMessage>,
    result_tx: Sender<CaptureResult>,
    chunk_duration: Duration,
) -> Result<()> {
    let host = cpal::default_host();

    let (device, is_input) = match device_spec {
        DeviceSpec::Input(name) => {
            let device = match name {
                Some(name) => host
                    .devices()?
                    .find(|d| d.name().map(|n| n == *name).unwrap_or(false))
                    .ok_or_else(|| {
                        anyhow::anyhow!("Specified input device '{}' not found", name)
                    })?,
                None => host
                    .default_input_device()
                    .ok_or_else(|| anyhow::anyhow!("No default input device available"))?,
            };
            (device, true)
        }
        DeviceSpec::Output(name) => {
            let device = match name {
                Some(name) => host
                    .devices()?
                    .find(|d| d.name().map(|n| n == *name).unwrap_or(false))
                    .ok_or_else(|| {
                        anyhow::anyhow!("Specified output device '{}' not found", name)
                    })?,
                None => host
                    .default_output_device()
                    .ok_or_else(|| anyhow::anyhow!("No default output device available"))?,
            };
            (device, false)
        }
    };

    let config = if is_input {
        info!("Device is input, using input config");
        device.default_input_config()?
    } else {
        info!("Device is output, using output config");
        device.default_output_config()?
    };

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;
    info!(
        "Sample rate: {}, Channels: {}, Device: \"{}\", Config: {:?}, Type: {}",
        sample_rate,
        channels,
        device.name().unwrap(),
        config,
        if is_input { "Input" } else { "Output" }
    );

    let audio_buffer = Arc::new(Mutex::new(Vec::new()));
    let audio_buffer_clone = audio_buffer.clone();

    let is_paused = Arc::new(Mutex::new(false));
    let should_stop = Arc::new(Mutex::new(false));

    let is_paused_clone = is_paused.clone();
    let stream = if is_input {
        info!("Building input stream");
        device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &_| {
                if !*is_paused_clone.lock().unwrap() {
                    audio_buffer_clone.lock().unwrap().extend_from_slice(data);
                }
            },
            |err| error!("An error occurred on the input audio stream: {}", err),
            None,
        )?
    } else {
        info!("Building output stream");
        let err_fn = |err| error!("An error occurred on the output audio stream: {}", err);
        device.build_output_stream(
            &config.into(),
            move |data: &mut [f32], _: &_| {
                if !*is_paused_clone.lock().unwrap() {
                    // For output devices, we need to fill the buffer with silence
                    // and capture what would have been played
                    for sample in data.iter_mut() {
                        *sample = 0.0; // Fill with silence
                    }
                    audio_buffer_clone.lock().unwrap().extend_from_slice(data);
                }
            },
            err_fn,
            None,
        )?
    };

    match stream.play() {
        Ok(_) => info!("Successfully started audio stream"),
        Err(e) => error!("Failed to start audio stream: {}", e),
    }

    let is_paused_clone = is_paused.clone();
    let should_stop_clone = should_stop.clone();

    let process_audio = move || -> Result<()> {
        let mut last_process_time = Instant::now();
        let mut full_transcription = String::new();

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

            let now = Instant::now();
            if now.duration_since(last_process_time) < chunk_duration {
                thread::sleep(Duration::from_millis(100));
                continue;
            }

            let mut audio_data = audio_buffer.lock().unwrap();
            let required_samples = sample_rate as usize * (chunk_duration.as_secs() as usize);
            // sample_rate as usize * channels * (chunk_duration.as_secs() as usize);
            // TODO: dont think we should multiply by channels here
            if audio_data.len() >= required_samples {
                info!("Processing audio... Buffer size: {}", audio_data.len());
                let chunk = audio_data.drain(..required_samples).collect::<Vec<f32>>();
                drop(audio_data);

                // Process the audio chunk (save to file and transcribe)
                let temp_file = NamedTempFile::new()?;
                let temp_path = temp_file.path().to_str().unwrap();

                let spec = hound::WavSpec {
                    channels: channels as u16,
                    sample_rate,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                };
                let mut writer = WavWriter::create(temp_path, spec)?;
                for sample in chunk.iter() {
                    writer.write_sample((sample * 32767.0) as i16)?;
                }
                writer.finalize()?;

                info!("Starting transcription for file: {}", temp_path);
                match stt(temp_path) {
                    Ok(transcription) => {
                        // info!("Transcription successful: {}", transcription);

                        if !transcription.is_empty() {
                            if !full_transcription.is_empty() {
                                full_transcription.push(' ');
                            }
                            full_transcription.push_str(&transcription);
                        }

                        result_tx.send(CaptureResult {
                            audio: chunk,
                            text: full_transcription.clone(),
                        })?;
                    }
                    Err(e) => {
                        error!("Transcription failed: {}", e);
                        continue;
                    }
                }
                std::fs::remove_file(temp_path)?;

                last_process_time = now;
            } else {
                thread::sleep(Duration::from_millis(100));
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
        channels: 1, // TODO
        sample_rate: 44100,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut writer = WavWriter::create(file_path, spec)
        .map_err(|e| anyhow::anyhow!("Failed to create WavWriter: {}", e))?;
    for sample in audio.iter() {
        writer
            .write_sample(*sample)
            .map_err(|e| anyhow::anyhow!("Failed to write sample: {}", e))?;
    }
    writer
        .finalize()
        .map_err(|e| anyhow::anyhow!("Failed to finalize WavWriter: {}", e))?;
    Ok(())
}

#[derive(Serialize)]
pub struct AudioDevice {
    name: String,
    device_type: String,
}

impl fmt::Display for AudioDevice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.name, self.device_type)
    }
}

pub fn list_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    for device in host.input_devices()? {
        if let Ok(name) = device.name() {
            devices.push(AudioDevice {
                name,
                device_type: "input".to_string(),
            });
        }
    }

    for device in host.output_devices()? {
        if let Ok(name) = device.name() {
            devices.push(AudioDevice {
                name,
                device_type: "output".to_string(),
            });
        }
    }

    Ok(devices)
}
