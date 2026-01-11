use std::{collections::HashSet, sync::Arc, time::Duration};

use anyhow::Result;
use tokio::{sync::Mutex, task::JoinHandle, time::sleep};
use tracing::{error, info, warn};

use crate::{
    core::{device::parse_audio_device, get_device_capture_time},
    device::device_manager::DeviceManager,
};

use super::{AudioManager, AudioManagerStatus};

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
        loop {
            if audio_manager.status().await == AudioManagerStatus::Running {
                let currently_available_devices = device_manager.devices().await;
                let enabled_devices = audio_manager.enabled_devices().await;
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
                    }
                }

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
                        disconnected_devices.insert(device_name.clone());
                    } else {
                        if audio_manager.status().await != AudioManagerStatus::Running {
                            break;
                        }

                        if !audio_manager.enabled_devices().await.contains(device_name) {
                            continue;
                        }

                        match audio_manager.start_device(&device).await {
                            Ok(()) => {
                                // check heartbeat
                                let last_capture = get_device_capture_time(device_name);
                                let now = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs();

                                if now - last_capture > 30 {
                                    warn!(
                                        "Heartbeat failed for device {device_name} (last capture {}s ago). Restarting...",
                                        now - last_capture
                                    );
                                    let _ = audio_manager.stop_device(device_name).await;
                                    let _ = audio_manager.start_device(&device).await;
                                }
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
