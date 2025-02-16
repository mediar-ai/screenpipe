use anyhow::Result;
use image::DynamicImage;
use std::sync::Arc;
use tokio::sync::Mutex;
use xcap::Monitor;

// Thread-safe wrapper around Monitor
#[derive(Clone)]
pub struct SafeMonitor {
    monitor_id: u32,
    // We use Arc<Mutex> since we need to share state between threads
    monitor: Arc<Mutex<Monitor>>,
}

impl SafeMonitor {
    pub fn new(monitor: Monitor) -> Self {
        let monitor_id = monitor.id();
        Self {
            monitor_id,
            monitor: Arc::new(Mutex::new(monitor)),
        }
    }

    pub async fn capture_image(&self) -> Result<DynamicImage> {
        let monitor = self.monitor.lock().await;
        let image = monitor.capture_image()?;
        Ok(image.into())
    }

    pub fn id(&self) -> u32 {
        self.monitor_id
    }

    pub async fn inner(&self) -> tokio::sync::MutexGuard<'_, Monitor> {
        self.monitor.lock().await
    }
}

pub async fn list_monitors() -> Vec<SafeMonitor> {
    Monitor::all()
        .unwrap()
        .into_iter()
        .map(SafeMonitor::new)
        .collect()
}

pub async fn get_default_monitor() -> SafeMonitor {
    SafeMonitor::new(Monitor::all().unwrap().first().unwrap().clone())
}

pub async fn get_monitor_by_id(id: u32) -> Option<SafeMonitor> {
    Monitor::all()
        .unwrap()
        .into_iter()
        .find(|m| m.id() == id)
        .map(SafeMonitor::new)
}
