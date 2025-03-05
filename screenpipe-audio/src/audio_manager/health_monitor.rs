use std::{
    sync::{atomic::Ordering, Arc},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::core::LAST_AUDIO_CAPTURE;

use super::{AudioManager, AudioManagerStatus};
use anyhow::Result;
use tokio::{runtime::Runtime, sync::Mutex, task::JoinHandle, time::sleep};
use tracing::{error, warn};

lazy_static::lazy_static! {
    pub static ref HEALTH_MONITOR: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);
}

pub async fn start_health_monitor(
    audio_manager: Arc<AudioManager>,
    // runtime: Arc<Runtime>,
    grace_period: u64,
) -> Result<()> {
    if HEALTH_MONITOR.lock().await.is_some() {
        return Ok(());
    }

    // let audio_manager_clone = audio_manager.clone();
    *HEALTH_MONITOR.lock().await = Some(tokio::spawn(async move {
        loop {
            if audio_manager.status().await == AudioManagerStatus::Running {
                let current_time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let last_capture = LAST_AUDIO_CAPTURE.load(Ordering::Relaxed);
                let time_difference = current_time - last_capture;

                if time_difference > grace_period {
                    warn!("health check failed. attempting to restart audio manager");

                    if let Err(e) = audio_manager.restart().await {
                        error!("error restarting audio manager: {e}");
                    }
                    LAST_AUDIO_CAPTURE.store(current_time, Ordering::Relaxed);
                }
            }
            sleep(Duration::from_secs(1)).await;
        }
    }));

    Ok(())
}

pub async fn stop_health_monitor() -> Result<()> {
    if let Some(handle) = HEALTH_MONITOR.lock().await.take() {
        handle.abort();
    }

    Ok(())
}
