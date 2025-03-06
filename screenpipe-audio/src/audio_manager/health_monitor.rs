// use std::{
//     sync::{atomic::Ordering, Arc},
//     time::{Duration, SystemTime, UNIX_EPOCH},
// };

// use crate::{core::LAST_AUDIO_CAPTURE, device::device_manager::DeviceManager};

// use super::{AudioManager, AudioManagerStatus};
use anyhow::Result;
// use tokio::{sync::Mutex, task::JoinHandle, time::sleep};
use tokio::{sync::Mutex, task::JoinHandle};
// use tracing::{error, warn};

lazy_static::lazy_static! {
    pub static ref HEALTH_MONITOR: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);
}

pub async fn start_health_monitor(// audio_manager: Arc<AudioManager>,
    // grace_period: u64,
) -> Result<()> {
    return Ok(());
    // stop_health_monitor().await?;

    // *HEALTH_MONITOR.lock().await = Some(tokio::spawn(async move {
    //     loop {
    //         if audio_manager.status().await == AudioManagerStatus::Running {
    //             let current_time = SystemTime::now()
    //                 .duration_since(UNIX_EPOCH)
    //                 .unwrap_or_default()
    //                 .as_secs();

    //             let last_capture = LAST_AUDIO_CAPTURE.load(Ordering::Relaxed);
    //             let time_difference = current_time - last_capture;

    //             if time_difference > grace_period && !audio_manager.current_devices().is_empty() {
    //                 warn!("health check failed. attempting to restart audio manager");

    //                 if let Err(e) = audio_manager.stop().await {
    //                     error!("error stopping audio manager: {e}");
    //                 }

    //                 if let Err(e) = audio_manager.start().await {
    //                     error!("error starting audio manager: {e}");
    //                 }
    //                 LAST_AUDIO_CAPTURE.store(current_time, Ordering::Relaxed);
    //             }
    //         }
    //         sleep(Duration::from_secs(1)).await;
    //     }
    // }));

    // Ok(())
}

pub async fn stop_health_monitor() -> Result<()> {
    if let Some(handle) = HEALTH_MONITOR.lock().await.take() {
        handle.abort();
    }

    Ok(())
}

// pub async fn health_monitor_take_2(device_manager: Arc<DeviceManager>) -> Result<()> {
//     Ok(())
// }
