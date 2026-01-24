use std::{fmt, sync::Arc};

use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait};
use oasgen::OaSchema;
use serde::{Deserialize, Serialize};

#[derive(OaSchema, Clone, Debug)]
pub struct DeviceControl {
    pub is_running: bool,
    pub is_paused: bool,
}

#[derive(OaSchema, Clone, Eq, PartialEq, Hash, Serialize, Debug, Deserialize)]
pub enum DeviceType {
    Input,
    Output,
}

impl From<screenpipe_db::DeviceType> for DeviceType {
    fn from(device_type: screenpipe_db::DeviceType) -> Self {
        match device_type {
            screenpipe_db::DeviceType::Input => DeviceType::Input,
            screenpipe_db::DeviceType::Output => DeviceType::Output,
        }
    }
}

impl From<DeviceType> for screenpipe_db::DeviceType {
    fn from(device_type: DeviceType) -> Self {
        match device_type {
            DeviceType::Input => screenpipe_db::DeviceType::Input,
            DeviceType::Output => screenpipe_db::DeviceType::Output,
        }
    }
}

impl From<DeviceType> for Arc<screenpipe_db::DeviceType> {
    fn from(device_type: DeviceType) -> Self {
        Arc::new(match device_type {
            DeviceType::Input => screenpipe_db::DeviceType::Input,
            DeviceType::Output => screenpipe_db::DeviceType::Output,
        })
    }
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize, Debug)]
pub struct AudioDevice {
    pub name: String,
    pub device_type: DeviceType,
}

impl From<screenpipe_db::AudioDevice> for AudioDevice {
    fn from(device: screenpipe_db::AudioDevice) -> Self {
        AudioDevice {
            name: device.name,
            device_type: device.device_type.into(),
        }
    }
}

impl AudioDevice {
    pub fn new(name: String, device_type: DeviceType) -> Self {
        AudioDevice { name, device_type }
    }

    pub fn from_name(name: &str) -> Result<Self> {
        if name.trim().is_empty() {
            return Err(anyhow!("Device name cannot be empty"));
        }

        let (name, device_type) = match name.to_lowercase() {
            n if n.ends_with("(input)") => (
                name.trim_end_matches("(input)").trim().to_string(),
                DeviceType::Input,
            ),
            n if n.ends_with("(output)") => (
                name.trim_end_matches("(output)").trim().to_string(),
                DeviceType::Output,
            ),
            _ => {
                return Err(anyhow!(
                    "Device type (input/output) not specified in the name"
                ))
            }
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


pub async fn get_cpal_device_and_config(
    audio_device: &AudioDevice,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig)> {
    let host = cpal::default_host();
    let is_output_device = audio_device.device_type == DeviceType::Output;
    let device_name = audio_device
        .to_string()
        .replace(" (input)", "")
        .replace(" (output)", "")
        .trim()
        .to_string();

    let cpal_audio_device = if audio_device.to_string() == "default" {
        match audio_device.device_type {
            DeviceType::Input => host.default_input_device(),
            DeviceType::Output => host.default_output_device(),
        }
    } else {
        let devices = match audio_device.device_type {
            DeviceType::Input => host.input_devices()?,
            DeviceType::Output => host.output_devices()?,
        };

        devices.into_iter().find(|x| x.name().map(|y| y == device_name).unwrap_or(false))
    }
    .ok_or_else(|| anyhow!("Audio device not found: {}", device_name))?;

    // Get the configuration based on device type
    // For output devices on macOS 14.2+, we use loopback recording which requires
    // getting the output config (cpal will handle the loopback internally)
    let config = if is_output_device {
        // For loopback recording on macOS, we need the output config
        // cpal 0.17+ handles creating the aggregate device internally
        let configs = cpal_audio_device.supported_output_configs()?;
        let best_config = configs
            .max_by(|a, b| {
                a.max_sample_rate()
                    .cmp(&b.max_sample_rate())
                    .then(a.channels().cmp(&b.channels()))
            })
            .ok_or_else(|| anyhow!("No supported output configurations found"))?;

        best_config.with_sample_rate(best_config.max_sample_rate())
    } else {
        let configs = cpal_audio_device.supported_input_configs()?;
        let best_config = configs
            .max_by(|a, b| {
                a.max_sample_rate()
                    .cmp(&b.max_sample_rate())
                    .then(a.channels().cmp(&b.channels()))
            })
            .ok_or_else(|| anyhow!("No supported input configurations found"))?;

        best_config.with_sample_rate(best_config.max_sample_rate())
    };

    Ok((cpal_audio_device, config))
}

pub async fn list_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    // Add input devices
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

    // Add output devices - on macOS 14.2+ these support loopback recording via cpal 0.17+
    for device in host.output_devices()? {
        if let Ok(name) = device.name() {
            if should_include_output_device(&name) {
                devices.push(AudioDevice::new(name, DeviceType::Output));
            }
        }
    }

    // Add any other devices not already in the list
    if let Ok(other_devices) = host.devices() {
        for device in other_devices {
            if let Ok(name) = device.name() {
                if !devices.iter().any(|d| d.name == name) && should_include_output_device(&name) {
                    // TODO: not sure if it can be input, usually aggregate or multi output
                    devices.push(AudioDevice::new(name, DeviceType::Output));
                }
            }
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

pub async fn default_output_device() -> Result<AudioDevice> {
    // In cpal 0.17+, loopback recording is supported natively on macOS 14.2+
    // Just use the default output device - cpal handles the loopback internally
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| anyhow!("No default output device found"))?;
    Ok(AudioDevice::new(device.name()?, DeviceType::Output))
}
