use anyhow::Result;

// Trait definition
pub trait BrowserUrlDetector {
    fn get_active_url(&self, app_name: &str, process_id: i32, window_title: &str) -> Result<Option<String>>;
}

// Factory function
pub fn create_url_detector() -> Box<dyn BrowserUrlDetector> {
    #[cfg(target_os = "macos")]
    return Box::new(MacOSUrlDetector::new());
    
    #[cfg(target_os = "windows")]
    return Box::new(WindowsUrlDetector::new());
    
    #[cfg(target_os = "linux")]
    return Box::new(LinuxUrlDetector::new());
}

// Re-export MacOS implementation
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacOSUrlDetector;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsUrlDetector;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::LinuxUrlDetector;

