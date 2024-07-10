use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use crossbeam::channel::Sender;
use hound::WavSpec;
use log::{error, info};
use serde::Serialize;
use std::fmt;
use std::fs::File;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::{io::BufWriter, thread};

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

    let spec = wav_spec_from_config(&config);
    let writer = hound::WavWriter::create(&output_path, spec)?;
    let writer = Arc::new(Mutex::new(Some(writer)));
    let writer_2 = writer.clone();
    let err_fn = |err| error!("An error occurred on the audio stream: {}", err);

    let stream = match config.sample_format() {
        cpal::SampleFormat::I8 => audio_device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i8, i8>(data, &writer_2),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I16 => audio_device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i16, i16>(data, &writer_2),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I32 => audio_device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i32, i32>(data, &writer_2),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::F32 => audio_device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<f32, f32>(data, &writer_2),
            err_fn,
            None,
        )?,
        sample_format => return Err(anyhow!("Unsupported sample format '{}'", sample_format)),
    };

    stream.play()?;
    info!(
        "Will write an audio file every {} seconds",
        duration.as_secs()
    );

    let start_time = Instant::now();
    let chunk_duration = Duration::from_secs(5); // Adjust as needed
    let mut next_chunk_time = start_time + chunk_duration;

    while start_time.elapsed() < duration {
        let now = Instant::now();

        if now >= next_chunk_time {
            // Stop the stream temporarily
            stream.pause()?;

            {
                let mut writer_guard = writer.lock().unwrap();
                if let Some(writer) = writer_guard.as_mut() {
                    writer.flush()?;

                    // Send the file path to the whisper channel
                    whisper_sender.send(AudioInput {
                        path: output_path.to_str().unwrap().to_string(),
                        device: device_spec.to_string(),
                    })?;
                }
            }

            // Resume the stream
            stream.play()?;
            next_chunk_time = now + chunk_duration;
        }

        thread::sleep(Duration::from_millis(100));
    }

    // Final flush and transcription
    {
        let mut writer_guard = writer.lock().unwrap();
        if let Some(writer) = writer_guard.as_mut() {
            writer.flush()?;

            // Send the file path to the whisper channel
            whisper_sender.send(AudioInput {
                path: output_path.to_str().unwrap().to_string(),
                device: device_spec.to_string(),
            })?;
        }
    }

    Ok(output_path)
}

fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> WavSpec {
    WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate().0 as _,
        bits_per_sample: (config.sample_format().sample_size() * 8) as _,
        sample_format: sample_format(config.sample_format()),
    }
}
type WavWriterHandle = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

fn write_input_data<T, U>(input: &[T], writer: &WavWriterHandle)
where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T>,
{
    if let Ok(mut guard) = writer.try_lock() {
        if let Some(writer) = guard.as_mut() {
            for &sample in input.iter() {
                let sample: U = U::from_sample(sample);
                writer.write_sample(sample).ok();
            }
        }
    }
}

fn sample_format(format: cpal::SampleFormat) -> hound::SampleFormat {
    if format.is_float() {
        hound::SampleFormat::Float
    } else {
        hound::SampleFormat::Int
    }
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
                    device_type: "input".to_string(),
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
