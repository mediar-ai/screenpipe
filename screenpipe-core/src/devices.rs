use std::fmt;

use anyhow::anyhow;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
pub enum DeviceType {
    Audio(AudioDevice),
    Vision(u32), // monitor_id
}

impl fmt::Display for DeviceType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            DeviceType::Audio(audio_device) => write!(f, "{}", audio_device),
            DeviceType::Vision(monitor_id) => write!(f, "{}", monitor_id),
        }
    }
}
#[derive(Clone, Debug)]
pub struct DeviceControl {
    pub device: DeviceType,
    pub is_running: bool,
    pub is_paused: bool,
}

impl Default for DeviceControl {
    fn default() -> Self {
        Self {
            device: DeviceType::Audio(AudioDevice::new(
                "default".to_string(),
                AudioDeviceType::Input,
            )),
            is_running: false,
            is_paused: false,
        }
    }
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize, Debug, Deserialize)]
pub enum AudioDeviceType {
    Input,
    Output,
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize, Debug)]
pub struct AudioDevice {
    pub name: String,
    pub device_type: AudioDeviceType,
}

impl AudioDevice {
    pub fn new(name: String, device_type: AudioDeviceType) -> Self {
        AudioDevice { name, device_type }
    }

    pub fn from_name(name: &str) -> anyhow::Result<Self> {
        if name.trim().is_empty() {
            return Err(anyhow!("Device name cannot be empty"));
        }

        let (name, device_type) = if name.to_lowercase().ends_with("(input)") {
            (
                name.trim_end_matches("(input)").trim().to_string(),
                AudioDeviceType::Input,
            )
        } else if name.to_lowercase().ends_with("(output)") {
            (
                name.trim_end_matches("(output)").trim().to_string(),
                AudioDeviceType::Output,
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
                AudioDeviceType::Input => "input",
                AudioDeviceType::Output => "output",
            }
        )
    }
}
