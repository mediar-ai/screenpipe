use crate::operator::{AutomationError, Selector, UIElement};

/// The common trait that all platform-specific engines must implement
pub trait AccessibilityEngine: Send + Sync {
    /// Get the root UI element
    fn get_root_element(&self) -> UIElement;

    #[cfg(target_os = "windows")]
    fn get_element_by_id(&self, _id: &str) -> Result<UIElement, AutomationError>;
    /// Get the currently focused element
    fn get_focused_element(&self) -> Result<UIElement, AutomationError>;

    /// Get all running applications
    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError>;

    /// Get application by name
    fn get_application_by_name(&self, name: &str) -> Result<UIElement, AutomationError>;

    /// Find elements using a selector
    fn find_element(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<UIElement, AutomationError>;

    /// Find all elements matching a selector
    /// Default implementation returns an UnsupportedOperation error,
    /// allowing platform-specific implementations to override as needed
    fn find_elements(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError>;

    /// Open an application by name
    fn open_application(&self, app_name: &str) -> Result<UIElement, AutomationError>;

    /// Open a URL in a specified browser (or default if None)
    fn open_url(&self, url: &str, browser: Option<&str>) -> Result<UIElement, AutomationError>;
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "macos")]
pub mod tree_search;
#[cfg(target_os = "windows")]
mod windows;

/// Create the appropriate engine for the current platform
pub fn create_engine(
    use_background_apps: bool,
    activate_app: bool,
) -> Result<Box<dyn AccessibilityEngine>, AutomationError> {
    #[cfg(target_os = "macos")]
    {
        return Ok(Box::new(macos::MacOSEngine::new(
            use_background_apps,
            activate_app,
        )?));
    }
    #[cfg(target_os = "windows")]
    {
        return Ok(Box::new(windows::WindowsEngine::new(
            use_background_apps,
            activate_app,
        )?));
    }
    #[cfg(target_os = "linux")]
    {
        return Ok(Box::new(linux::LinuxEngine::new(
            use_background_apps,
            activate_app,
        )?));
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        return Err(AutomationError::UnsupportedPlatform(
            "Current platform is not supported".to_string(),
        ));
    }
}
