//! Activity monitoring for adaptive FPS capture.
//!
//! This module provides input activity detection using rdev to dynamically
//! adjust capture rates based on user activity (mouse/keyboard events).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info};

/// Tracks input activity to determine optimal capture rate.
///
/// Spawns a background thread that listens for mouse/keyboard events
/// and updates an atomic timestamp. The capture loop can query this
/// to determine if the user is active and adjust FPS accordingly.
pub struct ActivityMonitor {
    last_activity: Arc<AtomicU64>,
    base_interval: Duration,
}

impl ActivityMonitor {
    /// Create a new ActivityMonitor and start listening for input events.
    ///
    /// # Arguments
    /// * `base_interval` - The default capture interval when user is idle
    pub fn new(base_interval: Duration) -> Self {
        let last_activity = Arc::new(AtomicU64::new(current_time_ms()));
        let activity_clone = last_activity.clone();

        // Spawn listener thread (rdev::listen blocks, so needs its own thread)
        std::thread::Builder::new()
            .name("activity-monitor".to_string())
            .spawn(move || {
                info!("Starting input activity monitor");

                let callback = move |event: rdev::Event| {
                    match event.event_type {
                        // Key events - always update
                        rdev::EventType::KeyPress(_) | rdev::EventType::KeyRelease(_) => {
                            activity_clone.store(current_time_ms(), Ordering::Relaxed);
                        }
                        // Mouse button events - always update
                        rdev::EventType::ButtonPress(_) | rdev::EventType::ButtonRelease(_) => {
                            activity_clone.store(current_time_ms(), Ordering::Relaxed);
                        }
                        // Scroll events - always update
                        rdev::EventType::Wheel { .. } => {
                            activity_clone.store(current_time_ms(), Ordering::Relaxed);
                        }
                        // Mouse move - throttle to reduce overhead
                        rdev::EventType::MouseMove { .. } => {
                            let now = current_time_ms();
                            let last = activity_clone.load(Ordering::Relaxed);
                            // Only update if more than 100ms since last activity
                            if now.saturating_sub(last) > 100 {
                                activity_clone.store(now, Ordering::Relaxed);
                            }
                        }
                    }
                };

                if let Err(e) = rdev::listen(callback) {
                    error!("Input activity listener error: {:?}", e);
                }
            })
            .expect("Failed to spawn activity monitor thread");

        Self {
            last_activity,
            base_interval,
        }
    }

    /// Returns the optimal capture interval based on recent activity.
    ///
    /// Activity tiers:
    /// - < 500ms since activity: 200ms interval (5 FPS) - active
    /// - < 2000ms: 500ms interval (2 FPS) - cooling down
    /// - < 5000ms: 1000ms interval (1 FPS) - idle
    /// - > 5000ms: base_interval - deep idle
    pub fn get_interval(&self) -> Duration {
        let now = current_time_ms();
        let last = self.last_activity.load(Ordering::Relaxed);
        let idle_ms = now.saturating_sub(last);

        let interval = if idle_ms < 500 {
            // Active - capture at 5 FPS
            Duration::from_millis(200)
        } else if idle_ms < 2000 {
            // Cooling down - 2 FPS
            Duration::from_millis(500)
        } else if idle_ms < 5000 {
            // Idle - 1 FPS
            Duration::from_millis(1000)
        } else {
            // Deep idle - use base interval
            self.base_interval
        };

        debug!(
            "Activity monitor: idle_ms={}, interval={}ms",
            idle_ms,
            interval.as_millis()
        );

        interval
    }

    /// Returns milliseconds since last detected activity.
    pub fn idle_time_ms(&self) -> u64 {
        let now = current_time_ms();
        let last = self.last_activity.load(Ordering::Relaxed);
        now.saturating_sub(last)
    }

    /// Returns true if user was active in the last N milliseconds.
    pub fn is_active(&self, threshold_ms: u64) -> bool {
        self.idle_time_ms() < threshold_ms
    }
}

/// Get current time in milliseconds since UNIX epoch.
fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_time_ms() {
        let t1 = current_time_ms();
        std::thread::sleep(Duration::from_millis(10));
        let t2 = current_time_ms();
        assert!(t2 > t1);
    }
}
