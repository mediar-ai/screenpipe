use crate::operator::element::UIElementImpl;
use crate::operator::platforms::AccessibilityEngine;
use crate::operator::{AutomationError, Locator, Selector, UIElement, UIElementAttributes};
use std::fmt::Debug;

pub struct LinuxEngine;

impl LinuxEngine {
    pub fn new(use_background_apps: bool, activate_app: bool) -> Result<Self, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }
}

impl AccessibilityEngine for LinuxEngine {
    fn get_root_element(&self) -> UIElement {
        panic!("Linux implementation is not yet available")
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn get_application_by_name(&self, _name: &str) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn find_element(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn find_elements(
        &self,
        _selector: &Selector,
        _root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }
}

// Placeholder LinuxUIElement that implements UIElementImpl
pub struct LinuxUIElement;

impl Debug for LinuxUIElement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LinuxUIElement").finish()
    }
}

impl UIElementImpl for LinuxUIElement {
    fn object_id(&self) -> usize {
        0
    }

    fn id(&self) -> Option<String> {
        None
    }

    fn role(&self) -> String {
        "".to_string()
    }

    fn attributes(&self) -> UIElementAttributes {
        UIElementAttributes {
            role: "".to_string(),
            label: None,
            value: None,
            description: None,
            properties: std::collections::HashMap::new(),
        }
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn parent(&self) -> Result<Option<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn bounds(&self) -> Result<(f64, f64, f64, f64), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn click(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn double_click(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn right_click(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn hover(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn focus(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn type_text(&self, _text: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn press_key(&self, _key: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn get_text(&self, max_depth: usize) -> Result<String, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn set_value(&self, _value: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn is_enabled(&self) -> Result<bool, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn is_visible(&self) -> Result<bool, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn is_focused(&self) -> Result<bool, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn perform_action(&self, _action: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn create_locator(&self, _selector: Selector) -> Result<Locator, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Linux implementation is not yet available".to_string(),
        ))
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(LinuxUIElement)
    }
}
