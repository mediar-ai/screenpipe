use crate::operator::element::UIElementImpl;
use crate::operator::platforms::AccessibilityEngine;
use crate::operator::ClickResult;
use crate::operator::{AutomationError, Locator, Selector, UIElement, UIElementAttributes};
use std::sync::Arc;
use std::fmt::Debug;
use std::hash::{Hash, Hasher};
use uiautomation::UIAutomation;
use uiautomation::controls::ControlType;
use uiautomation::inputs::Mouse;
use uiautomation::inputs::Keyboard;
use uiautomation::variants::Variant;
use uiautomation::patterns;
use uiautomation::actions::Scroll;
use tracing::debug;
use std::collections::{
    HashMap,
    hash_map::DefaultHasher
};
use uiautomation::types::{
    TreeScope,
    UIProperty
};

// thread-safety
#[derive(Clone)]
pub struct ThreadSafeWinUIAutomation(Arc<UIAutomation>);

// send and sync for wrapper
unsafe impl Send for ThreadSafeWinUIAutomation {}
unsafe impl Sync for ThreadSafeWinUIAutomation {}

#[allow(unused)]
pub struct WindowsEngine {
    automation: ThreadSafeWinUIAutomation,
    use_background_apps: bool,
    activate_app: bool,
}

impl WindowsEngine {
    pub fn new(use_background_apps: bool, activate_app: bool) -> Result<Self, AutomationError> {
        let automation = UIAutomation::new().map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        let arc_automation = ThreadSafeWinUIAutomation(Arc::new(automation));
        Ok(Self {
            automation: arc_automation,
            use_background_apps,
            activate_app,
        })
    }
}

impl AccessibilityEngine for WindowsEngine {
    fn get_root_element(&self) -> UIElement {
        let root = self.automation.0.get_root_element().unwrap();
        let arc_root = ThreadSafeWinUIElement(Arc::new(root));
        UIElement::new(Box::new(WindowsUIElement { element: arc_root }))
    }

