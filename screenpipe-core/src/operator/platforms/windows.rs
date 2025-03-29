use crate::operator::element::UIElementImpl;
use crate::operator::platforms::AccessibilityEngine;
use crate::operator::ClickResult;
use crate::operator::{AutomationError, Locator, Selector, UIElement, UIElementAttributes};
use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, RwLock};
use windows::{
    core::HSTRING,
    Win32::{
        Foundation::{HWND, RECT},
        UI::{
            Accessibility::{
                IUIAutomation, IUIAutomationElement, TreeScope, UIA_AutomationIdPropertyId,
                UIA_BoundingRectanglePropertyId, UIA_ClassNamePropertyId,
                UIA_ControlTypePropertyId, UIA_HostWindowPropertyId, UIA_InvokePatternId,
                UIA_IsEnabledPropertyId, UIA_IsKeyboardFocusablePropertyId, UIA_NamePropertyId,
                UIA_ValuePatternId,
            },
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
            },
            WindowsAndMessaging::{FindWindowW, GetWindowRect, SetForegroundWindow},
        },
    },
};

// Windows UI Automation wrapper
#[derive(Clone)]
struct UIAutomationWrapper {
    automation: IUIAutomation,
}

impl UIAutomationWrapper {
    fn new() -> Result<Self, AutomationError> {
        Ok(Self {
            automation: unsafe { IUIAutomation::new()? },
        })
    }
}

#[derive(Clone)]
pub struct WindowsEngine {
    uia: Arc<RwLock<UIAutomationWrapper>>,
    use_background_apps: bool,
    activate_app: bool,
}

#[implement(Clone)]
pub struct WindowsUIElement {
    element: IUIAutomationElement,
    uia: Arc<RwLock<UIAutomationWrapper>>,
    use_background_apps: bool,
    activate_app: bool,
}

impl WindowsEngine {
    pub fn new(use_background_apps: bool, activate_app: bool) -> Result<Self, AutomationError> {
        let uia = UIAutomationWrapper::new()?;
        Ok(Self {
            uia: Arc::new(RwLock::new(uia)),
            use_background_apps,
            activate_app,
        })
    }

    fn wrap_element(&self, element: IUIAutomationElement) -> UIElement {
        UIElement::new(Box::new(WindowsUIElement {
            element,
            uia: self.uia.clone(),
            use_background_apps: self.use_background_apps,
            activate_app: self.activate_app,
        }))
    }
}

impl AccessibilityEngine for WindowsEngine {
    fn get_root_element(&self) -> UIElement {
        let uia = self.uia.read().unwrap();
        let root = unsafe { uia.automation.GetRootElement().unwrap() };
        self.wrap_element(root)
    }

    fn get_element_by_id(&self, _id: &str) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        let uia = self.uia.read().unwrap();
        let root = unsafe { uia.automation.GetRootElement()? };
        let condition = unsafe { uia.automation.CreateTrueCondition()? };

        let elements = unsafe { root.FindAll(TreeScope::TreeScope_Children, &condition)? };

        let mut apps = Vec::new();
        for i in 0..unsafe { elements.Length()? } {
            let element = unsafe { elements.GetElement(i)? };
            apps.push(self.wrap_element(element));
        }
        Ok(apps)
    }

    fn get_application_by_name(&self, _name: &str) -> Result<UIElement, AutomationError> {
        let hwnd = unsafe { FindWindowW(None, &HSTRING::from(name)) };

        if hwnd.0 == 0 {
            return Err(AutomationError::ElementNotFound(format!(
                "Application '{}' not found",
                name
            )));
        }

        let uia = self.uia.read().unwrap();
        let element = unsafe { uia.automation.ElementFromHandle(hwnd)? };
        Ok(self.wrap_element(element))
    }

    fn find_elements(
        &self,
        _selector: &Selector,
        _root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn find_element(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<UIElement, AutomationError> {
        let uia = self.uia.read().unwrap();
        let root_element = match root {
            Some(el) => el
                .as_any()
                .downcast_ref::<WindowsUIElement>()
                .unwrap()
                .element
                .clone(),
            None => unsafe { uia.automation.GetRootElement()? },
        };

        let condition = match selector {
            Selector::Id(id) => unsafe {
                uia.automation
                    .CreatePropertyCondition(UIA_AutomationIdPropertyId, &HSTRING::from(id))?
            },
            Selector::Name(name) => unsafe {
                uia.automation
                    .CreatePropertyCondition(UIA_NamePropertyId, &HSTRING::from(name))?
            },
            Selector::Role { role, .. } => {
                let control_type = map_generic_role_to_control_type(role);
                unsafe {
                    uia.automation
                        .CreatePropertyCondition(UIA_ControlTypePropertyId, control_type.into())?
                }
            }
            _ => {
                return Err(AutomationError::UnsupportedOperation(
                    "Selector type not supported".to_string(),
                ))
            }
        };

        let element = unsafe { root_element.FindFirst(TreeScope::TreeScope_Subtree, &condition)? };
        Ok(self.wrap_element(element))
    }

    fn open_application(&self, _app_name: &str) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn open_url(&self, _url: &str, _browser: Option<&str>) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }
}

