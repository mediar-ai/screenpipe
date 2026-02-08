//! macOS Sleep/Wake Monitor
//!
//! Listens for system sleep and wake events using NSWorkspace notifications.
//! Currently only tracks these events with PostHog analytics to validate
//! the hypothesis that sleep/wake events cause recording degradation.
//!
//! Future work: Trigger component reinitialization on wake events.

use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::time::Duration;
use tracing::debug;
#[cfg(target_os = "macos")]
use tracing::{error, info, warn};

#[cfg(target_os = "macos")]
use crate::analytics::capture_event_nonblocking;
#[cfg(target_os = "macos")]
use serde_json::json;

/// Tracks whether the system is currently in a "post-wake" state
static RECENTLY_WOKE: AtomicBool = AtomicBool::new(false);

/// Returns true if the system recently woke from sleep (within last 30 seconds)
pub fn recently_woke_from_sleep() -> bool {
    RECENTLY_WOKE.load(Ordering::SeqCst)
}

/// Start the sleep/wake monitor on macOS
/// This sets up NSWorkspace notification observers for sleep and wake events.
/// Must be called from within a tokio runtime context so we can capture the handle.
#[cfg(target_os = "macos")]
pub fn start_sleep_monitor() {
    use cidre::ns;

    info!("Starting macOS sleep/wake monitor");

    // Capture the tokio runtime handle BEFORE spawning the monitor thread.
    // The monitor thread runs an NSRunLoop (not a tokio runtime), so bare
    // tokio::spawn() would panic. We pass the handle in so on_did_wake
    // can schedule async health checks back on the real runtime.
    let handle = match tokio::runtime::Handle::try_current() {
        Ok(h) => h,
        Err(e) => {
            error!("Sleep monitor requires a tokio runtime context: {}", e);
            return;
        }
    };

    std::thread::spawn(move || {
        // We need to run this on a thread with a run loop
        // cidre's notification center requires the main run loop or a dedicated one

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // Get the shared workspace - cidre returns Retained<Workspace> directly
            let workspace = ns::Workspace::shared();

            // Get the workspace's notification center
            let mut notification_center: cidre::arc::Retained<ns::NotificationCenter> =
                workspace.notification_center();

            // Subscribe to will_sleep notification
            let will_sleep_name = ns::workspace::notification::will_sleep();
            let _sleep_guard = notification_center.add_observer_guard(
                will_sleep_name,
                None,
                None,
                |_notification| {
                    info!("System is going to sleep");
                    on_will_sleep();
                },
            );

            // Subscribe to did_wake notification
            let did_wake_name = ns::workspace::notification::did_wake();
            let wake_handle = handle.clone();
            let _wake_guard = notification_center.add_observer_guard(
                did_wake_name,
                None,
                None,
                move |_notification| {
                    info!("System woke from sleep");
                    on_did_wake(&wake_handle);
                },
            );

            // Subscribe to screens_did_sleep notification
            let screens_sleep_name = ns::workspace::notification::screens_did_sleep();
            let _screens_sleep_guard = notification_center.add_observer_guard(
                screens_sleep_name,
                None,
                None,
                |_notification| {
                    debug!("Screens went to sleep");
                },
            );

            // Subscribe to screens_did_wake notification
            let screens_wake_name = ns::workspace::notification::screens_did_wake();
            let _screens_wake_guard = notification_center.add_observer_guard(
                screens_wake_name,
                None,
                None,
                |_notification| {
                    debug!("Screens woke up");
                },
            );

            debug!("Sleep/wake notification observers registered successfully");

            // Run the run loop to receive notifications
            // This will block forever, which is fine since we're in a dedicated thread
            ns::RunLoop::current().run();
        }));

        if let Err(e) = result {
            error!("Sleep monitor panicked: {:?}", e);
        }
    });
}

/// Called when system is about to sleep
#[cfg(target_os = "macos")]
fn on_will_sleep() {
    capture_event_nonblocking(
        "system_will_sleep",
        json!({
            "platform": "macos",
        }),
    );
}

/// Called when system wakes from sleep
#[cfg(target_os = "macos")]
fn on_did_wake(handle: &tokio::runtime::Handle) {
    // Mark that we recently woke
    RECENTLY_WOKE.store(true, Ordering::SeqCst);

    // Spawn a task on the captured tokio runtime handle to check recording
    // health after a short delay. We can't use bare tokio::spawn() here
    // because this callback runs on an NSRunLoop thread, not a tokio thread.
    handle.spawn(async {
        // Wait 5 seconds for system to stabilize
        tokio::time::sleep(Duration::from_secs(5)).await;

        // Check if recording is healthy
        let (audio_healthy, vision_healthy) = check_recording_health().await;

        capture_event_nonblocking(
            "system_did_wake",
            json!({
                "platform": "macos",
                "audio_healthy_after_wake": audio_healthy,
                "vision_healthy_after_wake": vision_healthy,
                "check_delay_secs": 5,
            }),
        );

        if !audio_healthy || !vision_healthy {
            warn!(
                "Recording degraded after wake: audio={}, vision={}",
                audio_healthy, vision_healthy
            );
        }

        // Clear the recently woke flag after 30 seconds
        tokio::time::sleep(Duration::from_secs(25)).await;
        RECENTLY_WOKE.store(false, Ordering::SeqCst);
    });
}

/// Check if audio and vision recording are healthy
/// Returns (audio_healthy, vision_healthy)
#[cfg(target_os = "macos")]
async fn check_recording_health() -> (bool, bool) {
    // Try to hit the local health endpoint
    let client = reqwest::Client::new();

    match client
        .get("http://localhost:3030/health")
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            if let Ok(json) = response.json::<serde_json::Value>().await {
                let frame_status = json
                    .get("frame_status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let audio_status = json
                    .get("audio_status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                let vision_healthy = frame_status == "ok" || frame_status == "healthy";
                let audio_healthy = audio_status == "ok" || audio_status == "healthy";

                (audio_healthy, vision_healthy)
            } else {
                (false, false)
            }
        }
        Err(e) => {
            warn!("Failed to check health after wake: {}", e);
            (false, false)
        }
    }
}

/// No-op on non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub fn start_sleep_monitor() {
    debug!("Sleep monitor is only available on macOS");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recently_woke_flag() {
        assert!(!recently_woke_from_sleep());
        RECENTLY_WOKE.store(true, Ordering::SeqCst);
        assert!(recently_woke_from_sleep());
        RECENTLY_WOKE.store(false, Ordering::SeqCst);
        assert!(!recently_woke_from_sleep());
    }
}
