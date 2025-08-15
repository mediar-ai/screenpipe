use crate::core::{
    device::{list_audio_devices, AudioDevice},
    stream::AudioStream,
};
use anyhow::{anyhow, Result};
use dashmap::DashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tracing::{info, warn, error};

pub struct DeviceManager {
    streams: Arc<DashMap<AudioDevice, Arc<AudioStream>>>,
    states: Arc<DashMap<AudioDevice, Arc<AtomicBool>>>,
}

impl DeviceManager {
    pub async fn new() -> Result<Self> {
        let streams = Arc::new(DashMap::new());
        let states = Arc::new(DashMap::new());

        Ok(Self { streams, states })
    }

    pub async fn devices(&self) -> Vec<AudioDevice> {
        list_audio_devices().await.unwrap_or_default()
    }

    pub async fn start_device(&self, device: &AudioDevice) -> Result<()> {
        if !self.devices().await.contains(device) {
            return Err(anyhow!("device {device} not found"));
        }

        if self.is_running(device) {
            return Err(anyhow!("Device {} already running.", device));
        }

        // Try to start with resilience for macOS audio system quirks
        self.start_device_with_retry(device, 3).await
    }

    async fn start_device_with_retry(&self, device: &AudioDevice, max_attempts: u32) -> Result<()> {
        let mut last_error = None;
        
        for attempt in 1..=max_attempts {
            let is_running = Arc::new(AtomicBool::new(false));
            
            match AudioStream::from_device(Arc::new(device.clone()), is_running.clone()).await {
                Ok(stream) => {
                    info!("Starting recording for device: {} (attempt {})", device, attempt);
                    self.streams.insert(device.clone(), Arc::new(stream));
                    self.states.insert(device.clone(), is_running);
                    return Ok(());
                }
                Err(e) => {
                    last_error = Some(anyhow!("{}", e));
                    
                    // Check if this is a retryable error
                    let error_msg = e.to_string().to_lowercase();
                    if error_msg.contains("device not found") 
                        || error_msg.contains("no such device")
                        || error_msg.contains("device is no longer available") {
                        // Device genuinely doesn't exist, don't retry
                        return Err(e);
                    }
                    
                    if attempt < max_attempts {
                        // For potentially temporary issues (audio system busy, driver loading, etc.)
                        let delay = std::time::Duration::from_millis(100 * attempt as u64);
                        warn!("Failed to start device {} (attempt {}): {}. Retrying in {:?}...", 
                              device, attempt, e, delay);
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| anyhow!("Failed to start device after {} attempts", max_attempts)))
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

    pub async fn stop_all_devices(&self) -> Result<()> {
        for pair in self.states.iter() {
            let device = pair.key();
            let _ = self.stop_device(device).await;
        }

        self.states.clear();
        self.streams.clear();

        Ok(())
    }

    pub async fn stop_device(&self, device: &AudioDevice) -> Result<()> {
        if !self.is_running(device) {
            return Err(anyhow!("Device {} already stopped", device));
        }

        info!("Stopping device: {device}");

        if let Some(is_running) = self.states.get(device) {
            is_running.store(false, Ordering::Relaxed)
        }

        if let Some(p) = self.streams.get(device) {
            let _ = p.value().stop().await;
        }

        self.streams.remove(device);

        Ok(())
    }

    /// Check if device is disconnected and attempt reconnection
    pub async fn check_and_reconnect_device(&self, device: &AudioDevice) -> Result<bool> {
        if let Some(stream) = self.stream(device) {
            if stream.is_disconnected() {
                warn!("Device {} is disconnected, attempting reconnection", device);
                
                // Stop the old stream
                let _ = self.stop_device(device).await;
                
                // Try to reconnect
                match self.start_device_with_retry(device, 3).await {
                    Ok(_) => {
                        info!("Successfully reconnected device {}", device);
                        return Ok(true);
                    }
                    Err(e) => {
                        error!("Failed to reconnect device {}: {}", device, e);
                        return Err(e);
                    }
                }
            }
        }
        Ok(false) // Not disconnected or no stream found
    }

    pub fn is_running_mut(&self, device: &AudioDevice) -> Option<Arc<AtomicBool>> {
        self.states.get(device).map(|s| s.value().clone())
    }
}
