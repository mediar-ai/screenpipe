mod add;
mod auto_destruct;
pub mod chunking;
pub mod cli;
pub mod core;
pub mod filtering;
pub mod pipe_manager;
mod resource_monitor;
mod server;
pub mod text_embeds;
mod video;
pub mod video_cache;
pub mod video_utils;
pub use add::handle_index_command;
pub use auto_destruct::watch_pid;
pub use axum::Json as JsonResponse;
pub use cli::Cli;
pub use core::start_continuous_recording;
pub use pipe_manager::PipeManager;
pub use resource_monitor::{ResourceMonitor, RestartSignal};
pub use screenpipe_core::Language;
pub use server::health_check;
pub use server::AppState;
pub use server::ContentItem;
pub use server::HealthCheckResponse;
pub use server::PaginatedResponse;
pub use server::SCServer;
pub use server::{api_list_monitors, MonitorInfo};
pub use server::{should_hide_content, create_censored_image};
pub use video::VideoCapture;
pub mod embedding;

// Content hiding functionality for tests
pub fn should_hide_content(text: &str, keywords: &[String]) -> bool {
    if keywords.is_empty() {
        return false;
    }
    
    let text_lower = text.to_lowercase();
    keywords.iter().any(|keyword| {
        if keyword.is_empty() {
            false
        } else {
            text_lower.contains(&keyword.to_lowercase())
        }
    })
}

pub fn create_censored_image() -> Option<Vec<u8>> {
    // Create a simple 100x100 black PNG image as censored content
    use image::{ImageBuffer, Rgb, DynamicImage, ImageFormat};
    use std::io::Cursor;
    
    let img = ImageBuffer::from_fn(100, 100, |_x, _y| {
        Rgb([0, 0, 0]) // Black pixel
    });
    
    let dynamic_img = DynamicImage::ImageRgb8(img);
    let mut buf = Cursor::new(Vec::new());
    
    if dynamic_img.write_to(&mut buf, ImageFormat::Png).is_ok() {
        Some(buf.into_inner())
    } else {
        None
    }
}
