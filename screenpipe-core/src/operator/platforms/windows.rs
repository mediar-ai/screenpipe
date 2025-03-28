use crate::operator::element::UIElementImpl;
use crate::operator::platforms::AccessibilityEngine;
use crate::operator::ClickResult;
use crate::operator::{AutomationError, Locator, Selector, UIElement, UIElementAttributes};
use std::fmt::Debug;
use uiautomation::{UIAutomation, UIElement};
use uiautomation::types::UIProperty::ProcessId;
use uiautomation::variants::Variant;
use uiautomation::{UIAutomation, controls::ControlType};
use uiautomation::types::{UIProperty, TreeScope};

pub struct WindowsEngine {
    automation: UIAutomation,
}

impl WindowsEngine {
    pub fn new(use_background_apps: bool, activate_app: bool) -> Result<Self, AutomationError> {
        let automation = UIAutomation::new().map_err(|e| AutomationError::Internal(e.to_string()))?;
        Ok(Self { automation })
    }
}

impl AccessibilityEngine for WindowsEngine {
    fn get_root_element(&self) -> UIElement {
        let root = self.automation.get_root_element().unwrap();
        UIElement::new(Box::new(WindowsUIElement { element: root }))
    }

    fn get_element_by_id(&self, id: &str) -> Result<UIElement, AutomationError> {
        let root_element = self.automation.get_root_element().unwrap();
        let condition = self.automation.create_property_condition(
            ProcessId, 
            Variant::from(pid as i32),
            None
        ).unwrap();

        let ele = root_element.find_first(TreeScope::Subtree, &condition)
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()));
        Ok(UIElement::new(Box::new(WindowsUIElement { element: ele })))
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        let element = self.automation.get_focused_element()
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        Ok(UIElement::new(Box::new(WindowsUIElement { element })))
    }

    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        unimplemented!()
    }

    fn get_application_by_name(&self, name: &str) -> Result<UIElement, AutomationError> {
        unimplemented!()
    }

    fn find_elements(&self, selector: &Selector, root: Option<&UIElement>) -> Result<Vec<UIElement>, AutomationError> {
        unimplemented!()
    }

    fn find_element(&self, selector: &Selector, root: Option<&UIElement>) -> Result<UIElement, AutomationError> {
        unimplemented!()
    }

    fn open_application(&self, app_name: &str) -> Result<UIElement, AutomationError> {
        unimplemented!()
    }

    fn open_url(&self, url: &str, browser: Option<&str>) -> Result<UIElement, AutomationError> {
        unimplemented!()
    }
}

pub struct WindowsUIElement {
    element: uiautomation::UIElement,
}

impl Debug for WindowsUIElement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsUIElement").finish()
    }
}

impl UIElementImpl for WindowsUIElement {
    fn object_id(&self) -> usize {
        self.element.get_runtime_id().unwrap_or_default().iter().sum()
    }

    fn id(&self) -> Option<String> {
        self.element.get_automation_id().ok()
    }

    fn role(&self) -> String {
        self.element.get_control_type().unwrap_or_default().to_string()
    }

    fn attributes(&self) -> UIElementAttributes {
        UIElementAttributes {
            role: self.role(),
            label: self.element.get_name().ok(),
            value: self.element.get_value().ok(),
            description: self.element.get_help_text().ok(),
            properties: std::collections::HashMap::new(),
        }
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        let children = self.element.find_all_children().map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        Ok(children.into_iter().map(|e| UIElement::new(Box::new(WindowsUIElement { element: e }))).collect())
    }

    fn parent(&self) -> Result<Option<UIElement>, AutomationError> {
        let parent = self.element.get_parent().map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        Ok(parent.map(|e| UIElement::new(Box::new(WindowsUIElement { element: e }))))
    }

    fn bounds(&self) -> Result<(f64, f64, f64, f64), AutomationError> {
        let rect = self.element.get_bounding_rectangle().map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        Ok((rect.left, rect.top, rect.width, rect.height))
    }

    fn click(&self) -> Result<ClickResult, AutomationError> {
        self.element.invoke().map_err(|e| AutomationError::ActionFailed(e.to_string()))?;
        Ok(ClickResult::Success)
    }

    fn double_click(&self) -> Result<ClickResult, AutomationError> {
        unimplemented!()
    }

    fn right_click(&self) -> Result<(), AutomationError> {
        unimplemented!()
    }

    fn hover(&self) -> Result<(), AutomationError> {
        unimplemented!()
    }

    fn focus(&self) -> Result<(), AutomationError> {
        self.element.set_focus().map_err(|e| AutomationError::ActionFailed(e.to_string()))
    }

    fn type_text(&self, text: &str) -> Result<(), AutomationError> {
        self.element.set_value(text).map_err(|e| AutomationError::ActionFailed(e.to_string()))
    }

    fn press_key(&self, key: &str) -> Result<(), AutomationError> {
        unimplemented!()
    }

    fn get_text(&self, max_depth: usize) -> Result<String, AutomationError> {
        self.element.get_name().map_err(|e| AutomationError::ElementNotFound(e.to_string()))
    }

    fn set_value(&self, value: &str) -> Result<(), AutomationError> {
        self.element.set_value(value).map_err(|e| AutomationError::ActionFailed(e.to_string()))
    }

    fn is_enabled(&self) -> Result<bool, AutomationError> {
        self.element.is_enabled().map_err(|e| AutomationError::ElementNotFound(e.to_string()))
    }

    fn is_visible(&self) -> Result<bool, AutomationError> {
        unimplemented!()
    }

    fn is_focused(&self) -> Result<bool, AutomationError> {
        self.element.has_focus().map_err(|e| AutomationError::ElementNotFound(e.to_string()))
    }

    fn perform_action(&self, action: &str) -> Result<(), AutomationError> {
        unimplemented!()
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn create_locator(&self, selector: Selector) -> Result<Locator, AutomationError> {
        unimplemented!()
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(WindowsUIElement { element: self.element.clone() })
    }

    fn scroll(&self, direction: &str, amount: f64) -> Result<(), AutomationError> {
        unimplemented!()
    }
}

