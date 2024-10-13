use crate::AudioInput;
use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::StreamError;
use crossbeam::queue::ArrayQueue;
use futures::executor::block_on;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;
use tokio::task::spawn_blocking;

#[derive(Clone, Debug, PartialEq)]
pub enum AudioTranscriptionEngine {
    Deepgram,
    WhisperTiny,
    WhisperDistilLargeV3,
    WhisperLargeV3Turbo,
}

impl fmt::Display for AudioTranscriptionEngine {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AudioTranscriptionEngine::Deepgram => write!(f, "Deepgram"),
            AudioTranscriptionEngine::WhisperTiny => write!(f, "WhisperTiny"),
            AudioTranscriptionEngine::WhisperDistilLargeV3 => write!(f, "WhisperLarge"),
            AudioTranscriptionEngine::WhisperLargeV3Turbo => write!(f, "WhisperLargeV3Turbo"),
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

pub fn parse_audio_device(name: &str) -> Result<AudioDevice> {
    AudioDevice::from_name(name)
}

pub fn list_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    for device in host.input_devices()? {
        if let Ok(name) = device.name() {
            devices.push(AudioDevice::new(name, DeviceType::Input));
        }
    }

    // Filter function to exclude macOS speakers and AirPods for output devices
    fn should_include_output_device(name: &str) -> bool {
        #[cfg(target_os = "macos")]
        {
            !name.to_lowercase().contains("speakers") && !name.to_lowercase().contains("airpods")
        }
        #[cfg(not(target_os = "macos"))]
        {
            // Avoid "unused variable" warning in non-macOS systems
            let _ = name;
            true
        }
    }

    // macOS hack using screen capture kit for output devices - does not work well
    #[cfg(target_os = "macos")]
    {
        // !HACK macOS is supposed to use special macOS feature "display capture"
        // ! see https://github.com/RustAudio/cpal/pull/894
        if let Ok(host) = cpal::host_from_id(cpal::HostId::ScreenCaptureKit) {
            for device in host.input_devices()? {
                if let Ok(name) = device.name() {
                    if should_include_output_device(&name) {
                        devices.push(AudioDevice::new(name, DeviceType::Output));
                    }
                }
            }
        }
    }

    // Add default output device - on macOS think of custom virtual devices
    for device in host.output_devices()? {
        if let Ok(name) = device.name() {
            if should_include_output_device(&name) {
                devices.push(AudioDevice::new(name, DeviceType::Output));
            }
        }
    }

    // Last, add devices that are listed in .devices() which are not already in the devices vector
    let other_devices = host.devices().unwrap();
    for device in other_devices {
        if !devices.iter().any(|d| d.name == device.name().unwrap()) {
            // TODO: not sure if it can be input, usually aggregate or multi output
            devices.push(AudioDevice::new(device.name().unwrap(), DeviceType::Output));
        }
    }

    Ok(devices)
}

pub fn default_input_device() -> Result<AudioDevice> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or(anyhow!("No default input device detected"))?;
    Ok(AudioDevice::new(device.name()?, DeviceType::Input))
}

// This should be optional?
pub fn default_output_device() -> Result<AudioDevice> {
    #[cfg(target_os = "macos")]
    {
        // ! see https://github.com/RustAudio/cpal/pull/894
        if let Ok(host) = cpal::host_from_id(cpal::HostId::ScreenCaptureKit) {
            if let Some(device) = host.default_input_device() {
                if let Ok(name) = device.name() {
                    return Ok(AudioDevice::new(name, DeviceType::Output));
                }
            }
        }
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| anyhow!("No default output device found"))?;
        return Ok(AudioDevice::new(device.name()?, DeviceType::Output));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| anyhow!("No default output device found"))?;
        return Ok(AudioDevice::new(device.name()?, DeviceType::Output));
    }
}