    fn get_element_by_id(&self, id: &str) -> Result<UIElement, AutomationError> {
        let root_element = self.automation.0.get_root_element().unwrap();
        let condition = self.automation.0.create_property_condition(
            UIProperty::ProcessId, 
            Variant::from(id),
            None
        ).unwrap();
        let ele = root_element.find_first(TreeScope::Subtree, &condition)
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));

        Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })))
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        let element = self.automation.0.get_focused_element()
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        let arc_element = ThreadSafeWinUIElement(Arc::new(element));
            
        Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_element })))
    }

    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        let root = self.automation.0.get_root_element().unwrap();
        let condition = self.automation.0.create_property_condition(
            UIProperty::ControlType, 
            Variant::from(ControlType::Window.to_string()),
            None
        ).unwrap();
        let elements = root.find_all(TreeScope::Subtree, &condition)
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        let arc_elements: Vec<UIElement> = elements.into_iter()
            .map(|ele| {
                let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));
                UIElement::new(Box::new(WindowsUIElement { element: arc_ele }))
            }).collect();

        Ok(arc_elements)
    }

    fn get_application_by_name(&self, name: &str) -> Result<UIElement, AutomationError> {
        let root = self.automation.0.get_root_element().unwrap();
        let condition = self.automation.0.create_property_condition(
            UIProperty::Name,
            Variant::from(name),
            None
        ).unwrap();
        let ele = root.find_first(TreeScope::Subtree, &condition)
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));

        Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })))
    }

    fn find_elements(
        &self,
        selector: &Selector,
        root: Option<&UIElement>
    ) -> Result<Vec<UIElement>, AutomationError> {

        let root_ele = if let Some(el) = root {
            if let Some(ele) = el.as_any().downcast_ref::<WindowsUIElement>() {
                &ele.element.0
            } else {
                panic!("Root element not found")
            }
        } else {
            &Arc::new(self.automation.0.get_root_element().unwrap())
        };

        // make condition according to selector
        let condition = match selector {
            Selector::Role { role, name } => {
                let role_condition = self.automation.0.create_property_condition(
                    UIProperty::ControlType,
                    Variant::from(role.as_str()),
                    None
                ).unwrap();

                if let Some(name) = name {
                    let name_condition = self.automation.0.create_property_condition(
                        UIProperty::Name,
                        Variant::from(name.as_str()),
                        None
                    ).unwrap();
                    self.automation.0.create_and_condition(role_condition, name_condition).unwrap()
                } else {
                    role_condition
                }
            },
            Selector::Id(id) => self.automation.0.create_property_condition(
                UIProperty::AutomationId,
                Variant::from(id.as_str()),
                None
            ).unwrap(),
            Selector::Name(name) => self.automation.0.create_property_condition(
                UIProperty::Name,
                Variant::from(name.as_str()),
                None
            ).unwrap(),
            Selector::Text(text) => self.automation.0.create_property_condition(
                UIProperty::Name,
                Variant::from(text.as_str()),
                None
            ).unwrap(),
            Selector::Path(_) => {
                return Err(AutomationError::UnsupportedOperation("`Path` selector not supported".to_string()));
            },
            Selector::Attributes(_attributes) => {
                return Err(AutomationError::UnsupportedOperation("`Attributes` selector not supported".to_string()));
            },
            Selector::Filter(_filter) => {
                return Err(AutomationError::UnsupportedOperation("`Filter` selector not supported".to_string()));
            },
            Selector::Chain(_selectors) => {
                return Err(AutomationError::UnsupportedOperation("`selectors` selector not supported".to_string()));
            },
        };

        let elements = root_ele.find_all(TreeScope::Subtree, &condition)
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        let arc_elements: Vec<UIElement> = elements.into_iter()
            .map(|ele| {
                let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));
                UIElement::new(Box::new(WindowsUIElement { element: arc_ele }))
            }).collect();
            
        Ok(arc_elements)
    }

    fn find_element(&self, selector: &Selector, root: Option<&UIElement>) -> Result<UIElement, AutomationError> {
        let root_ele = if let Some(el) = root {
            if let Some(ele) = el.as_any().downcast_ref::<WindowsUIElement>() {
                &ele.element.0
            } else {
                panic!("Root element not found")
            }
        } else {
            &Arc::new(self.automation.0.get_root_element().unwrap())
        };
        // make condition according to selector
        let condition = match selector {
            Selector::Role { role, name } => {
                let role_condition = self.automation.0.create_property_condition(
                    UIProperty::ControlType,
                    Variant::from(role.as_str()),
                    None
                ).unwrap();

                if let Some(name) = name {
                    let name_condition = self.automation.0.create_property_condition(
                        UIProperty::Name,
                        Variant::from(name.as_str()),
                        None
                    ).unwrap();
                    self.automation.0.create_and_condition(role_condition, name_condition).unwrap()
                } else {
                    role_condition
                }
            },
            Selector::Id(id) => self.automation.0.create_property_condition(
                UIProperty::AutomationId,
                Variant::from(id.as_str()),
                None
            ).unwrap(),
            Selector::Name(name) => self.automation.0.create_property_condition(
                UIProperty::Name,
                Variant::from(name.as_str()),
                None
            ).unwrap(),
            Selector::Text(text) => self.automation.0.create_property_condition(
                UIProperty::Name,
                Variant::from(text.as_str()),
                None
            ).unwrap(),
            Selector::Path(_) => {
                return Err(AutomationError::UnsupportedOperation("`Path` selector not supported".to_string()));
            },
            Selector::Attributes(_attributes) => {
                return Err(AutomationError::UnsupportedOperation("`Attributes` selector not supported".to_string()));
            },
            Selector::Filter(_filter) => {
                return Err(AutomationError::UnsupportedOperation("`Filter` selector not supported".to_string()));
            },
            Selector::Chain(_selectors) => {
                return Err(AutomationError::UnsupportedOperation("`selectors` selector not supported".to_string()));
            },
        };

        let ele = root_ele.find_first(TreeScope::Subtree, &condition)
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));

        Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })))
    }

    fn open_application(&self, app_name: &str) -> Result<UIElement, AutomationError> {
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "hidden", "-Command","start", app_name])
            .status()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        if !status.success() {
            return Err(AutomationError::PlatformError("Failed to open application".to_string()));
        }

        self.get_application_by_name(app_name)
    }

    fn open_url(&self, url: &str, browser: Option<&str>) -> Result<UIElement, AutomationError> {
        let browser = browser.unwrap_or(""); // when empty it'll open url in system's default browser
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "hidden", "-Command", "start", browser, url])
            .status()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        if !status.success() {
            return Err(AutomationError::PlatformError("Failed to open URL".to_string()));
        }

        self.get_application_by_name(browser)
    }
}

// thread-safety
#[derive(Clone)]
pub struct ThreadSafeWinUIElement(Arc<uiautomation::UIElement>);

