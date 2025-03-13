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

/// Attempts an operation with exponential backoff retry
#[cfg(target_os = "macos")]
async fn with_retry<T, F, Fut>(operation: F, max_retries: usize) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut retries = 0;
    let mut delay_ms = 10; // Start with 10ms delay

    loop {
        match operation().await {
            Ok(value) => return Ok(value),
            Err(e) => {
                if retries >= max_retries {
                    return Err(anyhow!("Max retries reached: {}", e));
                }

                // Add some jitter to prevent synchronized retries
                use rand::{rng, Rng};
                let jitter = rng().random_range(0..=10) as u64;
                let delay = std::time::Duration::from_millis(delay_ms + jitter);

                tracing::warn!(
                    "ScreenCaptureKit host error, retrying in {}ms: {}",
                    delay_ms + jitter,
                    e
                );
                tokio::time::sleep(delay).await;

                retries += 1;
                delay_ms = std::cmp::min(delay_ms * 2, 1000); // Exponential backoff, max 1s
            }
        }
    }
}

/// Gets the ScreenCaptureKit host with retry mechanism
#[cfg(target_os = "macos")]
async fn get_screen_capture_host() -> Result<cpal::Host> {
    // necessary hack because this is unreliable
    with_retry(
        || async {
            cpal::host_from_id(cpal::HostId::ScreenCaptureKit)
                .map_err(|e| anyhow!("Failed to get ScreenCaptureKit host: {}", e))
        },
        3,
    )
    .await
}

pub async fn get_cpal_device_and_config(
    audio_device: &AudioDevice,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig)> {
    let host = cpal::default_host();
    let is_output_device = audio_device.device_type == DeviceType::Output;
    let is_display = audio_device.to_string().contains("Display");
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
        let mut devices = match audio_device.device_type {
            DeviceType::Input => host.input_devices()?,
            DeviceType::Output => host.output_devices()?,
        };

        #[cfg(target_os = "macos")]
        if is_output_device {
            if let Ok(screen_capture_host) = get_screen_capture_host().await {
                devices = screen_capture_host.input_devices()?;
            }
        }

        devices.find(|x| x.name().map(|y| y == device_name).unwrap_or(false))
    }
    .ok_or_else(|| anyhow!("Audio device not found: {}", device_name))?;

    let config = if is_output_device && !is_display {
        cpal_audio_device.default_output_config()?
    } else {
        cpal_audio_device.default_input_config()?
    };

    Ok((cpal_audio_device, config))
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
        if let Ok(screen_capture_host) = get_screen_capture_host().await {
            for device in screen_capture_host.input_devices()? {
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

pub async fn default_output_device() -> Result<AudioDevice> {
    #[cfg(target_os = "macos")]
    {
        // ! see https://github.com/RustAudio/cpal/pull/894
        // Try to get device from ScreenCaptureKit first
        if let Ok(host) = get_screen_capture_host().await {
            if let Some(device) = host.default_input_device() {
                if let Ok(name) = device.name() {
                    return Ok(AudioDevice::new(name, DeviceType::Output));
                }
            }
        }

        // Fall back to default output device
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
        Ok(AudioDevice::new(device.name()?, DeviceType::Output))
    }
}
