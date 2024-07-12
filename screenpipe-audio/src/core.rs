use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam::channel::{Receiver, Sender};
use log::{debug, error, info};
use serde::Serialize;
use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::AudioInput;

pub struct AudioCaptureResult {
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
                write!(
                    f,
                    "{} (input)",
                    name.as_ref().unwrap_or(&"None".to_string())
                )
            }
            DeviceSpec::Output(name) => write!(
                f,
                "{} (output)",
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
    DeviceSpec::from_name(&name)
}

use std::io::Write;
use std::process::{Command, Stdio};

pub fn record_and_transcribe(
    device_spec: &DeviceSpec,
    duration: Duration,
    output_path: PathBuf,
    whisper_sender: Sender<AudioInput>,
) -> Result<PathBuf> {
    let host = match device_spec {
        #[cfg(target_os = "macos")]
        DeviceSpec::Output(_) => cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?,
        _ => cpal::default_host(),
    };

    info!("device: {:?}", device_spec.to_string());

    let audio_device = if device_spec.to_string() == "default" {
        host.default_input_device()
    } else {
        host.input_devices()?.find(|x| {
            x.name()
                .map(|y| {
                    y == device_spec
                        .to_string()
                        .replace(" (input)", "")
                        .replace(" (output)", "")
                })
                .unwrap_or(false)
        })
    }
    .ok_or_else(|| anyhow!("Audio device not found"))?;

    let config = audio_device.default_input_config()?;
    info!(
        "Recording audio device: {}, Config: {:?}",
        audio_device.name()?,
        config
    );

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as u16;

    let (audio_sender, audio_receiver): (Sender<Vec<u8>>, Receiver<Vec<u8>>) =
        crossbeam::channel::unbounded();
    let is_running = Arc::new(Mutex::new(true));
    let is_running_clone = is_running.clone();

    let output_path_clone = output_path.clone();
    // Spawn FFmpeg process in a separate thread
    let ffmpeg_handle = thread::spawn(move || {
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

        while *is_running_clone.lock().unwrap() {
            if let Ok(data) = audio_receiver.recv_timeout(Duration::from_millis(100)) {
                if let Err(e) = stdin.write_all(&data) {
                    error!("Failed to write audio data to FFmpeg: {}", e);
                    break;
                }
            }
        }

        // Close stdin to signal EOF to FFmpeg
        drop(stdin);

        // Wait for FFmpeg to finish
        match ffmpeg.wait() {
            Ok(status) => debug!("FFmpeg process exited with status: {}", status),
            Err(e) => error!("Failed to wait for FFmpeg process: {}", e),
        }
    });

    let err_fn = |err| error!("An error occurred on the audio stream: {}", err);

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => audio_device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &_| {
                if let Err(e) = audio_sender.send(bytemuck::cast_slice(data).to_vec()) {
                    error!("Failed to send audio data: {}", e);
                }
            },
            err_fn,
            None,
        )?,
        sample_format => return Err(anyhow!("Unsupported sample format '{}'", sample_format)),
    };

    stream.play()?;
    info!("Recording for {} seconds", duration.as_secs());

    thread::sleep(duration);

    // Stop the stream and signal the recording to stop
    stream.pause()?;
    *is_running.lock().unwrap() = false;

    // Wait for the FFmpeg thread to finish
    ffmpeg_handle.join().expect("Failed to join FFmpeg thread");

    whisper_sender.send(AudioInput {
        path: output_path.to_str().unwrap().to_string(),
        device: device_spec.to_string(),
    })?;

    Ok(output_path)
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

    #[cfg(target_os = "macos")]
    {
        let host = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?;
        for device in host.input_devices()? {
            if let Ok(name) = device.name() {
                devices.push(AudioDevice {
                    name,
                    device_type: "output".to_string(),
                });
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        for device in host.output_devices()? {
            if let Ok(name) = device.name() {
                devices.push(AudioDevice {
                    name,
                    device_type: "output".to_string(),
                });
            }
        }
    }

    Ok(devices)
}
// function that return default device to record audio
pub fn default_input_device() -> Result<DeviceSpec> {
    let host = cpal::default_host();
    let device = host.default_input_device().unwrap();
    info!("Using default input device: {}", device.name()?);
    Ok(DeviceSpec::Input(Some(device.name()?)))
}

// ! HACK - yes this quite unintuitive ... but it works ...

// function that return default device to record audio
pub fn default_output_device() -> Result<DeviceSpec> {
    #[cfg(target_os = "macos")]
    {
        let host = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?;
        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow!("No default input device found"))?;
        info!("Using display capture device: {}", device.name()?);
        return Ok(DeviceSpec::Output(Some(device.name()?)));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| anyhow!("No default output device found"))?;
        info!("Using default output device: {}", device.name()?);
        return Ok(DeviceSpec::Output(Some(device.name()?)));
    }
}