// send and sync for wrapper
unsafe impl Send for ThreadSafeWinUIElement {}
unsafe impl Sync for ThreadSafeWinUIElement {}

pub struct WindowsUIElement {
    element: ThreadSafeWinUIElement,
}

impl Debug for WindowsUIElement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsUIElement").finish()
    }
}

impl UIElementImpl for WindowsUIElement {
    fn object_id(&self) -> usize {
        // similar to macos :D
        let stable_id = format!("{:?}",
            self.element.0.get_runtime_id().unwrap_or_default()); 
        let mut hasher = DefaultHasher::new();
        stable_id.hash(&mut hasher);
        let id = hasher.finish() as usize;
        debug!("Stable ID: {:?}", stable_id);
        debug!("Hash: {:?}", id);
        id
    }

    fn id(&self) -> Option<String> {
        self.element.0.get_automation_id().ok()
    }

    fn role(&self) -> String {
        self.element.0.get_control_type().unwrap().to_string()
    }

    fn attributes(&self) -> UIElementAttributes {
        let mut properties = HashMap::new();
        // there are alot of properties, should i include all ??
        // ref: https://docs.rs/uiautomation/0.16.1/uiautomation/types/enum.UIProperty.html
        let property_list = vec![
            UIProperty::Name,
            UIProperty::HelpText,
            UIProperty::LabeledBy,
            UIProperty::ValueValue,
            UIProperty::ControlType,
            UIProperty::AutomationId,
            UIProperty::FullDescription,
        ];
        for property in property_list {
            if let Ok(value) = self.element.0.get_property_value(property) {
                properties.insert(
                    format!("{:?}", property),
                    Some(serde_json::to_value(value.to_string()).unwrap_or_default()),
                );
            } else {
                properties.insert(format!("{:?}", property), None);
            }
        }
        UIElementAttributes {
            role: self.role(),
            label: self.element.0.get_labeled_by().ok()
                .map(|e| e.get_name().unwrap_or_default()),
            value: self.element.0.get_property_value(UIProperty::ValueValue)
                .ok().and_then(|v| v.get_string().ok()),
            description: self.element.0.get_help_text().ok(),
            properties,
        }
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        let children = self.element.0.get_cached_children()
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        Ok(children.into_iter()
            .map(|ele| UIElement::new(
                Box::new(WindowsUIElement {
                    element: ThreadSafeWinUIElement(Arc::new(ele)) 
                }))).collect()
        )
    }

    fn parent(&self) -> Result<Option<UIElement>, AutomationError> {
        let parent = self.element.0.get_cached_parent();
        match parent {
            Ok(par) => {
                let par_ele = UIElement::new(Box::new(WindowsUIElement {
                    element: ThreadSafeWinUIElement(Arc::new(par)),
                }));
                Ok(Some(par_ele))
            }
            Err(e) => Err(AutomationError::ElementNotFound(e.to_string())),
        }
    }

    fn bounds(&self) -> Result<(f64, f64, f64, f64), AutomationError> {
        let rect = self.element.0.get_bounding_rectangle().map_err(|e| AutomationError::ElementNotFound(e.to_string()))?;
        Ok((
            rect.get_left() as f64,
            rect.get_top() as f64,
            rect.get_width() as f64,
            rect.get_height() as f64,
        ))
    }

    fn click(&self) -> Result<ClickResult, AutomationError> {
        self.element.0.try_focus();
        let point = self.element.0.get_clickable_point()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?
            .ok_or_else(|| AutomationError::PlatformError("No clickable point found".to_string()))?;
        let mouse = Mouse::default();
        mouse.click(point).map_err(|e| AutomationError::PlatformError(e.to_string()))?;

        Ok(ClickResult {
            method: "Single Click".to_string(),
            coordinates: Some((point.get_x() as f64, point.get_y() as f64)),
            details: "Clicked by Mouse".to_string(),
        })
    }

    fn double_click(&self) -> Result<ClickResult, AutomationError> {
        self.element.0.try_focus();
        let point = self.element.0.get_clickable_point()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?
            .ok_or_else(|| AutomationError::PlatformError("No clickable point found".to_string()))?;
        let mouse = Mouse::default();
        mouse.double_click(point).map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        Ok(ClickResult {
            method: "Double Click".to_string(),
            coordinates: Some((point.get_x() as f64, point.get_y() as f64)),
            details: "Clicked by Mouse".to_string(),
        })
    }

