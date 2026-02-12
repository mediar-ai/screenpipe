use std::{collections::HashSet, sync::Arc, time::Duration};

use anyhow::Result;
use tokio::{sync::Mutex, task::JoinHandle, time::sleep};
use tracing::{debug, error, info, warn};

use crate::{
    core::{
        device::{default_input_device, default_output_device, parse_audio_device, DeviceType},
        get_device_capture_time,
    },
    device::device_manager::DeviceManager,
};

use super::{AudioManager, AudioManagerStatus};

/// If an input device (microphone) hasn't produced audio data for this many
/// seconds, force-restart its stream. Input devices should always produce
/// data (even silence frames), so a gap indicates a stale/dead stream.
const INPUT_STALE_THRESHOLD_SECS: u64 = 60;

/// Output devices (display/system audio via ScreenCaptureKit) may legitimately
/// be silent when nothing is playing. Use a longer threshold.
const OUTPUT_STALE_THRESHOLD_SECS: u64 = 120;

/// Safety-net: force-restart all audio streams every N hours to work around
/// macOS CoreAudio / ScreenCaptureKit sessions that silently degrade over
/// long-running periods (e.g., across sleep/wake cycles).
/// Set to 4 hours — short enough to catch degradation before users notice,
/// long enough to avoid unnecessary churn.
#[cfg(target_os = "macos")]
const FORCE_RESTART_INTERVAL_SECS: u64 = 4 * 60 * 60;

lazy_static::lazy_static! {
  pub static ref DEVICE_MONITOR: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);
}

/// Track the last known system default devices to detect changes
struct SystemDefaultTracker {
    last_input: Option<String>,
    last_output: Option<String>,
}

impl SystemDefaultTracker {
    fn new() -> Self {
        Self {
            last_input: None,
            last_output: None,
        }
    }

    /// Check if system default input device has changed
    fn check_input_changed(&mut self) -> Option<String> {
        let current = default_input_device().ok().map(|d| d.to_string());
        if current != self.last_input {
            let changed = current.clone();
            self.last_input = current;
            changed
        } else {
            None
        }
    }

    /// Check if system default output device has changed
    async fn check_output_changed(&mut self) -> Option<String> {
        let current = default_output_device().await.ok().map(|d| d.to_string());
        if current != self.last_output {
            let changed = current.clone();
            self.last_output = current;
            changed
        } else {
            None
        }
    }
}