async fn get_device_and_config(
    audio_device: &AudioDevice,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig)> {
    let host = cpal::default_host();

    info!("device: {:?}", audio_device.to_string());

    let is_output_device = audio_device.device_type == DeviceType::Output;
    let is_display = audio_device.to_string().contains("Display");

    let cpal_audio_device = if audio_device.to_string().to_lowercase() == "default (input)"
        || audio_device.to_string().to_lowercase() == "default (output)"
    {
        match audio_device.device_type {
            DeviceType::Input => host.default_input_device(),
            DeviceType::Output => host.default_output_device(),
        }
    } else {
        let mut devices = match audio_device.device_type {
            DeviceType::Input => host.input_devices()?,
            DeviceType::Output => host.output_devices()?,
        };

        #[cfg(target_os = "macos")]
        {
            if audio_device.device_type == DeviceType::Output {
                if let Ok(screen_capture_host) = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)
                {
                    devices = screen_capture_host.input_devices()?;
                }
            }
        }

        devices.find(|x| {
            x.name()
                .map(|y| {
                    y == audio_device
                        .to_string()
                        .replace(" (input)", "")
                        .replace(" (output)", "")
                        .trim()
                })
                .unwrap_or(false)
        })
    }
    .ok_or_else(|| anyhow!("Audio device not found"))?;

    // Determine the appropriate config based on device type
    let config = if is_output_device && !is_display {
        cpal_audio_device.default_output_config()?
    } else {
        cpal_audio_device.default_input_config()?
    };
    Ok((cpal_audio_device, config))
}

