use anyhow::Result;

// Trait definition
pub trait BrowserUrlDetector {
    fn get_active_url(&self, app_name: &str, process_id: i32) -> Result<Option<String>>;
}

// Factory function
pub fn create_url_detector() -> Box<dyn BrowserUrlDetector> {
    #[cfg(target_os = "macos")]
    return Box::new(MacOSUrlDetector::new());
    
    #[cfg(not(target_os = "macos"))]
    return Box::new(UnsupportedUrlDetector::new());
}

// Unsupported implementation
pub struct UnsupportedUrlDetector;

impl UnsupportedUrlDetector {
    pub fn new() -> Self {
        Self
    }
}

impl BrowserUrlDetector for UnsupportedUrlDetector {
    fn get_active_url(&self, _app_name: &str, _process_id: i32) -> Result<Option<String>> {
        Ok(None)
    }
}

// Re-export MacOS implementation
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacOSUrlDetector; 