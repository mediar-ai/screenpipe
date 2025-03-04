use anyhow::{Error, Result};
use image::DynamicImage;
use std::sync::Arc;
use xcap::Monitor;

#[derive(Clone)]
pub struct SafeMonitor {
    monitor_id: u32,
    monitor_data: Arc<MonitorData>,
}

#[derive(Clone)]
pub struct MonitorData {
    pub width: u32,
    pub height: u32,
    pub name: String,
    pub is_primary: bool,
}

impl SafeMonitor {
    pub fn new(monitor: Monitor) -> Self {
        let monitor_id = monitor.id();
        let monitor_data = Arc::new(MonitorData {
            width: monitor.width(),
            height: monitor.height(),
            name: monitor.name().to_string(),
            is_primary: monitor.is_primary(),
        });

        Self {
            monitor_id,
            monitor_data,
        }
    }

    pub async fn capture_image(&self) -> Result<DynamicImage> {
        let monitor_id = self.monitor_id;

        let image = std::thread::spawn(move || -> Result<DynamicImage> {
            let monitor = Monitor::all()
                .map_err(Error::from)?
                .into_iter()
                .find(|m| m.id() == monitor_id)
                .ok_or_else(|| anyhow::anyhow!("Monitor not found"))?;

            if monitor.width() == 0 || monitor.height() == 0 {
                return Err(anyhow::anyhow!("Invalid monitor dimensions"));
            }

            monitor
                .capture_image()
                .map_err(Error::from)
                .map(DynamicImage::ImageRgba8)
        })
        .join()
        .unwrap()?;

        Ok(image)
    }

    pub fn id(&self) -> u32 {
        self.monitor_id
    }

    pub fn dimensions(&self) -> (u32, u32) {
        (self.monitor_data.width, self.monitor_data.height)
    }

    pub fn name(&self) -> &str {
        &self.monitor_data.name
    }

    pub fn width(&self) -> u32 {
        self.monitor_data.width
    }

    pub fn height(&self) -> u32 {
        self.monitor_data.height
    }

    pub fn is_primary(&self) -> bool {
        self.monitor_data.is_primary
    }

    pub fn get_info(&self) -> MonitorData {
        (*self.monitor_data).clone()
    }
}

pub async fn list_monitors() -> Vec<SafeMonitor> {
    tokio::task::spawn_blocking(|| {
        Monitor::all()
            .unwrap()
            .into_iter()
            .map(SafeMonitor::new)
            .collect()
    })
    .await
    .unwrap()
}

pub async fn get_default_monitor() -> SafeMonitor {
    tokio::task::spawn_blocking(|| {
        SafeMonitor::new(Monitor::all().unwrap().first().unwrap().clone())
    })
    .await
    .unwrap()
}

pub async fn get_monitor_by_id(id: u32) -> Option<SafeMonitor> {
    tokio::task::spawn_blocking(move || {
        Monitor::all()
            .unwrap()
            .into_iter()
            .find(|m| m.id() == id)
            .map(SafeMonitor::new)
    })
    .await
    .unwrap()
}
