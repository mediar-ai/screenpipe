use crate::AudioInput;
use anyhow::{anyhow, Result};
use crossbeam::queue::ArrayQueue;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::{fmt, thread};

// Import tokio for asynchronous process handling
use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::Command as TokioCommand;

#[derive(Clone, Debug, PartialEq)]
pub enum AudioTranscriptionEngine {
    Deepgram,
    WhisperTiny,
    WhisperDistilLargeV3,
    WhisperLargeV3Turbo,
    WhisperLargeV3,
}

impl fmt::Display for AudioTranscriptionEngine {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AudioTranscriptionEngine::Deepgram => write!(f, "Deepgram"),
            AudioTranscriptionEngine::WhisperTiny => write!(f, "WhisperTiny"),
            AudioTranscriptionEngine::WhisperDistilLargeV3 => write!(f, "WhisperLarge"),
            AudioTranscriptionEngine::WhisperLargeV3Turbo => write!(f, "WhisperLargeV3Turbo"),
            AudioTranscriptionEngine::WhisperLargeV3 => write!(f, "WhisperLargeV3"),
        }
    }
}

impl Default for AudioTranscriptionEngine {
    fn default() -> Self {
        AudioTranscriptionEngine::WhisperLargeV3Turbo
    }
}

#[derive(Clone)]
pub struct DeviceControl {
    pub is_running: bool,
    pub is_paused: bool,
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize, Debug, Deserialize)]
pub enum DeviceType {
    Input,
    Output,
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize, Debug)]
pub struct AudioDevice {
    pub name: String,
    pub device_type: DeviceType,
}

impl AudioDevice {
    pub fn new(name: String, device_type: DeviceType) -> Self {
        AudioDevice { name, device_type }
    }

    pub fn from_name(name: &str) -> Result<Self> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(anyhow!("Device name cannot be empty"));
        }

        // Since we're using ffmpeg with PulseAudio, and only capturing from input devices,
        // we can default to DeviceType::Input
        Ok(AudioDevice::new(
            trimmed_name.to_string(),
            DeviceType::Input,
        ))
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

pub fn parse_audio_device(name: &str) -> Result<AudioDevice> {
    AudioDevice::from_name(name)
}

pub async fn record_and_transcribe(
    audio_device: Arc<AudioDevice>,
    duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    let device_name = audio_device.name.clone();

    // Construct the ffmpeg command
    let mut command = TokioCommand::new("ffmpeg");

    // Input format and device
    command.arg("-f").arg("pulse");

    // Use the specified audio device
    if device_name.to_lowercase() != "default" {
        command.arg("-i").arg(&device_name);
    } else {
        command.arg("-i").arg("default");
    }

    // Set output format to raw PCM and output to stdout
    command.arg("-f").arg("s16le");
    command.arg("-acodec").arg("pcm_s16le");
    command.arg("-ar").arg("44100"); // Sample rate
    command.arg("-ac").arg("1"); // Mono audio
    command.arg("-"); // Output to stdout

    // Set duration
    let duration_secs = duration.as_secs().to_string();
    command.arg("-t").arg(&duration_secs);

    // Suppress unnecessary output
    command.arg("-loglevel").arg("error");

    // Spawn the ffmpeg process
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    info!(
        "Started ffmpeg process to capture audio from device: {}",
        audio_device.name
    );

    // Read from ffmpeg's stdout
    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();

        while is_running.load(Ordering::Relaxed) {
            let mut chunk = [0u8; 4096];
            let n = reader.read(&mut chunk).await?;
            if n == 0 {
                break;
            }
            buffer.extend_from_slice(&chunk[..n]);
        }

        // Convert the buffer (Vec<u8>) into Vec<f32>
        let mut samples = Vec::with_capacity(buffer.len() / 2);
        for chunk in buffer.chunks_exact(2) {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            let f32_sample = sample as f32 / i16::MAX as f32;
            samples.push(f32_sample);
        }

        // Send the audio data through the channel
        whisper_sender.send(AudioInput {
            data: Arc::new(samples),
            device: audio_device.clone(),
            sample_rate: 44100, // Sample rate used in ffmpeg command
            channels: 1,        // Mono audio
        })?;
    }

    // Wait for the ffmpeg process to finish
    let status = child.wait().await?;
    if !status.success() {
        let mut stderr_output = Vec::new();
        if let Some(mut stderr) = child.stderr.take() {
            stderr.read_to_end(&mut stderr_output).await?;
        }
        let error_message = String::from_utf8_lossy(&stderr_output);
        return Err(anyhow!(
            "ffmpeg exited with status {}: {}",
            status.code().unwrap_or(-1),
            error_message
        ));
    }

    Ok(())
}

pub async fn list_audio_devices() -> Result<Vec<AudioDevice>> {
    // Use 'pactl' to list PulseAudio sources
    let output = TokioCommand::new("pactl")
        .arg("list")
        .arg("sources")
        .arg("short")
        .output()
        .await?;

    if !output.status.success() {
        return Err(anyhow!(
            "Failed to list PulseAudio sources: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut devices = Vec::new();

    // Include the default device
    devices.push(AudioDevice::new("default".to_string(), DeviceType::Input));

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() > 1 {
            let name = parts[1].to_string();
            devices.push(AudioDevice::new(name, DeviceType::Input));
        }
    }

    Ok(devices)
}

pub fn default_input_device() -> Result<AudioDevice> {
    Ok(AudioDevice::new("default".to_string(), DeviceType::Input))
}

pub fn default_output_device() -> Result<AudioDevice> {
    Ok(AudioDevice::new("default".to_string(), DeviceType::Output))
}
