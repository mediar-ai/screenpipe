use std::sync::Arc;
use image::DynamicImage;
use xcap::{Monitor, Window};

pub async fn capture_all_visible_windows(monitor: Arc<Monitor>) -> Result<Vec<(DynamicImage, String, String, bool)>, Box<dyn std::error::Error>> {
    let windows = Window::all()?;
    let mut captured_images = Vec::new();
    let focused_window = get_focused_window(monitor.clone()).await;

    for window in windows {
        let app_name = window.app_name();
        let window_name = window.title();
        let is_focused = focused_window.as_ref().map_or(false, |fw| fw.id() == window.id());
        if window.current_monitor().id() == monitor.id() 
           && !window.is_minimized()
           && app_name != "Window Server"
           && app_name != "Contexts"
           && !window_name.is_empty() {
            
            let buffer = window.capture_image()?;
            let image = DynamicImage::ImageRgba8(image::ImageBuffer::from_raw(
                buffer.width() as u32,
                buffer.height() as u32,
                buffer.into_raw(),
            ).unwrap());

            captured_images.push((image, app_name.to_string(), window_name.to_string(), is_focused));
        }
    }

    Ok(captured_images)
}

async fn get_focused_window(monitor: Arc<Monitor>) -> Option<Window> {
    Window::all().ok()?.into_iter().find(|w| 
        w.current_monitor().id() == monitor.id() && 
        !w.is_minimized() && 
        w.app_name() != "Window Server" && 
        w.app_name() != "Contexts" && 
        !w.title().is_empty()
    )
}