use crate::ui_automation::{AutomationError, Locator, Selector, UIElement};

/// The common trait that all platform-specific engines must implement
pub trait AccessibilityEngine: Send + Sync {
    /// Get the root UI element
    fn get_root_element(&self) -> UIElement;

    /// Get an element by its ID
    fn get_element_by_id(&self, id: &str) -> Result<UIElement, AutomationError>;

    /// Get the currently focused element
    fn get_focused_element(&self) -> Result<UIElement, AutomationError>;

    /// Get all running applications
    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError>;

    /// Get application by name
    fn get_application_by_name(&self, name: &str) -> Result<UIElement, AutomationError>;

    /// Find elements using a selector
    fn find_elements(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError>;
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// Create the appropriate engine for the current platform
pub fn create_engine() -> Result<Box<dyn AccessibilityEngine>, AutomationError> {
    #[cfg(target_os = "macos")]
    {
        return Ok(Box::new(macos::MacOSEngine::new()?));
    }
    #[cfg(target_os = "windows")]
    {
        return Ok(Box::new(windows::WindowsEngine::new()?));
    }
    #[cfg(target_os = "linux")]
    {
        return Ok(Box::new(linux::LinuxEngine::new()?));
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        return Err(AutomationError::UnsupportedPlatform(
            "Current platform is not supported".to_string(),
        ));
    }
}
