use image::DynamicImage;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::error::Error;
use std::fmt;
use tracing::debug;

#[cfg(target_os = "macos")]
use sck_rs::{Window, XCapError};

#[cfg(not(target_os = "macos"))]
use xcap::{Window, XCapError};

use crate::browser_utils::create_url_detector;
use crate::monitor::SafeMonitor;
use url::Url;

const BROWSER_NAMES: [&str; 9] = [
    "chrome", "firefox", "safari", "edge", "brave", "arc", "chromium", "vivaldi", "opera",
];

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
        // XCap errors are often expected (system windows, protected content)
        debug!("XCap error occurred: {}", error);
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
        // Apps with overlay windows that frequently fail capture
        "TheBoringNotch",
        "Grammarly Desktop",
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
        // Additional system UI elements from ScreenCaptureKit
        "StatusIndicator",
        "Cursor",
        "Menubar",
        "tracking",
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
    /// Browser URL captured atomically with the screenshot to prevent timing mismatches
    pub browser_url: Option<String>,
    /// Window position and size on screen for coordinate transformation
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: u32,
    pub window_height: u32,
}

pub struct WindowFilters {
    ignore_set: HashSet<String>,
    include_set: HashSet<String>,
    ignored_urls: HashSet<String>,
}

impl WindowFilters {
    pub fn new(ignore_list: &[String], include_list: &[String], ignored_urls: &[String]) -> Self {
        Self {
            ignore_set: ignore_list.iter().map(|s| s.to_lowercase()).collect(),
            include_set: include_list.iter().map(|s| s.to_lowercase()).collect(),
            ignored_urls: ignored_urls.iter().map(|s| s.to_lowercase()).collect(),
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

    /// Check if a URL should be filtered out for privacy
    /// Uses domain-level matching to avoid false positives (e.g., "chase" won't match "purchase.com")
    /// Returns true if the URL is blocked (should be skipped)
    pub fn is_url_blocked(&self, url: &str) -> bool {
        if self.ignored_urls.is_empty() {
            return false;
        }

        // Try to extract the host/domain from the URL for more precise matching
        let url_to_parse = if !url.starts_with("http://") && !url.starts_with("https://") {
            format!("https://{}", url)
        } else {
            url.to_string()
        };

        if let Ok(parsed) = Url::parse(&url_to_parse) {
            if let Some(host) = parsed.host_str() {
                let host_lower = host.to_lowercase();
                // Match against the domain/host specifically
                return self.ignored_urls.iter().any(|blocked| {
                    // Check if blocked pattern matches the host
                    // e.g., "wellsfargo.com" matches "www.wellsfargo.com"
                    // e.g., "chase" matches "chase.com" but NOT "purchase.com"
                    host_lower.contains(blocked) ||
                    host_lower.ends_with(&format!(".{}", blocked)) ||
                    host_lower == *blocked
                });
            }
        }

        // Fallback to simple contains check if URL parsing fails
        let url_lower = url.to_lowercase();
        self.ignored_urls.iter().any(|blocked| url_lower.contains(blocked))
    }

    /// Check if a window title suggests it's a blocked site (fallback for unfocused windows)
    /// This is less precise but catches cases where URL detection isn't available
    pub fn is_title_suggesting_blocked_url(&self, window_title: &str) -> bool {
        if self.ignored_urls.is_empty() {
            return false;
        }

        let title_lower = window_title.to_lowercase();

        // Only match if the pattern appears as a distinct word/brand in the title
        // e.g., "Wells Fargo" in title, or "Chase Bank" in title
        self.ignored_urls.iter().any(|blocked| {
            // Remove TLD for title matching (wellsfargo.com -> wellsfargo)
            let pattern = blocked.trim_end_matches(".com")
                .trim_end_matches(".net")
                .trim_end_matches(".org")
                .trim_end_matches(".bank");

            // Check if it appears as a word boundary match
            // This prevents "chase" from matching "purchased" in title
            let words: Vec<&str> = title_lower.split_whitespace().collect();
            words.iter().any(|word| {
                word.contains(pattern) && word.len() < pattern.len() + 5
            }) || title_lower.contains(&format!("{} ", pattern))
              || title_lower.contains(&format!(" {}", pattern))
              || title_lower.starts_with(pattern)
        })
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
            let app_name = match window.app_name() {
                Ok(name) => name.to_string(),
                Err(e) => {
                    // Log warning and skip this window
                    // mostly noise
                    debug!("Failed to get app_name for window: {}", e);
                    return None;
                }
            };

            let title = match window.title() {
                Ok(title) => title.to_string(),
                Err(e) => {
                    // Expected for some system/overlay windows
                    debug!("Failed to get title for window {}: {}", app_name, e);
                    return None;
                }
            };

            match window.is_minimized() {
                Ok(is_minimized) => {
                    if is_minimized {
                        debug!("Window {} ({}) is_minimized", app_name, title);
                        return None;
                    }
                }
                Err(e) => {
                    // Expected for some system/overlay windows - not a real error
                    debug!("Failed to get is_minimized for window {}: {}", app_name, e);
                }
            };

            let is_focused = match window.is_focused() {
                Ok(focused) => focused,
                Err(e) => {
                    // Expected for overlay/system windows
                    debug!(
                        "Failed to get focus state for window {} ({}): {}",
                        app_name, title, e
                    );
                    return None;
                }
            };

            let process_id = match window.pid() {
                Ok(pid) => pid as i32,
                Err(e) => {
                    // Expected for some protected/system processes
                    debug!(
                        "Failed to get process ID for window {} ({}): {}",
                        app_name, title, e
                    );
                    -1
                }
            };

            // Get window position and size for coordinate transformation
            let (window_x, window_y, window_width, window_height) = (
                window.x().unwrap_or(0),
                window.y().unwrap_or(0),
                window.width().unwrap_or(0),
                window.height().unwrap_or(0),
            );

            // Capture image immediately while we have access to the window
            match window.capture_image() {
                Ok(buffer) => Some((
                    app_name,
                    title,
                    is_focused,
                    buffer,
                    process_id,
                    window_x,
                    window_y,
                    window_width,
                    window_height,
                )),
                Err(e) => {
                    // Expected for overlay windows, protected content, or transparent windows
                    debug!(
                        "Failed to capture image for window {} ({}): {}",
                        app_name, title, e
                    );
                    None
                }
            }
        })
        .collect::<Vec<_>>();

    if windows_data.is_empty() {
        return Err(Box::new(CaptureError::NoWindows));
    }

    // Process the captured data
    for (
        app_name,
        window_name,
        is_focused,
        buffer,
        process_id,
        window_x,
        window_y,
        window_width,
        window_height,
    ) in windows_data
    {
        // Convert to DynamicImage
        let image = DynamicImage::ImageRgba8(
            image::ImageBuffer::from_raw(buffer.width(), buffer.height(), buffer.into_raw())
                .unwrap(),
        );

        // Apply filters
        // Note: Empty window_name/app_name check fixes frame-window mismatch bug where apps like Arc
        // have internal windows with empty titles that create duplicate DB records
        // Also skip system UI elements that have no owning app (empty app_name)
        let is_valid = !SKIP_APPS.contains(app_name.as_str())
            && !app_name.is_empty()
            && !window_name.is_empty()
            && !SKIP_TITLES.contains(window_name.as_str())
            && (capture_unfocused_windows || (is_focused && monitor.id() == monitor.id()))
            && window_filters.is_valid(&app_name, &window_name);

        if is_valid {
            // Fetch browser URL atomically with screenshot for focused browser windows
            // This prevents timing mismatches where URL is fetched after navigation
            let browser_url = if is_focused
                && BROWSER_NAMES
                    .iter()
                    .any(|&browser| app_name.to_lowercase().contains(browser))
            {
                let detector = create_url_detector();
                match detector.get_active_url(&app_name, process_id, &window_name) {
                    Ok(url) => url,
                    Err(e) => {
                        debug!("Failed to get browser URL for {}: {}", app_name, e);
                        None
                    }
                }
            } else {
                None
            };

            // Check if URL should be blocked for privacy (e.g., banking sites)
            if let Some(ref url) = browser_url {
                if window_filters.is_url_blocked(url) {
                    tracing::info!("Privacy filter: Skipping window due to blocked URL: {}", url);
                    continue;
                }
            }

            // Fallback: For unfocused browser windows where we can't get URL,
            // check if window title suggests it's a blocked site
            let is_browser = BROWSER_NAMES
                .iter()
                .any(|&browser| app_name.to_lowercase().contains(browser));

            if is_browser && browser_url.is_none() && !is_focused {
                if window_filters.is_title_suggesting_blocked_url(&window_name) {
                    tracing::info!(
                        "Privacy filter: Skipping unfocused browser window with suspicious title: {}",
                        window_name
                    );
                    continue;
                }
            }

            all_captured_images.push(CapturedWindow {
                image,
                app_name,
                window_name,
                process_id,
                is_focused,
                browser_url,
                window_x,
                window_y,
                window_width,
                window_height,
            });
        }
    }

    Ok(all_captured_images)
}
