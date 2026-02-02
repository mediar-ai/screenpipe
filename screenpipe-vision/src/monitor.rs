use anyhow::{Error, Result};
use image::DynamicImage;
use std::sync::Arc;
use tracing;

// On macOS, we have both sck-rs (for 12.3+) and xcap (fallback for older versions)
#[cfg(target_os = "macos")]
use sck_rs::Monitor as SckMonitor;

// xcap is used on non-macOS platforms, and as fallback on older macOS
use xcap::Monitor as XcapMonitor;

#[derive(Clone)]
pub struct SafeMonitor {
    monitor_id: u32,
    monitor_data: Arc<MonitorData>,
    #[cfg(target_os = "macos")]
    use_sck: bool,
}

#[derive(Clone)]
pub struct MonitorData {
    pub width: u32,
    pub height: u32,
    pub name: String,
    pub is_primary: bool,
}

// macOS version detection for runtime fallback
#[cfg(target_os = "macos")]
pub mod macos_version {
    use once_cell::sync::Lazy;
    use std::process::Command;

    /// Cached macOS version (major, minor)
    pub static MACOS_VERSION: Lazy<(u32, u32)> = Lazy::new(|| {
        get_macos_version().unwrap_or((0, 0))
    });

    /// Check if we should use sck-rs (requires macOS 12.3+)
    pub fn use_sck_rs() -> bool {
        let (major, minor) = *MACOS_VERSION;
        major > 12 || (major == 12 && minor >= 3)
    }

    fn get_macos_version() -> Option<(u32, u32)> {
        // Use sw_vers to get macOS version
        let output = Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()?;
        
        let version_str = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = version_str.trim().split('.').collect();
        
        let major: u32 = parts.get(0)?.parse().ok()?;
        let minor: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        
        tracing::info!("Detected macOS version: {}.{}", major, minor);
        Some((major, minor))
    }
}

#[cfg(target_os = "macos")]
use macos_version::use_sck_rs;

impl SafeMonitor {
    // macOS: Create from sck-rs monitor
    #[cfg(target_os = "macos")]
    pub fn from_sck(monitor: SckMonitor) -> Self {
        let monitor_id = monitor.id();
        let monitor_data = Arc::new(MonitorData {
            width: monitor.width().unwrap_or(0),
            height: monitor.height().unwrap_or(0),
            name: monitor.name().to_string(),
            is_primary: monitor.is_primary(),
        });

        Self {
            monitor_id,
            monitor_data,
            use_sck: true,
        }
    }

    // macOS: Create from xcap monitor (fallback)
    #[cfg(target_os = "macos")]
    pub fn from_xcap(monitor: XcapMonitor) -> Self {
        let monitor_id = monitor.id().unwrap_or(0);
        let monitor_data = Arc::new(MonitorData {
            width: monitor.width().unwrap_or(0),
            height: monitor.height().unwrap_or(0),
            name: monitor.name().unwrap_or_default().to_string(),
            is_primary: monitor.is_primary().unwrap_or(false),
        });

        Self {
            monitor_id,
            monitor_data,
            use_sck: false,
        }
    }

    // Non-macOS: Create from xcap monitor
    #[cfg(not(target_os = "macos"))]
    pub fn new(monitor: XcapMonitor) -> Self {
        let monitor_id = monitor.id().unwrap();
        let monitor_data = Arc::new(MonitorData {
            width: monitor.width().unwrap(),
            height: monitor.height().unwrap(),
            name: monitor.name().unwrap().to_string(),
            is_primary: monitor.is_primary().unwrap(),
        });

        Self {
            monitor_id,
            monitor_data,
        }
    }

    #[cfg(target_os = "macos")]
    pub async fn capture_image(&self) -> Result<DynamicImage> {
        let monitor_id = self.monitor_id;
        let use_sck = self.use_sck;

        let image = std::thread::spawn(move || -> Result<DynamicImage> {
            if use_sck {
                // Use sck-rs (ScreenCaptureKit)
                let monitor = SckMonitor::all()
                    .map_err(Error::from)?
                    .into_iter()
                    .find(|m| m.id() == monitor_id)
                    .ok_or_else(|| anyhow::anyhow!("Monitor not found"))?;

                if monitor.width().unwrap_or(0) == 0 || monitor.height().unwrap_or(0) == 0 {
                    return Err(anyhow::anyhow!("Invalid monitor dimensions"));
                }

                monitor
                    .capture_image()
                    .map_err(|e| anyhow::anyhow!("{}", e))
                    .map(DynamicImage::ImageRgba8)
            } else {
                // Use xcap (fallback for older macOS)
                let monitor = XcapMonitor::all()
                    .map_err(Error::from)?
                    .into_iter()
                    .find(|m| m.id().unwrap_or(0) == monitor_id)
                    .ok_or_else(|| anyhow::anyhow!("Monitor not found"))?;

                if monitor.width().unwrap_or(0) == 0 || monitor.height().unwrap_or(0) == 0 {
                    return Err(anyhow::anyhow!("Invalid monitor dimensions"));
                }

                monitor
                    .capture_image()
                    .map_err(Error::from)
                    .map(DynamicImage::ImageRgba8)
            }
        })
        .join()
        .unwrap()?;

        Ok(image)
    }

