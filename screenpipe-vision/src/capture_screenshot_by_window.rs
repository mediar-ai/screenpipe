use image::DynamicImage;
use log::error;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::error::Error;
use std::fmt;

use xcap::{Window, XCapError};

use crate::monitor::SafeMonitor;

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
    pub process_id: i32,
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
    monitor: &SafeMonitor,
    window_filters: &WindowFilters,
    capture_unfocused_windows: bool,
) -> Result<Vec<CapturedWindow>, Box<dyn Error>> {
    let mut all_captured_images = Vec::new();

    // Get windows and immediately extract the data we need
    let windows_data = Window::all()?
        .into_iter()
        .filter_map(|window| {
            // Extract all necessary data from the window while in the main thread
            let app_name = window.app_name().to_string();
            let title = window.title().to_string();
            let is_focused = window.is_focused();
            let process_id = window.pid();
            // Capture image immediately while we have access to the window
            match window.capture_image() {
                Ok(buffer) => Some((app_name, title, is_focused, buffer, process_id)),
                Err(_) => None,
            }
        })
        .collect::<Vec<_>>();

    if windows_data.is_empty() {
        return Err(Box::new(CaptureError::NoWindows));
    }

    // Process the captured data
    for (app_name, window_name, is_focused, buffer, process_id) in windows_data {
        // Convert to DynamicImage
        let image = DynamicImage::ImageRgba8(
            image::ImageBuffer::from_raw(buffer.width(), buffer.height(), buffer.into_raw())
                .unwrap(),
        );

        // Apply filters
        let is_valid = !SKIP_APPS.contains(app_name.as_str())
            && !SKIP_TITLES.contains(window_name.as_str())
            && (capture_unfocused_windows || (is_focused && monitor.id() == monitor.id()))
            && window_filters.is_valid(&app_name, &window_name);

        if is_valid {
            all_captured_images.push(CapturedWindow {
                image,
                app_name,
                window_name,
                process_id: process_id as i32,
                is_focused,
            });
        }
    }

    Ok(all_captured_images)
}
