#[cfg(not(target_os = "macos"))]
mod non_macos {
    use image::DynamicImage;
    use log::error;
    use std::error::Error;
    use std::fmt;
    use std::sync::Arc;
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
    ) -> Result<Vec<(DynamicImage, String, String, bool)>, Box<dyn Error>> {
        let monitors = Monitor::all()?;
        let mut all_captured_images = Vec::new();

        for monitor in monitors {
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

            let focused_window = get_focused_window(Arc::new(monitor.clone())).await;

            for window in windows {
                if is_valid_window(&window, &monitor) {
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
        }

        Ok(all_captured_images)
    }

    fn is_valid_window(window: &Window, monitor: &Monitor) -> bool {
        let monitor_match = window.current_monitor().id() == monitor.id();
        let not_minimized = !window.is_minimized();
        let not_window_server = window.app_name() != "Window Server";
        let not_contexts = window.app_name() != "Contexts";
        let has_title = !window.title().is_empty();

        monitor_match && not_minimized && not_window_server && not_contexts && has_title
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
            match f() {
                Ok(result) => return Ok(result),
                Err(e) => {
                    if attempt == max_retries {
                        error!("All {} attempts failed. Last error: {}", max_retries, e);
                        return Err(e);
                    }
                    time::sleep(delay).await;
                    delay *= 2;
                }
            }
        }
        unreachable!()
    }

    async fn get_focused_window(monitor: Arc<Monitor>) -> Option<Window> {
        retry_with_backoff(
            || -> Result<Option<Window>, CaptureError> {
                let windows = Window::all()?;
                Ok(windows.into_iter().find(|w| is_valid_window(w, &monitor)))
            },
            3,
            Duration::from_millis(500),
        )
        .await
        .ok()
        .flatten()
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use image::{DynamicImage, ImageBuffer};
    use scap::{
        capturer::{Capturer, Options},
        frame::Frame,
        Target,
    };
    use std::error::Error;

    pub async fn capture_all_visible_windows(
    ) -> Result<Vec<(DynamicImage, String, String, bool)>, Box<dyn Error>> {
        if !scap::is_supported() || !scap::has_permission() {
            return Err("Platform not supported or permission not granted".into());
        }

        let targets = scap::get_all_targets();

        // ! DISGUSTING HACK until we stabilise macos screencap
        let fps = std::env::var("SCREENPIPE_FPS")
            .unwrap_or("1".to_string())
            .parse::<u32>()
            .unwrap();
        let mut captured_windows = Vec::new();

        for target in targets {
            if let Target::Window(window) = target {
                if !window.is_on_screen {
                    continue;
                }
                let options = Options {
                    fps,
                    show_cursor: true,
                    show_highlight: false,
                    output_type: scap::frame::FrameType::BGRAFrame,
                    target: Some(Target::Window(window.clone())),
                    output_resolution: scap::capturer::Resolution::_1080p,
                    crop_area: None,
                    ..Default::default()
                };

                let mut capturer = Capturer::new(options);
                capturer.start_capture();

                if let Ok(frame) = capturer.get_next_frame() {
                    if let Frame::BGRA(bgra_frame) = frame {
                        let image = frame_to_dynamic_image(bgra_frame);
                        captured_windows.push((
                            image,
                            window.owning_application.unwrap_or_default(),
                            window.title,
                            window.is_active,
                        ));
                    }
                }

                capturer.stop_capture();
            }
        }

        Ok(captured_windows)
    }

    fn frame_to_dynamic_image(frame: scap::frame::BGRAFrame) -> DynamicImage {
        let width = frame.width as u32;
        let height = frame.height as u32;
        let buffer = frame.data;

        let image_buffer =
            ImageBuffer::from_raw(width, height, buffer).expect("Failed to create image buffer");

        DynamicImage::ImageRgba8(image_buffer)
    }
}

#[cfg(target_os = "macos")]
pub use macos::capture_all_visible_windows;

#[cfg(not(target_os = "macos"))]
pub use non_macos::capture_all_visible_windows;
