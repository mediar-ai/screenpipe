use std::{sync::Arc, time::Duration};

use anyhow::Result;
use tokio::{sync::Mutex, task::JoinHandle, time::sleep};
use tracing::{error, info};

use crate::{core::device::parse_audio_device, device::device_manager::DeviceManager};

use super::{AudioManager, AudioManagerStatus};

lazy_static::lazy_static! {
  pub static ref DEVICE_MONITOR: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);
}

pub async fn start_device_monitor(
    audio_manager: Arc<AudioManager>,
    device_manager: Arc<DeviceManager>,
    enabled_devices: Vec<String>,
) -> Result<()> {
    stop_device_monitor().await?;

    *DEVICE_MONITOR.lock().await = Some(tokio::spawn(async move {
        loop {
            if audio_manager.status().await == AudioManagerStatus::Running {
                let currently_available_devices = device_manager.devices().await;
                for device_name in enabled_devices.iter() {
                    let device = match parse_audio_device(device_name) {
                        Ok(device) => device,
                        Err(e) => {
                            error!("Device name {} invalid: {}", device_name, e);
                            continue;
                        }
                    };

                    if device_manager.is_running(&device)
                        && !currently_available_devices.contains(&device)
                    {
                        info!("Device {device_name} disconnected");
                        let _ = audio_manager.stop_device(device_name).await;
                    } else {
                        if audio_manager.status().await != AudioManagerStatus::Running {
                            continue;
                        }
                        match audio_manager.start_device(&device).await {
                            Ok(()) => {
                                //
                            }
                            Err(e) => {
                                let e_str = e.to_string();
                                if e_str.contains("already running") || e_str.contains("not found")
                                {
                                    continue;
                                }
                                error!("device check error: {e}");
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