pub async fn record_and_transcribe(
    audio_device: Arc<AudioDevice>,
    duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    let (cpal_audio_device, config) = get_device_and_config(&audio_device).await?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as u16;
    debug!(
        "Audio device config: sample_rate={}, channels={}",
        sample_rate, channels
    );

    // Create an ArrayQueue with a capacity of 100 chunks (adjust as needed)
    let audio_queue = Arc::new(ArrayQueue::new(100));
    let audio_queue_clone = Arc::clone(&audio_queue);

    // Use a Notify for graceful shutdown
    let notify = Arc::new(Notify::new());
    let notify_clone_for_error: Arc<Notify> = Arc::clone(&notify);
    let notify_clone_for_stream: Arc<Notify> = Arc::clone(&notify);

    // Clone is_running for the error callback
    let is_running_clone_for_error: Arc<AtomicBool> = Arc::clone(&is_running);
    let error_callback = move |err: StreamError| {
        error!("An error occurred on the audio stream: {}", err);
        // Handle specific errors if needed
        if let StreamError::DeviceNotAvailable = err {
            warn!("Audio device disconnected. Stopping recording.");
            is_running_clone_for_error.store(false, Ordering::Relaxed);
            notify_clone_for_error.notify_one();
        }
    };

    // Clone is_running and notify for the stream closure
    let is_running_clone_for_stream: Arc<AtomicBool> = Arc::clone(&is_running);
    let stream_notify_clone: Arc<Notify> = Arc::clone(&notify_clone_for_stream);

    // Determine if the device is input or output
    let is_output_device = audio_device.device_type == DeviceType::Output;

    // Spawn a blocking task to handle the audio stream
    let stream_handle = spawn_blocking(move || {
        let stream_result = if is_output_device {
            // Build output stream
            match config.sample_format() {
                cpal::SampleFormat::I8 => cpal_audio_device.build_output_stream(
                    &config.into(),
                    move |_data: &mut [i8], _: &_| {
                        // Handle output audio data if needed
                        // Typically, for output capture, you may not need to process data here
                        // as you're capturing from monitor sources as input
                        // So, do nothing or process if needed
                    },
                    error_callback,
                    None,
                ),
                cpal::SampleFormat::I16 => cpal_audio_device.build_output_stream(
                    &config.into(),
                    move |_data: &mut [i16], _: &_| {
                        // Handle output audio data
                        // If not capturing, do nothing
                    },
                    error_callback,
                    None,
                ),
                cpal::SampleFormat::I32 => cpal_audio_device.build_output_stream(
                    &config.into(),
                    move |_data: &mut [i32], _: &_| {
                        // Handle output audio data
                    },
                    error_callback,
                    None,
                ),
                cpal::SampleFormat::F32 => cpal_audio_device.build_output_stream(
                    &config.into(),
                    move |_data: &mut [f32], _: &_| {
                        // Handle output audio data
                    },
                    error_callback,
                    None,
                ),
                _ => {
                    error!("Unsupported sample format: {:?}", config.sample_format());
                    return;
                }
            }
        } else {
            // Build input stream
            match config.sample_format() {
                cpal::SampleFormat::I8 => cpal_audio_device.build_input_stream(
                    &config.into(),
                    move |data: &[i8], _: &_| {
                        if is_running_clone_for_stream.load(Ordering::Relaxed) {
                            let converted = bytemuck::cast_slice(data).to_vec();
                            let _ = audio_queue_clone.push(converted);
                        }
                    },
                    error_callback,
                    None,
                ),
                cpal::SampleFormat::I16 => cpal_audio_device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &_| {
                        if is_running_clone_for_stream.load(Ordering::Relaxed) {
                            let converted = bytemuck::cast_slice(data).to_vec();
                            let _ = audio_queue_clone.push(converted);
                        }
                    },
                    error_callback,
                    None,
                ),
                cpal::SampleFormat::I32 => cpal_audio_device.build_input_stream(
                    &config.into(),
                    move |data: &[i32], _: &_| {
                        if is_running_clone_for_stream.load(Ordering::Relaxed) {
                            let converted = bytemuck::cast_slice(data).to_vec();
                            let _ = audio_queue_clone.push(converted);
                        }
                    },
                    error_callback,
                    None,
                ),
                cpal::SampleFormat::F32 => cpal_audio_device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &_| {
                        if is_running_clone_for_stream.load(Ordering::Relaxed) {
                            let converted = data.to_vec();
                            let _ = audio_queue_clone.push(converted);
                        }
                    },
                    error_callback,
                    None,
                ),
                _ => {
                    error!("Unsupported sample format: {:?}", config.sample_format());
                    return;
                }
            }
        };

        match stream_result {
            Ok(stream) => {
                if let Err(e) = stream.play() {
                    error!("Failed to play stream: {}", e);
                }
                // Keep the stream alive until notified to stop
                block_on(stream_notify_clone.notified());
                if is_output_device {
                    stream.pause().ok();
                } else {
                    stream.pause().ok();
                }
                drop(stream);
            }
            Err(e) => error!("Failed to build stream: {}", e),
        }
    });

    info!(
        "Recording {} for {} seconds",
        audio_device.to_string(),
        duration.as_secs()
    );

    // Clone is_running for the collector
    let is_running_clone_for_collector = Arc::clone(&is_running);

    // Spawn a task to collect audio data
    let collector_handle = tokio::spawn(async move {
        let mut collected_audio = Vec::new();
        while is_running_clone_for_collector.load(Ordering::Relaxed) || !audio_queue.is_empty() {
            while let Some(chunk) = audio_queue.pop() {
                collected_audio.extend(chunk);
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        collected_audio
    });

    // Wait for the duration
    tokio::time::sleep(duration).await;

    // Signal the recording to stop
    is_running.store(false, Ordering::Relaxed);
    notify.notify_one(); // Notify the audio thread to stop

    // Wait for the audio thread to finish
    if let Err(e) = stream_handle.await {
        error!("Error in audio thread: {:?}", e);
    }

    // Collect the final audio data
    let audio_data = collector_handle.await.unwrap_or_else(|e| {
        error!("Error joining collector thread: {:?}", e);
        Vec::new()
    });

    debug!("Sending audio to audio model");
    if let Err(e) = whisper_sender.send(AudioInput {
        data: Arc::new(audio_data),
        device: audio_device.clone(),
        sample_rate,
        channels,
    }) {
        error!("Failed to send audio to audio model: {}", e);
    }
    debug!("Sent audio to audio model");

    Ok(())
}
