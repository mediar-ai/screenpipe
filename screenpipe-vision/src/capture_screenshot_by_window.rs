use image::DynamicImage;
use log::error;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::error::Error;
use std::fmt;
use std::time::Duration;
use tokio::time;

#[cfg(target_os = "macos")]
use xcap_macos::{Monitor, Window, XCapError};

#[cfg(not(target_os = "macos"))]
use xcap::{Monitor, Window, XCapError};

#[derive(Debug)]
enum CaptureError {
    NoWindows,
    XCapError(XCapError),
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CaptureError::NoWindows => write!(f, "No windows found"),
            CaptureError::XCapError(e) => write!(f, "XCap error: {}", e),
        }
    }
}

impl Error for CaptureError {}

impl From<XCapError> for CaptureError {
    fn from(error: XCapError) -> Self {
        error!("XCap error occurred: {}", error);
        CaptureError::XCapError(error)
    }
}

// Platform specific skip lists
#[cfg(target_os = "macos")]
static SKIP_APPS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Window Server",
        "SystemUIServer",
        "ControlCenter",
        "Dock",
        "NotificationCenter",
        "loginwindow",
        "WindowManager",
        "Contexts",
        "Screenshot",
    ])
});

#[cfg(target_os = "windows")]
static SKIP_APPS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Windows Shell Experience Host",
        "Microsoft Text Input Application",
        "Windows Explorer",
        "Program Manager",
        "Microsoft Store",
        "Search",
        "TaskBar",
    ])
});

#[cfg(target_os = "linux")]
static SKIP_APPS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Gnome-shell",
        "Plasma",
        "Xfdesktop",
        "Polybar",
        "i3bar",
        "Plank",
        "Dock",
    ])
});

#[cfg(target_os = "macos")]
static SKIP_TITLES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Item-0",
        "App Icon Window",
        "Dock",
        "NowPlaying",
        "FocusModes",
        "Shortcuts",
        "AudioVideoModule",
        "Clock",
        "WiFi",
        "Battery",
        "BentoBox",
        "Menu Bar",
        "Notification Center",
        "Control Center",
        "Spotlight",
        "Mission Control",
        "Desktop",
        "Screen Sharing",
        "Touch Bar",
        "Status Bar",
        "Menu Extra",
        "System Settings",
    ])
});

#[cfg(target_os = "windows")]
static SKIP_TITLES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Program Manager",
        "Windows Input Experience",
        "Microsoft Text Input Application",
        "Task View",
        "Start",
        "System Tray",
        "Notification Area",
        "Action Center",
        "Task Bar",
        "Desktop",
    ])
});

#[cfg(target_os = "linux")]
static SKIP_TITLES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Desktop",
        "Panel",
        "Top Bar",
        "Status Bar",
        "Dock",
        "Dashboard",
        "Activities",
        "System Tray",
        "Notification Area",
    ])
});

#[derive(Debug, Clone)]
pub struct CapturedWindow {
    pub image: DynamicImage,
    pub app_name: String,
    pub window_name: String,
    pub is_focused: bool,
}

pub struct WindowFilters {
    ignore_set: HashSet<String>,
    include_set: HashSet<String>,
}

impl WindowFilters {
    pub fn new(ignore_list: &[String], include_list: &[String]) -> Self {
        Self {
            ignore_set: ignore_list.iter().map(|s| s.to_lowercase()).collect(),
            include_set: include_list.iter().map(|s| s.to_lowercase()).collect(),
        }
    }

    // O(n) - we could figure out a better way to do this
    pub fn is_valid(&self, app_name: &str, title: &str) -> bool {
        let app_name_lower = app_name.to_lowercase();
        let title_lower = title.to_lowercase();

        // If include list is empty, we're done
        if self.include_set.is_empty() {
            return true;
        }

        // Check include list
        if self
            .include_set
            .iter()
            .any(|include| app_name_lower.contains(include) || title_lower.contains(include))
        {
            return true;
        }

        // Check ignore list first (usually smaller)
        if !self.ignore_set.is_empty()
            && self
                .ignore_set
                .iter()
                .any(|ignore| app_name_lower.contains(ignore) || title_lower.contains(ignore))
        {
            return false;
        }

        false
    }
}

pub async fn capture_all_visible_windows(
    monitor: &Monitor,
    window_filters: &WindowFilters,
    capture_unfocused_windows: bool,
) -> Result<Vec<CapturedWindow>, Box<dyn Error>> {
    let mut all_captured_images = Vec::new();

    let windows = retry_with_backoff(
        || {
            let windows = Window::all()?;
            if windows.is_empty() {
                Err(CaptureError::NoWindows)
            } else {
                Ok(windows)
            }
        },
        3,
        Duration::from_millis(500),
    )
    .await?;

    for window in &windows {
        let is_valid = is_valid_window(window, monitor, window_filters, capture_unfocused_windows);

        if !is_valid {
            continue;
        }

        let app_name = window.app_name();
        let window_name = window.title();

        match window.capture_image() {
            Ok(buffer) => {
                let image = DynamicImage::ImageRgba8(
                    image::ImageBuffer::from_raw(
                        buffer.width() as u32,
                        buffer.height() as u32,
                        buffer.into_raw(),
                    )
                    .unwrap(),
                );

                all_captured_images.push(CapturedWindow {
                    image,
                    app_name: app_name.to_string(),
                    window_name: window_name.to_string(),
                    is_focused: is_valid,
                });
            }
            Err(e) => error!(
                "Failed to capture image for window {} on monitor {}: {}",
                window_name,
                monitor.name(),
                e
            ),
        }
    }

    Ok(all_captured_images)
}

pub fn is_valid_window(
    window: &Window,
    monitor: &Monitor,
    filters: &WindowFilters,
    capture_unfocused_windows: bool,
) -> bool {
    if !capture_unfocused_windows {
        // Early returns for simple checks
        #[cfg(target_os = "macos")]
        let is_focused = window.current_monitor().id() == monitor.id() && window.is_focused();

        #[cfg(not(target_os = "macos"))]
        let is_focused = window.current_monitor().id() == monitor.id() && !window.is_minimized();

        if !is_focused {
            return false;
        }
    }

    // Fast O(1) lookups using HashSet
    let app_name = window.app_name();
    let title = window.title();

    if SKIP_APPS.contains(app_name) || SKIP_TITLES.contains(title) {
        return false;
    }

    filters.is_valid(app_name, title)
}

async fn retry_with_backoff<F, T, E>(
    mut f: F,
    max_retries: u32,
    initial_delay: Duration,
) -> Result<T, E>
where
    F: FnMut() -> Result<T, E>,
    E: Error + 'static,
{
    let mut delay = initial_delay;
    for attempt in 1..=max_retries {
        // info!("Attempt {} to execute function", attempt);
        match f() {
            Ok(result) => {
                // info!("Function executed successfully on attempt {}", attempt);
                return Ok(result);
            }
            Err(e) => {
                if attempt == max_retries {
                    error!("All {} attempts failed. Last error: {}", max_retries, e);
                    return Err(e);
                }
                // warn!("Attempt {} failed: {}. Retrying in {:?}", attempt, e, delay);
                time::sleep(delay).await;
                delay *= 2;
            }
        }
    }
    unreachable!()
}