    fn right_click(&self) -> Result<(), AutomationError> {
        self.element.0.try_focus();
        let point = self.element.0.get_clickable_point()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?
            .ok_or_else(|| AutomationError::PlatformError("No clickable point found".to_string()))?;
        let mouse = Mouse::default();
        mouse.right_click(point).map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        Ok(())
    }

    fn hover(&self) -> Result<(), AutomationError> {
        return Err(AutomationError::UnsupportedOperation("`hover` doesn't not support".to_string()));
    }

    fn focus(&self) -> Result<(), AutomationError> {
        self.element.0.set_focus()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))
    }

    fn type_text(&self, text: &str) -> Result<(), AutomationError> {
        let control_type = self.element.0.get_control_type()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        // check if element accepts input
        if control_type == ControlType::Edit {
            let keyboard = Keyboard::default();
            keyboard.send_text(text)
                .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
            Ok(())
        } else {
            Err(AutomationError::PlatformError("Element is not editable".to_string()))
        }
    }

    fn press_key(&self, key: &str) -> Result<(), AutomationError> {
        let control_type = self.element.0.get_control_type()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        // check if element accepts input, similar :D
        if control_type == ControlType::Edit {
            let keyboard = Keyboard::default();
            keyboard.send_keys(key)
                .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
            Ok(())
        } else {
            Err(AutomationError::PlatformError("Element is not editable".to_string()))
        }
    }

    fn get_text(&self, max_depth: usize) -> Result<String, AutomationError> {
        fn collect_text(
            element: &uiautomation::UIElement,
            depth: usize,
            max_depth: usize
        ) -> Result<String, AutomationError> {
            if depth > max_depth {
                return Ok(String::new());
            }
            let mut text = String::new();

            if let Ok(text_pattern) = element.get_pattern::<patterns::UITextPattern>() {
                if let Ok(range) = text_pattern.get_document_range() {
                    // -1 for retriving all possible texts
                    if let Ok(range_text) = range.get_text(-1) {
                        text.push_str(&range_text);
                    }
                }
            } else {
                // fallback to `get_name` if TextPattern isn't available.
                // but it'll get only name
                text.push_str(&element.get_name().unwrap_or_default());
            }
            if depth < max_depth {
                if let Ok(children) = element.get_cached_children() {
                    for child in children {
                        // collect recursively
                        let child_text = collect_text(&child, depth + 1, max_depth)?;
                        if !child_text.is_empty() {
                            text.push_str(&format!(" {}", child_text));
                        }
                    }
                }
            }
            Ok(text)
        }
        collect_text(&self.element.0, 0, max_depth)
    }

    fn set_value(&self, value: &str) -> Result<(), AutomationError> {
        // uiautomation::actions::Value::set_value(&self, value)
        // self.element.0.set_value(value).map_err(|e| AutomationError::PlatformError(e.to_string()))
        let value_par = self.element.0.get_pattern::<patterns::UIValuePattern>()
            .map_err(|e| AutomationError::PlatformError(e.to_string()));

        if let Ok(v) = value_par {
            v.set_value(value).map_err(|e| AutomationError::PlatformError(e.to_string()))
        } else {
            Err(AutomationError::PlatformError("`UIValuePattern` is not found".to_string()))
        }
    }

    fn is_enabled(&self) -> Result<bool, AutomationError> {
        self.element.0.is_enabled().map_err(|e| AutomationError::ElementNotFound(e.to_string()))
    }

    fn is_visible(&self) -> Result<bool, AutomationError> {
        // offscreen means invisible, right?
        self.element.0.is_offscreen().map_err(|e| AutomationError::ElementNotFound(e.to_string()))
    }

    fn is_focused(&self) -> Result<bool, AutomationError> {
        // start a sperate instance of `uiautomation` just to check
        // the current focused element is same as focused element or not
        let automation = UIAutomation::new().map_err(|e| AutomationError::Internal(e.to_string()))?;
        let focused_element = automation.get_focused_element()
            .map_err(|e| AutomationError::Internal(e.to_string()))?;
        if Arc::ptr_eq(&self.element.0, &Arc::new(focused_element)) {
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn perform_action(&self, action: &str) -> Result<(), AutomationError> {
        // the actions can be
        // focus
        // invoke
        // enable
        // click
        // double click
        // righ click
        // scroll
        // toggle
        // set value
        // expand collapse 
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

