use std::sync::Arc;
use image::DynamicImage;
// use image::{DynamicImage, ImageFormat};
use xcap::{Monitor, Window, XCapError};
use log::error;
// use log::{debug, error, info, warn};
use std::time::Duration;
use tokio::time;
use std::error::Error;
use std::fmt;
// use std::fs;
// use std::path::Path;

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

pub async fn capture_all_visible_windows() -> Result<Vec<(DynamicImage, String, String, bool)>, Box<dyn Error>> {
    let monitors = Monitor::all()?;
    // info!("Found {} monitors", monitors.len());

    let mut all_captured_images = Vec::new();

    for monitor in monitors {
        // debug!("Capturing windows for monitor: {:?}", monitor);

        // info!("Attempting to get all windows for monitor {} with retry mechanism", monitor.name());
        let windows = retry_with_backoff(|| {
            let windows = Window::all()?;
            if windows.is_empty() {
                Err(CaptureError::NoWindows)
            } else {
                Ok(windows)
            }
        }, 3, Duration::from_millis(500)).await?;

        // let windows_count = windows.len();
        // info!("Successfully retrieved {} windows for monitor {}", windows_count, monitor.name());

        // if windows_count == 0 {
        //     warn!("No windows were retrieved for monitor {}. This might indicate an issue.", monitor.name());
        // }

        let focused_window = get_focused_window(Arc::new(monitor.clone())).await;

        // Create 'last_screenshots' directory if it doesn't exist
        // let screenshots_dir = Path::new("last_screenshots");
        // fs::create_dir_all(screenshots_dir)?;

        for (_index, window) in windows.into_iter().enumerate() {
            if is_valid_window(&window, &monitor) {
                let app_name = window.app_name();
                let window_name = window.title();
                let is_focused = focused_window.as_ref().map_or(false, |fw| fw.id() == window.id());
                
                match window.capture_image() {
                    Ok(buffer) => {
                        let image = DynamicImage::ImageRgba8(image::ImageBuffer::from_raw(
                            buffer.width() as u32,
                            buffer.height() as u32,
                            buffer.into_raw(),
                        ).unwrap());

                        // Save the image to the 'last_screenshots' directory
                        // let file_name = format!("monitor_{}_window_{:03}_{}.png", 
                        //     sanitize_filename(&monitor.name()), index, sanitize_filename(&window_name));
                        // let file_path = screenshots_dir.join(file_name);
                        // image.save_with_format(&file_path, ImageFormat::Png)?;
                        // info!("Saved screenshot: {:?}", file_path);

                        all_captured_images.push((image, app_name.to_string(), window_name.to_string(), is_focused));
                    },
                    Err(e) => error!("Failed to capture image for window {} on monitor {}: {}", window_name, monitor.name(), e),
                }
            } else {
                // debug!("Skipped invalid window: {} on monitor {}", window.title(), monitor.name());
            }
        }

        // info!("Captured {} valid windows out of {} total windows for monitor {}", 
        //     all_captured_images.len(), windows_count, monitor.name());
    }

    Ok(all_captured_images)
}

// fn sanitize_filename(name: &str) -> String {
//     name.chars()
//         .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
//         .collect()
// }

fn is_valid_window(window: &Window, monitor: &Monitor) -> bool {
    let monitor_match = window.current_monitor().id() == monitor.id();
    let not_minimized = !window.is_minimized();
    let not_window_server = window.app_name() != "Window Server";
    let not_contexts = window.app_name() != "Contexts";
    let has_title = !window.title().is_empty();

    let valid = monitor_match && not_minimized && not_window_server && not_contexts && has_title;

    // if !valid {
    //     debug!("Invalid window on monitor {}: {} (app: {}). Reasons: monitor_match={}, not_minimized={}, not_window_server={}, not_contexts={}, has_title={}",
    //            monitor.name(), window.title(), window.app_name(), monitor_match, not_minimized, not_window_server, not_contexts, has_title);
    // }

    valid
}

async fn retry_with_backoff<F, T, E>(mut f: F, max_retries: u32, initial_delay: Duration) -> Result<T, E>
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
            },
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

async fn get_focused_window(monitor: Arc<Monitor>) -> Option<Window> {
    retry_with_backoff(|| -> Result<Option<Window>, CaptureError> {
        let windows = Window::all()?;
        Ok(windows.into_iter().find(|w| is_valid_window(w, &monitor)))
    }, 3, Duration::from_millis(500)).await.ok().flatten()
}