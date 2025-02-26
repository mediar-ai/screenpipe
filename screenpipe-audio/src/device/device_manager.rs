use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use crate::core::{
    device::{list_audio_devices, AudioDevice},
    stream::AudioStream,
};
use anyhow::Result;
use dashmap::DashMap;
use tracing::{error, warn};

pub struct DeviceManager {
    devices: Vec<AudioDevice>,
    streams: DashMap<AudioDevice, Arc<AudioStream>>,
    states: DashMap<AudioDevice, Arc<AtomicBool>>,
}

impl DeviceManager {
    pub async fn new() -> Result<Self> {
        let devices = list_audio_devices().await?;

        let streams = DashMap::new();
        let states = DashMap::new();

        Ok(Self {
            devices,
            streams,
            states,
        })
    }

    pub fn devices(&self) -> Vec<AudioDevice> {
        self.devices.clone()
    }

    pub fn device(&self, device_name: &str) -> Option<AudioDevice> {
        self.devices.iter().find(|d| d.name == device_name).cloned()
    }

    pub async fn start_device(&self, device: &AudioDevice) -> Result<()> {
        let is_running = Arc::new(AtomicBool::new(false));
        let stream =
            match AudioStream::from_device(Arc::new(device.clone()), is_running.clone()).await {
                Ok(stream) => stream,
                Err(e) => {
                    return Err(e);
                }
            };
        self.streams.insert(device.clone(), Arc::new(stream));
        self.states.insert(device.clone(), is_running);

        Ok(())
    }

    pub fn stream(&self, device: &AudioDevice) -> Option<Arc<AudioStream>> {
        self.streams.get(device).map(|s| s.value().clone())
    }

    pub fn is_running(&self, device: &AudioDevice) -> bool {
        self.states
            .get(device)
            .map(|s| s.load(Ordering::Relaxed))
            .unwrap_or(false)
    }

    pub fn stop_all_devices(&self) -> Result<()> {
        for device in self.devices.iter() {
            self.stop_device(device)?;
        }

        Ok(())
    }

    pub fn stop_device(&self, device: &AudioDevice) -> Result<()> {
        if let Some(is_running) = self.states.get(device) {
            is_running.store(false, Ordering::Relaxed)
        }

        Ok(())
    }

    pub fn is_running_mut(&self, device: &AudioDevice) -> Option<Arc<AtomicBool>> {
        self.states.get(device).map(|s| s.value().clone())
    }
}
