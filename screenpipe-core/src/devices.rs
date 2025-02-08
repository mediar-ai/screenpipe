use std::{collections::HashMap, fmt, str::FromStr};

use anyhow::anyhow;
use serde::{Deserialize, Serialize};
use tokio_stream::Stream;
use tracing::debug;

#[derive(Clone, Debug)]
pub enum DeviceType {
    Audio(AudioDevice),
    Vision(u32), // monitor_id
}

impl DeviceType {
    pub fn is_vision(&self) -> bool {
        matches!(self, DeviceType::Vision(_))
    }

    pub fn is_audio(&self) -> bool {
        matches!(self, DeviceType::Audio(_))
    }
}

impl fmt::Display for DeviceType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            DeviceType::Audio(audio_device) => write!(f, "{}", audio_device),
            DeviceType::Vision(monitor_id) => write!(f, "{}", monitor_id),
        }
    }
}

impl FromStr for DeviceType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Check if it's a monitor ID (vision device)
        if let Ok(monitor_id) = s.parse::<u32>() {
            return Ok(DeviceType::Vision(monitor_id));
        }

        // Otherwise try to parse as audio device
        match AudioDevice::from_name(s) {
            Ok(audio_device) => Ok(DeviceType::Audio(audio_device)),
            Err(e) => Err(anyhow!("Failed to parse device string '{}': {}", s, e)),
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

pub struct DeviceManager {
    sender: tokio::sync::broadcast::Sender<DeviceControl>,
    #[allow(dead_code)]
    _dummy: tokio::sync::broadcast::Receiver<DeviceControl>,
    state_sender: tokio::sync::mpsc::Sender<DeviceStateRequest>,
}

impl Clone for DeviceManager {
    fn clone(&self) -> Self {
        DeviceManager {
            sender: self.sender.clone(),
            _dummy: self.sender.subscribe(),
            state_sender: self.state_sender.clone(),
        }
    }
}

#[derive(Debug)]
enum DeviceStateRequest {
    Get {
        respond_to: tokio::sync::oneshot::Sender<HashMap<String, DeviceControl>>,
    },
    Update(DeviceControl),
    Watch {
        respond_to: tokio::sync::mpsc::Sender<DeviceStateChange>,
    },
}

#[derive(Debug, Clone)]
pub struct DeviceStateChange {
    pub device: String,
    pub control: DeviceControl,
}

impl Default for DeviceManager {
    fn default() -> Self {
        let (sender, dummy_receiver) = tokio::sync::broadcast::channel(32);
        let (state_sender, state_receiver) = tokio::sync::mpsc::channel(32);

        tokio::spawn(async move {
            Self::manage_state(state_receiver).await;
        });

        Self {
            sender,
            _dummy: dummy_receiver,
            state_sender,
        }
    }
}

impl DeviceManager {
    async fn manage_state(mut receiver: tokio::sync::mpsc::Receiver<DeviceStateRequest>) {
        let mut devices = HashMap::new();
        let mut watchers = Vec::new();

        while let Some(req) = receiver.recv().await {
            debug!("received device_state_request: {:?}", req);
            match req {
                DeviceStateRequest::Get { respond_to } => {
                    debug!("sending get request to {} devices", devices.len());
                    let _ = respond_to.send(devices.clone());
                }
                DeviceStateRequest::Update(control) => {
                    let device_id = control.device.to_string();
                    let changed = devices
                        .get(&device_id)
                        .map_or(true, |current| current.is_running != control.is_running);

                    if changed {
                        debug!(
                            "updating device '{}' with new control state: {:?}",
                            device_id, control
                        );
                        debug!("notifying watchers of the change: {:?}", watchers);
                        devices.insert(device_id.clone(), control.clone());

                        // Notify watchers of the change
                        watchers.retain(
                            |watcher: &tokio::sync::mpsc::Sender<DeviceStateChange>| {
                                watcher
                                    .try_send(DeviceStateChange {
                                        device: device_id.clone(),
                                        control: control.clone(),
                                    })
                                    .is_ok()
                            },
                        );
                    }
                }
                DeviceStateRequest::Watch { respond_to } => {
                    debug!("adding a new watcher");
                    watchers.push(respond_to);
                }
            }
        }
    }

    pub async fn get_active_devices(&self) -> HashMap<String, DeviceControl> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.state_sender
            .send(DeviceStateRequest::Get { respond_to: tx })
            .await
            .expect("state manager task has terminated");
        rx.await
            .unwrap_or_default()
            .into_iter()
            .filter(|(_, control)| control.is_running)
            .collect()
    }

    pub async fn watch_devices(&self) -> impl Stream<Item = DeviceStateChange> {
        let (tx, rx) = tokio::sync::mpsc::channel(32);
        self.state_sender
            .send(DeviceStateRequest::Watch { respond_to: tx })
            .await
            .expect("state manager task has terminated");
        tokio_stream::wrappers::ReceiverStream::new(rx)
    }

    pub async fn update_device(&self, control: DeviceControl) -> anyhow::Result<()> {
        self.state_sender
            .send(DeviceStateRequest::Update(control.clone()))
            .await?;
        self.sender.send(control)?;
        Ok(())
    }

    pub async fn shutdown(&self) {
        for device in self.get_active_devices().await.values_mut() {
            device.is_running = false;
            if !self.state_sender.is_closed() {
                self.update_device(device.clone()).await.unwrap();
            }
        }
    }
}