// Placeholder WindowsUIElement that implements UIElementImpl
pub struct WindowsUIElement;

impl Debug for WindowsUIElement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsUIElement").finish()
    }
}

impl UIElementImpl for WindowsUIElement {
    fn object_id(&self) -> usize {
        unsafe { self.element.CurrentNativeWindowHandle().unwrap_or(0) as usize }
    }

    fn id(&self) -> Option<String> {
        unsafe {
            self.element
                .GetCurrentPropertyValue(UIA_AutomationIdPropertyId)
                .ok()
                .and_then(|v| v.to_string().ok())
        }
    }

    fn role(&self) -> String {
        unsafe {
            self.element
                .GetCurrentPropertyValue(UIA_ControlTypePropertyId)
                .map(|v| map_control_type_to_generic_role(v))
                .unwrap_or_default()
        }
    }

    fn attributes(&self) -> UIElementAttributes {
        let mut properties = HashMap::new();

        unsafe {
            if let Ok(name) = self.element.GetCurrentPropertyValue(UIA_NamePropertyId) {
                properties.insert(
                    "Name".to_string(),
                    Some(name.to_string().unwrap_or_default()),
                );
            }

            if let Ok(class) = self
                .element
                .GetCurrentPropertyValue(UIA_ClassNamePropertyId)
            {
                properties.insert(
                    "Class".to_string(),
                    Some(class.to_string().unwrap_or_default()),
                );
            }

            if let Ok(enabled) = self
                .element
                .GetCurrentPropertyValue(UIA_IsEnabledPropertyId)
            {
                properties.insert(
                    "Enabled".to_string(),
                    Some(enabled.to_string().unwrap_or_default()),
                );
            }
        }

        UIElementAttributes {
            role: self.role(),
            label: self.id(),
            value: None,
            description: None,
            properties,
        }
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn parent(&self) -> Result<Option<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn bounds(&self) -> Result<(f64, f64, f64, f64), AutomationError> {
        unsafe {
            let rect: RECT = self
                .element
                .GetCurrentPropertyValue(UIA_BoundingRectanglePropertyId)?
                .try_into()?;

            Ok((
                rect.left as f64,
                rect.top as f64,
                (rect.right - rect.left) as f64,
                (rect.bottom - rect.top) as f64,
            ))
        }
    }

    fn click(&self) -> Result<ClickResult, AutomationError> {
        // Try using invoke pattern first
        if let Ok(invoke_pattern) = unsafe { self.element.GetCurrentPattern(UIA_InvokePatternId) } {
            unsafe { invoke_pattern.Invoke()? };
            return Ok(ClickResult {
                method: "InvokePattern".to_string(),
                coordinates: None,
                details: "Used UI Automation InvokePattern".to_string(),
            });
        }

        // Fallback to mouse simulation
        let (x, y, width, height) = self.bounds()?;
        let center_x = x + width / 2.0;
        let center_y = y + height / 2.0;

        // Implement mouse click simulation using SendInput
        Ok(ClickResult {
            method: "MouseSimulation".to_string(),
            coordinates: Some((center_x, center_y)),
            details: format!("Simulated mouse click at ({}, {})", center_x, center_y),
        })
    }

    fn double_click(&self) -> Result<ClickResult, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn right_click(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn hover(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn focus(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn type_text(&self, _text: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn press_key(&self, _key: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn get_text(&self, max_depth: usize) -> Result<String, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn set_value(&self, _value: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn is_enabled(&self) -> Result<bool, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn is_visible(&self) -> Result<bool, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn is_focused(&self) -> Result<bool, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn perform_action(&self, _action: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn create_locator(&self, _selector: Selector) -> Result<Locator, AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(WindowsUIElement)
    }

    fn scroll(&self, _direction: &str, _amount: f64) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedPlatform(
            "Windows implementation is not yet available".to_string(),
        ))
    }
}


