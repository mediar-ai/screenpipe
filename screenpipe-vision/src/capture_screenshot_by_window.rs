use image::DynamicImage;
use log::error;
use std::error::Error;
use std::fmt;
use std::time::Duration;
use tokio::time;
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

pub async fn capture_all_visible_windows(
    monitor: &Monitor,
    ignore_list: &[String],
    include_list: &[String],
) -> Result<Vec<(DynamicImage, String, String, bool)>, Box<dyn Error>> {
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

    let focused_window = windows
        .iter()
        .find(|&w| is_valid_window(w, monitor, ignore_list, include_list));

    for window in &windows {
        if is_valid_window(window, monitor, ignore_list, include_list) {
            let app_name = window.app_name();
            let window_name = window.title();
            let is_focused = focused_window
                .as_ref()
                .map_or(false, |fw| fw.id() == window.id());

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

                    all_captured_images.push((
                        image,
                        app_name.to_string(),
                        window_name.to_string(),
                        is_focused,
                    ));
                }
                Err(e) => error!(
                    "Failed to capture image for window {} on monitor {}: {}",
                    window_name,
                    monitor.name(),
                    e
                ),
            }
        }
    }

    Ok(all_captured_images)
}

fn is_valid_window(
    window: &Window,
    monitor: &Monitor,
    ignore_list: &[String],
    include_list: &[String],
) -> bool {
    let monitor_match = window.current_monitor().id() == monitor.id();
    let not_minimized = !window.is_minimized();
    let not_window_server = window.app_name() != "Window Server";
    let not_contexts = window.app_name() != "Contexts";
    let has_title = !window.title().is_empty();
    let included = include_list.is_empty()
        || include_list.iter().any(|include| {
            window
                .app_name()
                .to_lowercase()
                .contains(&include.to_lowercase())
                || window
                    .title()
                    .to_lowercase()
                    .contains(&include.to_lowercase())
        });
    let not_ignored = !ignore_list.iter().any(|ignore| {
        window
            .app_name()
            .to_lowercase()
            .contains(&ignore.to_lowercase())
            || window
                .title()
                .to_lowercase()
                .contains(&ignore.to_lowercase())
    });

    monitor_match
        && not_minimized
        && not_window_server
        && not_contexts
        && has_title
        && not_ignored
        && included
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
