//! Monitor Watcher - Polls for monitor connect/disconnect events

use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};

use screenpipe_vision::monitor::list_monitors;

use super::manager::{VisionManager, VisionManagerStatus};

static MONITOR_WATCHER: Lazy<Mutex<Option<JoinHandle<()>>>> = Lazy::new(|| Mutex::new(None));

/// Start the monitor watcher that polls for monitor changes
pub async fn start_monitor_watcher(vision_manager: Arc<VisionManager>) -> anyhow::Result<()> {
    // Stop existing watcher if any
    stop_monitor_watcher().await?;

    info!("Starting monitor watcher (polling every 2 seconds)");

    let handle = tokio::spawn(async move {
        // Track monitors that were disconnected (for reconnection detection)
        let mut known_monitors: HashSet<u32> = HashSet::new();

        // Initialize with current monitors
        let initial_monitors = list_monitors().await;
        for monitor in &initial_monitors {
            known_monitors.insert(monitor.id());
        }

        loop {
            // Only poll when running
            if vision_manager.status().await != VisionManagerStatus::Running {
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }

            // Get currently connected monitors
            let current_monitors = list_monitors().await;
            let current_ids: HashSet<u32> = current_monitors.iter().map(|m| m.id()).collect();

            // Get currently recording monitors
            let active_ids: HashSet<u32> =
                vision_manager.active_monitors().await.into_iter().collect();

            // Detect newly connected monitors
            for monitor_id in &current_ids {
                if !active_ids.contains(monitor_id) {
                    if known_monitors.contains(monitor_id) {
                        info!("Monitor {} reconnected, resuming recording", monitor_id);
                    } else {
                        info!("New monitor {} detected, starting recording", monitor_id);
                        known_monitors.insert(*monitor_id);
                    }

                    if let Err(e) = vision_manager.start_monitor(*monitor_id).await {
                        warn!(
                            "Failed to start recording on monitor {}: {:?}",
                            monitor_id, e
                        );
                    }
                }
            }

            // Detect disconnected monitors
            for monitor_id in &active_ids {
                if !current_ids.contains(monitor_id) {
                    info!("Monitor {} disconnected, stopping recording", monitor_id);
                    if let Err(e) = vision_manager.stop_monitor(*monitor_id).await {
                        warn!(
                            "Failed to stop recording on monitor {}: {:?}",
                            monitor_id, e
                        );
                    }
                }
            }

            // Poll every 2 seconds
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });

    *MONITOR_WATCHER.lock().await = Some(handle);

    Ok(())
}

/// Stop the monitor watcher
pub async fn stop_monitor_watcher() -> anyhow::Result<()> {
    if let Some(handle) = MONITOR_WATCHER.lock().await.take() {
        debug!("Stopping monitor watcher");
        handle.abort();
    }
    Ok(())
}
