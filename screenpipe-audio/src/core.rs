use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam::channel::{Receiver, Sender};
use log::{debug, error, info, warn};
use serde::Serialize;
use std::fmt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;

use crate::AudioInput;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Clone)]
pub struct DeviceControl {
    pub is_running: bool,
    pub is_paused: bool,
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize)]
pub enum DeviceType {
    Input,
    Output,
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize)]
pub struct AudioDevice {
    name: String,
    device_type: DeviceType,
}

impl AudioDevice {
    pub fn new(name: String, device_type: DeviceType) -> Self {
        AudioDevice { name, device_type }
    }

    pub fn from_name(name: &str) -> Result<Self> {
        if name.trim().is_empty() {
            return Err(anyhow!("Device name cannot be empty"));
        }

        let (name, device_type) = if name.to_lowercase().ends_with("(input)") {
            (
                name.trim_end_matches("(input)").trim().to_string(),
                DeviceType::Input,
            )
        } else if name.to_lowercase().ends_with("(output)") {
            (
                name.trim_end_matches("(output)").trim().to_string(),
                DeviceType::Output,
            )
        } else {
            return Err(anyhow!(
                "Device type (input/output) not specified in the name"
            ));
        };

        Ok(AudioDevice::new(name, device_type))
    }
}

impl fmt::Display for AudioDevice {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{} ({})",
            self.name,
            match self.device_type {
                DeviceType::Input => "input",
                DeviceType::Output => "output",
            }
        )
    }
}

// Helper function to create AudioDevice from a name
pub fn parse_audio_device(name: &str) -> Result<AudioDevice> {
    AudioDevice::from_name(name)
}

fn get_device_and_config(
    audio_device: &AudioDevice,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig)> {
    let host = match audio_device.device_type {
        #[cfg(target_os = "macos")]
        DeviceType::Output => cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?,
        _ => cpal::default_host(),
    };

    info!("device: {:?}", audio_device.to_string());

    let audio_device = if audio_device.to_string() == "default" {
        host.default_input_device()
    } else {
        host.input_devices()?.find(|x| {
            x.name()
                .map(|y| {
                    y == audio_device
                        .to_string()
                        .replace(" (input)", "")
                        .replace(" (output)", "")
                })
                .unwrap_or(false)
        })
    }
    .ok_or_else(|| anyhow!("Audio device not found"))?;

    let config = audio_device.default_input_config()?;
    Ok((audio_device, config))
}

pub async fn record_and_transcribe(
    audio_device: &AudioDevice,
    duration: Duration,
    output_path: PathBuf,
    whisper_sender: Sender<AudioInput>,
    is_running: Arc<AtomicBool>,
) -> Result<PathBuf> {
    let (cpal_audio_device, config) = get_device_and_config(audio_device)?;
    info!(
        "Recording audio device: {}, Config: {:?}",
        cpal_audio_device.name()?,
        config
    );

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as u16;

    let (audio_sender, audio_receiver): (Sender<Vec<u8>>, Receiver<Vec<u8>>) =
        crossbeam::channel::unbounded();
    let is_running_clone = Arc::clone(&is_running);
    let is_running_clone_2 = Arc::clone(&is_running);
    let output_path_clone = output_path.clone();
    let output_path_clone_2 = output_path.clone();

    let start_time = std::time::Instant::now();

    // Spawn FFmpeg process in a separate thread
    let ffmpeg_handle = tokio::spawn(async move {
        let mut ffmpeg = Command::new("ffmpeg")
            .args(&[
                "-f",
                "f32le",
                "-ar",
                &sample_rate.to_string(),
                "-ac",
                &channels.to_string(),
                "-i",
                "pipe:0",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
                "-f",
                "mp3",
                output_path_clone.to_str().unwrap(),
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("Failed to spawn ffmpeg process");

        let mut stdin = ffmpeg.stdin.take().expect("Failed to open stdin");

        debug!("FFmpeg process started");

        while is_running_clone.load(Ordering::Relaxed) {
            if let Ok(data) = audio_receiver.recv_timeout(Duration::from_millis(100)) {
                if let Err(e) = stdin.write_all(&data).await {
                    error!("Failed to write audio data to FFmpeg: {}", e);
                    break;
                }
            }
            if start_time.elapsed() >= duration {
                break;
            }
            // sleep for 100ms
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        // Close stdin to signal EOF to FFmpeg
        drop(stdin);

        // Wait for FFmpeg to finish
        match ffmpeg.wait().await {
            Ok(status) => debug!("FFmpeg process exited with status: {}", status),
            Err(e) => error!("Failed to wait for FFmpeg process: {}", e),
        }
    });

    let err_fn = |err| error!("An error occurred on the audio stream: {}", err);

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => cpal_audio_device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &_| {
                if is_running.load(Ordering::Relaxed) {
                    if let Err(e) = audio_sender.try_send(bytemuck::cast_slice(data).to_vec()) {
                        warn!("Failed to send audio data: {}", e);
                    }
                }
            },
            err_fn,
            None,
        )?,
        sample_format => return Err(anyhow!("Unsupported sample format '{}'", sample_format)),
    };
    debug!("audio stream created");

    stream.play()?;
    info!("Recording for {} seconds", duration.as_secs());

    while is_running_clone_2.load(Ordering::Relaxed) {
        if start_time.elapsed() >= duration {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    info!(
        "Recording stopped, wrote to {}. Now triggering transcription",
        output_path_clone_2.to_str().unwrap()
    );

    // Stop the stream and signal the recording to stop
    stream.pause()?;

    // Wait for the FFmpeg thread to finish
    ffmpeg_handle.await.expect("Failed to join FFmpeg thread");
    debug!("FFmpeg thread finished");

    if let Err(e) = whisper_sender.send(AudioInput {
        path: output_path_clone_2.to_str().unwrap().to_string(),
        device: audio_device.to_string(),
    }) {
        error!("Failed to send audio to whisper: {}", e);
    }
    debug!("Sent audio to whisper");

    Ok(output_path_clone_2)
}

pub fn list_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    for device in host.input_devices()? {
        if let Ok(name) = device.name() {
            devices.push(AudioDevice::new(name, DeviceType::Input));
        }
    }

    #[cfg(target_os = "macos")]
    {
        let host = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?;
        for device in host.input_devices()? {
            if let Ok(name) = device.name() {
                devices.push(AudioDevice::new(name, DeviceType::Output));
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        for device in host.output_devices()? {
            if let Ok(name) = device.name() {
                devices.push(AudioDevice::new(name, DeviceType::Output));
            }
        }
    }

    Ok(devices)
}

// function that return default device to record audio
pub fn default_input_device() -> Result<AudioDevice> {
    let host = cpal::default_host();
    let device = host.default_input_device().unwrap();
    info!("Using default input device: {}", device.name()?);
    Ok(AudioDevice::new(device.name()?, DeviceType::Input))
}

// ! HACK - yes this quite unintuitive ... but it works ...

// function that return default device to record audio
pub fn default_output_device() -> Result<AudioDevice> {
    #[cfg(target_os = "macos")]
    {
        let host = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?;
        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow!("No default input device found"))?;
        info!("Using display capture device: {}", device.name()?);
        return Ok(AudioDevice::new(device.name()?, DeviceType::Output));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| anyhow!("No default output device found"))?;
        info!("Using default output device: {}", device.name()?);
        return Ok(AudioDevice::new(device.name()?, DeviceType::Output));
    }
}