pub async fn start_device_monitor(
    audio_manager: Arc<AudioManager>,
    device_manager: Arc<DeviceManager>,
) -> Result<()> {
    stop_device_monitor().await?;

    *DEVICE_MONITOR.lock().await = Some(tokio::spawn(async move {
        let mut disconnected_devices: HashSet<String> = HashSet::new();
        let mut default_tracker = SystemDefaultTracker::new();

        // Initialize tracker with current defaults
        let _ = default_tracker.check_input_changed();
        let _ = default_tracker.check_output_changed().await;

        #[cfg(target_os = "macos")]
        let mut last_force_restart = std::time::Instant::now();

        // macOS sleep/wake detection via time-gap heuristic
        #[cfg(target_os = "macos")]
        let wake_flag = {
            let flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let _handle = crate::core::macos_sleep::spawn_sleep_wake_listener(flag.clone());
            // Keep _handle alive by leaking it (monitor runs for app lifetime)
            std::mem::forget(_handle);
            flag
        };

        loop {
            if audio_manager.status().await == AudioManagerStatus::Running {
                let currently_available_devices = device_manager.devices().await;
                let enabled_devices = audio_manager.enabled_devices().await;

                // --- macOS periodic forced restart safety net ---
                #[cfg(target_os = "macos")]
                {
                    if last_force_restart.elapsed().as_secs() >= FORCE_RESTART_INTERVAL_SECS {
                        info!(
                            "periodic audio restart (every {}h) to prevent macOS stream degradation",
                            FORCE_RESTART_INTERVAL_SECS / 3600
                        );
                        // Restart all active recording devices
                        for device_name in enabled_devices.iter() {
                            if let Ok(device) = parse_audio_device(device_name) {
                                let _ = audio_manager.stop_device(device_name).await;
                                match audio_manager.start_device(&device).await {
                                    Ok(()) => info!("periodic restart succeeded for {}", device_name),
                                    Err(e) => {
                                        error!("periodic restart failed for {}: {}", device_name, e);
                                        disconnected_devices.insert(device_name.clone());
                                    }
                                }
                            }
                        }
                        last_force_restart = std::time::Instant::now();
                        // Skip the rest of this iteration to let streams settle
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                }

                // --- macOS sleep/wake detection: restart all streams after wake ---
                #[cfg(target_os = "macos")]
                {
                    if wake_flag.swap(false, std::sync::atomic::Ordering::Relaxed) {
                        info!("macOS wake detected, restarting all audio streams");
                        // Give macOS audio subsystem a moment to re-initialize
                        sleep(Duration::from_secs(3)).await;
                        for device_name in enabled_devices.iter() {
                            if let Ok(device) = parse_audio_device(device_name) {
                                let _ = audio_manager.stop_device(device_name).await;
                                match audio_manager.start_device(&device).await {
                                    Ok(()) => info!("post-wake restart succeeded for {}", device_name),
                                    Err(e) => {
                                        warn!("post-wake restart failed for {}: {}, will retry", device_name, e);
                                        disconnected_devices.insert(device_name.clone());
                                    }
                                }
                            }
                        }
                        #[cfg(target_os = "macos")]
                        {
                            last_force_restart = std::time::Instant::now();
                        }
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                }

                // --- Health check: detect streams alive but not producing data ---
                {
                    let now_secs = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    for device_name in enabled_devices.iter() {
                        // Skip devices already known to be disconnected
                        if disconnected_devices.contains(device_name) {
                            continue;
                        }

                        let device = match parse_audio_device(device_name) {
                            Ok(d) => d,
                            Err(_) => continue,
                        };

                        // Only check devices that have an active recording handle
                        if !device_manager.is_running(&device) {
                            continue;
                        }

                        let last_capture = get_device_capture_time(device_name);
                        let stale_threshold = match device.device_type {
                            DeviceType::Input => INPUT_STALE_THRESHOLD_SECS,
                            DeviceType::Output => OUTPUT_STALE_THRESHOLD_SECS,
                        };

                        let elapsed = now_secs.saturating_sub(last_capture);
                        if elapsed > stale_threshold {
                            warn!(
                                "device {} has not produced audio for {}s (threshold: {}s), force-restarting",
                                device_name, elapsed, stale_threshold
                            );
                            let _ = audio_manager.cleanup_stale_device(device_name).await;
                            disconnected_devices.insert(device_name.clone());
                        }
                    }
                }

                // Handle "Follow System Default" mode
                if audio_manager.use_system_default_audio().await {
                    // Check if system default input changed
                    if let Some(new_default_input) = default_tracker.check_input_changed() {
                        info!("system default input changed to: {}", new_default_input);

                        // Stop all current input devices
                        for device_name in enabled_devices.iter() {
                            if let Ok(device) = parse_audio_device(device_name) {
                                if device.device_type == DeviceType::Input {
                                    let _ = audio_manager.stop_device(device_name).await;
                                }
                            }
                        }

                        // Start the new default input device
                        if let Ok(new_device) = parse_audio_device(&new_default_input) {
                            match audio_manager.start_device(&new_device).await {
                                Ok(()) => info!(
                                    "switched to new system default input: {}",
                                    new_default_input
                                ),
                                Err(e) => error!(
                                    "failed to start new default input {}: {}",
                                    new_default_input, e
                                ),
                            }
                        }
                    }

                    // Check if system default output changed
                    if let Some(new_default_output) = default_tracker.check_output_changed().await {
                        info!("system default output changed to: {}", new_default_output);

                        // Stop all current output devices
                        for device_name in audio_manager.enabled_devices().await.iter() {
                            if let Ok(device) = parse_audio_device(device_name) {
                                if device.device_type == DeviceType::Output {
                                    let _ = audio_manager.stop_device(device_name).await;
                                }
                            }
                        }

                        // Start the new default output device
                        if let Ok(new_device) = parse_audio_device(&new_default_output) {
                            match audio_manager.start_device(&new_device).await {
                                Ok(()) => info!(
                                    "switched to new system default output: {}",
                                    new_default_output
                                ),
                                Err(e) => error!(
                                    "failed to start new default output {}: {}",
                                    new_default_output, e
                                ),
                            }
                        }
                    }
                }

                // Check for stale recording handles (tasks that have finished/crashed)
                // This handles cases where audio stream was hijacked by another app
                let stale_devices = audio_manager.check_stale_recording_handles().await;
                for device_name in stale_devices {
                    debug!(
                        "detected stale recording handle for {}, cleaning up for restart",
                        device_name
                    );
                    let _ = audio_manager.cleanup_stale_device(&device_name).await;
                    disconnected_devices.insert(device_name);
                }

                for device_name in disconnected_devices.clone() {
                    let device = match parse_audio_device(&device_name) {
                        Ok(device) => device,
                        Err(e) => {
                            error!("Device name {} invalid: {}", device_name, e);
                            continue;
                        }
                    };

                    // In system default mode, try to restart with current default instead
                    if audio_manager.use_system_default_audio().await {
                        let current_default = match device.device_type {
                            DeviceType::Input => default_input_device().ok(),
                            DeviceType::Output => default_output_device().await.ok(),
                        };

                        if let Some(default_device) = current_default {
                            if audio_manager.start_device(&default_device).await.is_ok() {
                                info!("restarted with system default device: {}", default_device);
                                disconnected_devices.remove(&device_name);
                                continue;
                            }
                        }
                    }

                    if audio_manager.start_device(&device).await.is_ok() {
                        info!("successfully restarted device {}", device_name);
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
