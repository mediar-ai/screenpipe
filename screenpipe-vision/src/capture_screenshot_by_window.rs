use image::DynamicImage;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::error::Error;
use std::fmt;
use tracing::error;

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
        "Control Center",
        "Dock",
        "Notification Center",
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

// List of transparent window titles that should not be considered for occlusion
static TRANSPARENT_WINDOWS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Loom Control Menu",
        "Loom Camera",
        "CleanShot X",
    ])
});

#[derive(Debug, Clone)]
pub struct CapturedWindow {
    pub image: DynamicImage,
    pub app_name: String,
    pub window_name: String,
    pub process_id: i32,
    pub is_focused: bool,
    pub visible_percentage: f32,
}

#[derive(Debug, Clone, PartialEq)]
struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl WindowBounds {
    fn area(&self) -> u32 {
        self.width * self.height
    }

    fn intersect(&self, other: &WindowBounds) -> Option<WindowBounds> {
        let x1 = self.x.max(other.x);
        let y1 = self.y.max(other.y);
        let x2 = (self.x + self.width as i32).min(other.x + other.width as i32);
        let y2 = (self.y + self.height as i32).min(other.y + other.height as i32);

        if x2 > x1 && y2 > y1 {
            Some(WindowBounds {
                x: x1,
                y: y1,
                width: (x2 - x1) as u32,
                height: (y2 - y1) as u32,
            })
        } else {
            None
        }
    }
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

fn calculate_visible_percentage(
    window_bounds: &WindowBounds,
    all_window_bounds: &[&WindowBounds],
    window_index: usize,
    monitor_bounds: &WindowBounds
) -> f32 {
    // First check if the window is fully within the monitor
    let window_on_screen = match window_bounds.intersect(monitor_bounds) {
        Some(intersection) => intersection,
        None => {
            return 0.0;
        }
    };

    #[cfg(target_os = "macos")]
    {
        // The macOS menu bar height (with some padding)
        const MENU_BAR_HEIGHT: i32 = 37;
        const MENU_BAR_PADDING: i32 = 5;

        let is_at_top = window_bounds.y == monitor_bounds.y;
        let in_menu_bar_area = window_bounds.y + window_bounds.height as i32
            <= monitor_bounds.y + MENU_BAR_HEIGHT + MENU_BAR_PADDING;

        if is_at_top && in_menu_bar_area {
            return 0.0;
        }
    }

    // Calculate how much of the window is on-screen
    let on_screen_percentage = window_on_screen.area() as f32 / window_bounds.area() as f32;

    // Calculate occlusion by other windows
    let mut visible_area = window_on_screen.area();

    for (i, other_bounds) in all_window_bounds.iter().enumerate() {
        if i < window_index {
            if let Some(intersection) = window_on_screen.intersect(other_bounds) {
                visible_area = visible_area.saturating_sub(intersection.area());
            }
        }
    }

    let visible_percentage = (visible_area as f32 / window_bounds.area() as f32) * on_screen_percentage;

    visible_percentage.clamp(0.0, 1.0)
}

pub async fn capture_all_visible_windows(
    monitor: &SafeMonitor,
    window_filters: &WindowFilters,
    capture_unfocused_windows: bool,
) -> Result<Vec<CapturedWindow>, Box<dyn Error>> {
    // Get monitor global coordinates from raw Monitor object
    let monitor_id = monitor.id();
    let raw_monitor = tokio::task::spawn_blocking(move || {
        xcap::Monitor::all()
            .ok()
            .and_then(|monitors| monitors.into_iter().find(|m| m.id().unwrap() == monitor_id))
    })
    .await
    .unwrap_or(None);
    
    // Get monitor bounds with global coordinates if available
    let monitor_bounds = WindowBounds {
        x: raw_monitor
            .as_ref()
            .and_then(|m| m.x().ok())
            .unwrap_or(0),

        y: raw_monitor
            .as_ref()
            .and_then(|m| m.y().ok())
            .unwrap_or(0),

        width: monitor.width(),
        height: monitor.height(),
    };

    // Get all windows first to determine visibility
    let all_windows = Window::all()?;

    if all_windows.is_empty() {
        return Err(Box::new(CaptureError::NoWindows));
    }

    // Extract bounds for all windows to calculate visibility
    let window_bounds: Vec<WindowBounds> = all_windows
        .iter()
        .map(|window| {
            let x = window.x().unwrap_or(0);
            let y = window.y().unwrap_or(0);
            let width = window.width().unwrap_or(0);
            let height = window.height().unwrap_or(0);

            WindowBounds {
                x,
                y,
                width,
                height,
            }
        })
        .collect();

    // Create a list of window titles to track transparent windows
    let transparent_window_indices: HashSet<usize> = all_windows
        .iter()
        .enumerate()
        .filter_map(|(index, window)| {
            let title = window.title().unwrap_or_default();
            if TRANSPARENT_WINDOWS.contains(title.as_str()) {
                Some(index)
            } else {
                None
            }
        })
        .collect();

    // Get windows and immediately extract the data we need
    let windows_data = all_windows
        .into_iter()
        .enumerate()
        .filter_map(|(index, window)| {
            // Extract all necessary data from the window while in the main thread
            let app_name = window.app_name().unwrap_or_default().to_string();
            let title = window.title().unwrap_or_default().to_string();
            let is_focused = window.is_focused().unwrap_or(false);
            let process_id = window.pid().unwrap_or(0);

            // Capture image immediately while we have access to the window
            match window.capture_image() {
                Ok(buffer) => {
                    // Calculate visible percentage, passing the set of transparent window indices
                    let filtered_bounds: Vec<&WindowBounds> = window_bounds.iter()
                        .enumerate()
                        .filter_map(|(i, bounds)| {
                            if !transparent_window_indices.contains(&i) || i == index {
                                Some(bounds)
                            } else {
                                None
                            }
                        })
                        .collect();

                    let visible_percentage = calculate_visible_percentage(
                        &window_bounds[index],
                        &filtered_bounds,
                        filtered_bounds.iter().position(|&b| b == &window_bounds[index]).unwrap_or(0),
                        &monitor_bounds
                    ) as f32;

                    Some((app_name, title, is_focused, buffer, process_id, visible_percentage))
                },
                Err(_) => None,
            }
        })
        .collect::<Vec<_>>();

    let mut all_captured_images = Vec::new();

    // Process the captured data
    for (app_name, window_name, is_focused, buffer, process_id, visible_percentage) in windows_data {
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
                visible_percentage,
            });
        }
    }

    Ok(all_captured_images)
}