    #[cfg(not(target_os = "macos"))]
    pub async fn capture_image(&self) -> Result<DynamicImage> {
        let monitor_id = self.monitor_id;

        let image = std::thread::spawn(move || -> Result<DynamicImage> {
            let monitor = XcapMonitor::all()
                .map_err(Error::from)?
                .into_iter()
                .find(|m| m.id().unwrap() == monitor_id)
                .ok_or_else(|| anyhow::anyhow!("Monitor not found"))?;

            if monitor.width().unwrap() == 0 || monitor.height().unwrap() == 0 {
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

#[cfg(target_os = "macos")]
pub async fn list_monitors() -> Vec<SafeMonitor> {
    tokio::task::spawn_blocking(|| {
        if use_sck_rs() {
            tracing::debug!("Using sck-rs for screen capture (macOS 12.3+)");
            SckMonitor::all()
                .unwrap_or_default()
                .into_iter()
                .map(SafeMonitor::from_sck)
                .collect()
        } else {
            tracing::info!("Using xcap fallback for screen capture (macOS < 12.3)");
            XcapMonitor::all()
                .unwrap_or_default()
                .into_iter()
                .map(SafeMonitor::from_xcap)
                .collect()
        }
    })
    .await
    .unwrap()
}

#[cfg(not(target_os = "macos"))]
pub async fn list_monitors() -> Vec<SafeMonitor> {
    tokio::task::spawn_blocking(|| {
        XcapMonitor::all()
            .unwrap()
            .into_iter()
            .map(SafeMonitor::new)
            .collect()
    })
    .await
    .unwrap()
}

#[cfg(target_os = "macos")]
pub async fn get_default_monitor() -> SafeMonitor {
    tokio::task::spawn_blocking(|| {
        if use_sck_rs() {
            SafeMonitor::from_sck(SckMonitor::all().unwrap().first().unwrap().clone())
        } else {
            SafeMonitor::from_xcap(XcapMonitor::all().unwrap().first().unwrap().clone())
        }
    })
    .await
    .unwrap()
}

#[cfg(not(target_os = "macos"))]
pub async fn get_default_monitor() -> SafeMonitor {
    tokio::task::spawn_blocking(|| {
        SafeMonitor::new(XcapMonitor::all().unwrap().first().unwrap().clone())
    })
    .await
    .unwrap()
}

#[cfg(target_os = "macos")]
pub async fn get_monitor_by_id(id: u32) -> Option<SafeMonitor> {
    tokio::task::spawn_blocking(move || {
        if use_sck_rs() {
            match SckMonitor::all() {
                Ok(monitors) => {
                    let monitor_count = monitors.len();
                    let monitor_ids: Vec<u32> = monitors.iter().map(|m| m.id()).collect();

                    tracing::debug!(
                        "Found {} monitors with IDs: {:?} (using sck-rs)",
                        monitor_count,
                        monitor_ids
                    );

                    monitors
                        .into_iter()
                        .find(|m| m.id() == id)
                        .map(SafeMonitor::from_sck)
                }
                Err(e) => {
                    tracing::error!("Failed to list monitors with sck-rs: {}", e);
                    None
                }
            }
        } else {
            match XcapMonitor::all() {
                Ok(monitors) => {
                    let monitor_count = monitors.len();
                    let monitor_ids: Vec<u32> = monitors.iter().filter_map(|m| m.id().ok()).collect();

                    tracing::debug!(
                        "Found {} monitors with IDs: {:?} (using xcap fallback)",
                        monitor_count,
                        monitor_ids
                    );

                    monitors
                        .into_iter()
                        .find(|m| m.id().unwrap_or(0) == id)
                        .map(SafeMonitor::from_xcap)
                }
                Err(e) => {
                    tracing::error!("Failed to list monitors with xcap: {}", e);
                    None
                }
            }
        }
    })
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Task to get monitor by ID {} panicked: {}", id, e);
        None
    })
}

#[cfg(not(target_os = "macos"))]
pub async fn get_monitor_by_id(id: u32) -> Option<SafeMonitor> {
    tokio::task::spawn_blocking(move || match XcapMonitor::all() {
        Ok(monitors) => {
            let monitor_count = monitors.len();
            let monitor_ids: Vec<u32> = monitors.iter().map(|m| m.id().unwrap()).collect();

            tracing::debug!(
                "Found {} monitors with IDs: {:?}",
                monitor_count,
                monitor_ids
            );

            monitors
                .into_iter()
                .find(|m| m.id().unwrap() == id)
                .map(SafeMonitor::new)
        }
        Err(e) => {
            tracing::error!("Failed to list monitors: {}", e);
            None
        }
    })
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Task to get monitor by ID {} panicked: {}", id, e);
        None
    })
}

/// Check if the current system supports screen capture
#[cfg(target_os = "macos")]
pub fn is_screen_capture_supported() -> bool {
    // xcap works on all macOS versions, so we always have support now
    true
}

#[cfg(not(target_os = "macos"))]
pub fn is_screen_capture_supported() -> bool {
    true
}

/// Get the screen capture backend being used
#[cfg(target_os = "macos")]
pub fn get_capture_backend() -> &'static str {
    if use_sck_rs() {
        "sck-rs (ScreenCaptureKit)"
    } else {
        "xcap (legacy)"
    }
}

#[cfg(not(target_os = "macos"))]
pub fn get_capture_backend() -> &'static str {
    "xcap"
}
