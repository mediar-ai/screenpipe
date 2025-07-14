use std::{collections::HashSet, sync::Arc, time::{Duration, Instant}};
use anyhow::Result;
use tokio::{sync::Mutex, task::JoinHandle, time::sleep};
use tracing::{error, info, warn};

use crate::{
    core::device::{parse_audio_device, AudioDevice},
    device::device_manager::DeviceManager,
};
use super::{AudioManager, AudioManagerStatus, DeviceHealthStatus};
#[cfg(target_os = "macos")]
use super::macos_audio;

lazy_static::lazy_static! {
    pub static ref DEVICE_MONITOR: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);
}

pub async fn start_device_monitor(
    audio_manager: Arc<AudioManager>,
    device_manager: Arc<DeviceManager>,
) -> Result<()> {
    stop_device_monitor().await?;

    *DEVICE_MONITOR.lock().await = Some(tokio::spawn(async move {
        let mut disconnected_devices: HashSet<String> = HashSet::new();
        let mut last_health_check = Instant::now();
        
        loop {
            if audio_manager.status().await == AudioManagerStatus::Running {
                let currently_available_devices = device_manager.devices().await;
                let enabled_devices = audio_manager.enabled_devices().await;
                
                // 1. Reconnect disconnected devices
                for device_name in disconnected_devices.clone() {
                    let device = match parse_audio_device(&device_name) {
                        Ok(device) => device,
                        Err(e) => {
                            error!("Device name {} invalid: {}", device_name, e);
                            continue;
                        }
                    };

                    if audio_manager.start_device(&device).await.is_ok() {
                        disconnected_devices.remove(&device_name);
                        info!("Reconnected device: {}", device_name);
                    }
                }

                // 2. Health checks every 5 minutes
                if last_health_check.elapsed() > Duration::from_secs(300) {
                    for device_name in enabled_devices.iter() {
                        let device = match parse_audio_device(device_name) {
                            Ok(device) => device,
                            Err(e) => {
                                error!("Device name {} invalid: {}", device_name, e);
                                continue;
                            }
                        };
                        
                        match check_device_health(&device, &audio_manager).await {
                            DeviceHealthStatus::Zombie => {
                                warn!("Device {} in zombie state, recovering", device_name);
                                if let Err(e) = audio_manager.hard_reset_device(device_name).await {
                                    error!("Hard reset failed: {}", e);
                                } else {
                                    info!("Device recovered: {}", device_name);
                                }
                            },
                            DeviceHealthStatus::Disconnected => {
                                info!("Device disconnected: {}", device_name);
                                let _ = audio_manager.stop_device(device_name).await;
                                disconnected_devices.insert(device_name.clone());
                            },
                            DeviceHealthStatus::Healthy => {}
                        }
                    }
                    last_health_check = Instant::now();
                }

                // 3. Connection status checks
                for device_name in enabled_devices.iter() {
                    let device = match parse_audio_device(device_name) {
                        Ok(device) => device,
                        Err(e) => {
                            error!("Device name {} invalid: {}", device_name, e);
                            continue;
                        }
                    };

                    if device_manager.is_running(&device) && 
                       !currently_available_devices.contains(&device) 
                    {
                        info!("Device disconnected: {}", device_name);
                        let _ = audio_manager.stop_device(device_name).await;
                        disconnected_devices.insert(device_name.clone());
                    } else {
                        // Auto-start if not running
                        if !device_manager.is_running(&device) &&
                           audio_manager.status().await == AudioManagerStatus::Running &&
                           audio_manager.enabled_devices().await.contains(device_name)
                        {
                            match audio_manager.start_device(&device).await {
                                Ok(()) => info!("Started device: {}", device_name),
                                Err(e) if !e.to_string().contains("already running") => {
                                    error!("Start error: {}", e);
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            sleep(Duration::from_secs(2)).await;
        }
    }));
    Ok(())
}

pub async fn stop_device_monitor() -> Result<()> {
    if let Some(handle) = DEVICE_MONITOR.lock().await.take() {
        handle.abort();
    }
    Ok(())
}

pub async fn check_device_health(
    device: &AudioDevice,
    audio_manager: &Arc<AudioManager>
) -> DeviceHealthStatus {
    // Physical disconnection
    if !audio_manager.contains_device(device).await {
        return DeviceHealthStatus::Disconnected;
    }
    
    // macOS audio flow check
    #[cfg(target_os = "macos")]
    {
        if !macos_audio::is_device_streaming(device.id).await {
            return DeviceHealthStatus::Zombie;
        }
    }
    
    // General activity check
    if !audio_manager.is_device_running(device) {
        return DeviceHealthStatus::Zombie;
    }
    
    DeviceHealthStatus::Healthy
}
