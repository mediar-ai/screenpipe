use crate::audio_processing::{audio_frames_to_speech_frames, audio_to_mono, AudioInput};
use crate::vad_engine::VadEngine;
use anyhow::{anyhow, Result};
use chrono::Utc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::StreamError;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use std::{fmt, thread};
use tokio::sync::{broadcast, oneshot};

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

async fn get_device_and_config(
    audio_device: &AudioDevice,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig)> {
    let host = cpal::default_host();

    info!("device: {:?}", audio_device.to_string());

    let is_output_device = audio_device.device_type == DeviceType::Output;
    let is_display = audio_device.to_string().contains("Display");

    let cpal_audio_device = if audio_device.to_string() == "default" {
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
            if is_output_device {
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

    // if output device and windows, using output config
    let config = if is_output_device && !is_display {
        cpal_audio_device.default_output_config()?
    } else {
        cpal_audio_device.default_input_config()?
    };
    Ok((cpal_audio_device, config))
}

pub fn record_and_transcribe(
    audio_stream: Arc<AudioStream>,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    data_dir: Arc<PathBuf>,
) -> Result<tokio::task::JoinHandle<()>> {
    info!(
        "starting continuous recording for {}",
        audio_stream.device.to_string()
    );

    let handle = tokio::spawn(async move {
        let mut receiver = audio_stream.subscribe().await;

        loop {
            info!("waiting for audio segment");
            while let Ok(segment) = receiver.recv().await {
                info!("sending audio segment to audio model");
                let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
                let sanitized_device_name =
                    audio_stream.device.to_string().replace(['/', '\\'], "_");
                let file_path =
                    data_dir.join(format!("{}_{}.mp4", sanitized_device_name, new_file_name));
                let file_path_clone = Arc::new(file_path);

                if let Err(e) = whisper_sender.send(AudioInput {
                    data: Arc::new(vec![segment]),
                    device: audio_stream.device.clone(),
                    sample_rate: audio_stream.device_config.sample_rate().0,
                    channels: audio_stream.device_config.channels(),
                    output_path: file_path_clone,
                }) {
                    error!("failed to send audio to audio model: {}", e);
                }
                info!("sent audio segment to audio model");
            }
        }
    });

    Ok(handle)
}

pub async fn list_audio_devices() -> Result<Vec<AudioDevice>> {
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

    // macos hack using screen capture kit for output devices - does not work well
    #[cfg(target_os = "macos")]
    {
        // !HACK macos is supposed to use special macos feature "display capture"
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

    // add default output device - on macos think of custom virtual devices
    for device in host.output_devices()? {
        if let Ok(name) = device.name() {
            if should_include_output_device(&name) {
                devices.push(AudioDevice::new(name, DeviceType::Output));
            }
        }
    }

    // last, add devices that are listed in .devices() which are not already in the devices vector
    let other_devices = host.devices().unwrap();
    for device in other_devices {
        if !devices.iter().any(|d| d.name == device.name().unwrap())
            && should_include_output_device(&device.name().unwrap())
        {
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
// this should be optional ?
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

pub fn trigger_audio_permission() -> Result<()> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("No default input device found"))?;

    let config = device.default_input_config()?;

    // Attempt to build an input stream, which should trigger the permission request
    let _stream = device.build_input_stream(
        &config.into(),
        |_data: &[f32], _: &cpal::InputCallbackInfo| {
            // Do nothing, we just want to trigger the permission request
        },
        |err| eprintln!("Error in audio stream: {}", err),
        None,
    )?;

    // We don't actually need to start the stream
    // The mere attempt to build it should trigger the permission request

    Ok(())
}

#[derive(Clone, Debug)]
pub struct AudioSegment {
    pub frames: Arc<Vec<f32>>,
    pub speech_frames: Arc<Vec<f32>>,
}

#[derive(Clone)]
pub struct AudioStream {
    pub device: Arc<AudioDevice>,
    pub device_config: cpal::SupportedStreamConfig,
    transmitter: Arc<tokio::sync::broadcast::Sender<AudioSegment>>,
    stream_control: mpsc::Sender<StreamControl>,
    stream_thread: Option<Arc<tokio::sync::Mutex<Option<thread::JoinHandle<()>>>>>,
}

enum StreamControl {
    Stop(oneshot::Sender<()>),
}

impl AudioStream {
    pub async fn from_device(
        device: Arc<AudioDevice>,
        vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    ) -> Result<Self> {
        let (tx, _) = broadcast::channel::<AudioSegment>(1000);
        let tx_clone = tx.clone();
        let (cpal_audio_device, config) = get_device_and_config(&device).await?;
        let channels = config.channels();

        let device_clone = device.clone();
        let device_clone2 = device_clone.clone();
        let config_clone = config.clone();
        let config_clone2 = config_clone.clone();
        let (stream_control_tx, stream_control_rx) = mpsc::channel();
        let stream_control_tx_clone = stream_control_tx.clone();

        let vad_engine_clone = vad_engine.clone();

        let buffer = Arc::new(Mutex::new(Vec::new()));
        let buffer_clone = buffer.clone();

        let stream_thread = Arc::new(tokio::sync::Mutex::new(Some(thread::spawn(move || {
            info!(
                "starting audio capture thread for device: {}",
                device_clone.to_string()
            );
            let device = device_clone;
            let config = config_clone;
            let error_count = Arc::new(AtomicUsize::new(0));
            let error_count_clone = error_count.clone();

            let error_callback = move |err: StreamError| {
                error!("an error occurred on the audio stream: {}", err);
                let count = error_count_clone.fetch_add(1, Ordering::Relaxed);

                if count >= 3 {
                    warn!("exceeded maximum retry attempts, stopping recording");
                    let (tx, _) = oneshot::channel();
                    if let Err(e) = stream_control_tx_clone.send(StreamControl::Stop(tx)) {
                        error!("failed to send stop signal: {}", e);
                    }
                    return;
                }

                // Exponential backoff sleep
                let sleep_duration = Duration::from_millis(100 * 2_u64.pow(count as u32));
                thread::sleep(sleep_duration);
            };

            // TODO: shouldnt we bytemuck::cast_slice(data) ?
            let data_callback = move |data: &[f32], _: &_| {
                let mono = audio_to_mono(data, channels);

                // Add data to buffer
                let mut buffer = buffer_clone.lock().unwrap();
                buffer.extend_from_slice(&mono);

                const CHUNK_DURATION_MS: f32 = 3000.0;
                let buffer_duration_ms =
                    (buffer.len() as f32 / config_clone2.sample_rate().0 as f32) * 1000.0;
                if buffer_duration_ms < CHUNK_DURATION_MS {
                    return;
                }

                // Process with VAD and audio processing
                let mut vad = vad_engine_clone.lock().unwrap();
                if let Ok(Some(speech_frames)) = audio_frames_to_speech_frames(
                    &buffer,
                    device_clone2.clone(),
                    config_clone2.sample_rate().0,
                    &mut *vad,
                ) {
                    // info!("sending speech frames length: {}", speech_frames.len());
                    let speech_segment = AudioSegment {
                        frames: Arc::new(std::mem::take(&mut *buffer)),
                        speech_frames: Arc::new(speech_frames),
                    };
                    let _ = tx.send(speech_segment);
                }

                // Clear the buffer after processing attempt
                buffer.clear();
            };

            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I16 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I32 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I8 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                _ => {
                    error!("unsupported sample format: {}", config.sample_format());
                    return;
                }
            };

            if let Err(e) = stream.play() {
                error!("failed to play stream for {}: {}", device.to_string(), e);
            }

            if let Ok(StreamControl::Stop(response)) = stream_control_rx.recv() {
                info!("stopped recording audio stream");
                stream.pause().ok();
                drop(stream);
                response.send(()).ok();
            }
        }))));

        Ok(AudioStream {
            device,
            device_config: config,
            transmitter: Arc::new(tx_clone),
            stream_control: stream_control_tx,
            stream_thread: Some(stream_thread),
        })
    }

    pub async fn subscribe(&self) -> broadcast::Receiver<AudioSegment> {
        self.transmitter.subscribe()
    }

    pub async fn stop(mut self) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        self.stream_control.send(StreamControl::Stop(tx))?;
        rx.await?;

        if let Some(thread_arc) = self.stream_thread.take() {
            let thread_handle = tokio::task::spawn_blocking(move || {
                let mut thread_guard = thread_arc.blocking_lock();
                if let Some(join_handle) = thread_guard.take() {
                    join_handle
                        .join()
                        .map_err(|_| anyhow!("failed to join stream thread"))
                } else {
                    Ok(())
                }
            });

            thread_handle.await??;
        }

        Ok(())
    }
}
