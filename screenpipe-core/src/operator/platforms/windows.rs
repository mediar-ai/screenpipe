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
use tracing::debug;
use std::collections::{
    HashMap,
    hash_map::DefaultHasher
};
use uiautomation::types::{
    TreeScope,
    UIProperty,
    ScrollAmount
};

// thread-safety
#[derive(Clone)]
pub struct ThreadSafeWinUIAutomation(Arc<UIAutomation>);

// send and sync for wrapper
unsafe impl Send for ThreadSafeWinUIAutomation {}
unsafe impl Sync for ThreadSafeWinUIAutomation {}

#[allow(unused)]
// there is no need of `use_background_apps` or `activate_app`
// windows IUIAutomation will get current running app & 
// background running app spontaneously, keeping it anyway!!
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

    fn get_element_by_id(&self, id: i32) -> Result<UIElement, AutomationError> {
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
            Variant::from(ControlType::Window as i32),
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
        debug!("searching application from name: {}", name);

        // first find element by matcher
        let root_ele = self.automation.0.get_root_element().unwrap();
        let automation = WindowsEngine::new(false, false)
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        let matcher = automation.automation.0.create_matcher()
            .control_type(ControlType::Window)
            .contains_name(name)
            .from_ref(&root_ele)
            .depth(7)
            .timeout(5000);
        let ele_res = matcher.find_first()
            .map_err(|e| AutomationError::ElementNotFound(e.to_string()));

        // fallback to find by pid
        let ele = match ele_res {
            Ok(ele) => ele,
            Err(_) => {
                let pid = match get_pid_by_name(name) {
                    Some(pid) => pid,
                    None => {
                        return Err(AutomationError::PlatformError(
                            format!("no running application found from name: {:?}", name)
                        ));
                    }
                };
                let condition = automation.automation.0.create_property_condition(
                    UIProperty::ProcessId,
                    Variant::from(pid as i32),
                    None
                ).unwrap();
                root_ele.find_first(TreeScope::Subtree, &condition)
                    .map_err(|e| AutomationError::ElementNotFound(e.to_string()))?
            }
        };
        let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));
        return Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })));
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
                &Arc::new(self.automation.0.get_root_element().unwrap())
            }
        } else {
            &Arc::new(self.automation.0.get_root_element().unwrap())
        };

        // make condition according to selector
        let condition = match selector {
            Selector::Role { role, name: _ } => {
                let roles = map_generic_role_to_win_roles(role);
                let role_condition  = self.automation.0.create_property_condition(
                            UIProperty::ControlType,
                            Variant::from(roles as i32),
                            None
                        ).unwrap();
                debug!("role conditions: {:#?} for finding element: {:#?}",
                    role_condition, root_ele);
                role_condition
            },
            Selector::Id(id) => self.automation.0.create_property_condition(
                UIProperty::AutomationId,
                Variant::from(id.as_str()),
                None
            ).unwrap(),
            Selector::Name(_name) => self.automation.0.create_property_condition(
                UIProperty::ControlType,
                Variant::from(ControlType::Window as i32),
                None
            ).unwrap(),
            Selector::Text(_text) => self.automation.0.create_property_condition(
                UIProperty::ControlType,
                Variant::from(ControlType::Text as i32),
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
                &Arc::new(self.automation.0.get_root_element().unwrap())
            }
        } else {
            &Arc::new(self.automation.0.get_root_element().unwrap())
        };

        match selector {
            Selector::Role { role, name: _ } => {
                let roles = map_generic_role_to_win_roles(role);
                let role_condition  = self.automation.0.create_property_condition(
                            UIProperty::ControlType,
                            Variant::from(roles as i32),
                            None
                        ).unwrap();
                debug!("role conditions: {:#?} for finding element: {:#?}",
                    role_condition, root_ele);
                // find a element that satisfies the roles
                let element = root_ele.find_first(TreeScope::Subtree, &role_condition)
                    .map_err(|e| AutomationError::ElementNotFound(
                            format!("element not found, Err: {}", e.to_string()
                        )))?;
                debug!("found element: {:#?}", element);

                let arc_ele = ThreadSafeWinUIElement(Arc::new(element));

                Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })))
            },
            Selector::Id(id) => {
                let condition = self.automation.0.create_property_condition(
                    UIProperty::AutomationId,
                    Variant::from(id.as_str()),
                        None
                    ).unwrap();

                let ele = root_ele.find_first(TreeScope::Subtree, &condition)
                    .map_err(|e| AutomationError::ElementNotFound(
                        format!("ID: '{}', Err: {}", id, e.to_string())))?;
                let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));

                Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })))
            },  
            Selector::Name(name) => {
                // `name` and `window` can be same
                let condition = self.automation.0.create_property_condition(
                    UIProperty::ControlType,
                    Variant::from(ControlType::Window as i32),
                    None
                ).unwrap();

                let ele = root_ele.find_first(TreeScope::Subtree, &condition)
                    .map_err(|e| AutomationError::ElementNotFound(
                        format!("Name: '{}', Err: {}", name, e.to_string())))?;
                let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));

                Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })))
            },
            Selector::Text(text) => { 
                let condition = self.automation.0.create_property_condition(
                    UIProperty::ControlType,
                    Variant::from(ControlType::Text as i32),
                    None
                ).unwrap();

                let ele = root_ele.find_first(TreeScope::Subtree, &condition)
                    .map_err(|e| AutomationError::ElementNotFound(
                        format!("Text: '{}', Err: {}", text, e.to_string())))?;
                let arc_ele = ThreadSafeWinUIElement(Arc::new(ele));

                Ok(UIElement::new(Box::new(WindowsUIElement { element: arc_ele })))
            }
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
        }
    }

    fn open_application(&self, app_name: &str) -> Result<UIElement, AutomationError> {
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "hidden", "-Command","start", app_name])
            .status()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        if !status.success() {
            return Err(AutomationError::PlatformError("Failed to open application".to_string()));
        }

        std::thread::sleep(std::time::Duration::from_millis(200));

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

        std::thread::sleep(std::time::Duration::from_millis(200));

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
        // use hashed `AutomationId` as object_id
        let stable_id = format!("{:?}",
            self.element.0.get_automation_id().unwrap_or_default()); 
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
        // there are alot of properties, including neccessary ones
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
        let automation = WindowsEngine::new(false, false)
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        let mut all_texts = String::new();
        // run the text matcher
        let txt_matcher = automation.automation.0.create_matcher()
            .control_type(ControlType::Text)
            .from_ref(&self.element.0)
            .depth(max_depth as u32)
            .timeout(1000);

        if let Ok(text_eles) = txt_matcher.find_all() {
            for text_ele in text_eles {
                // get name
                if let Ok(name) = text_ele.get_property_value(UIProperty::Name) {
                    if let Ok(name_text) = name.get_string() {
                        all_texts.push_str(&name_text);
                    }
                }
                // get value
                if let Ok(value) = text_ele.get_property_value(UIProperty::ValueValue) {
                    if let Ok(val_text) = value.get_string(){
                        all_texts.push_str(&val_text);
                    }
                }
            }
        }
        Ok(all_texts)
    }

    fn set_value(&self, value: &str) -> Result<(), AutomationError> {
        let value_par = self.element.0.get_pattern::<patterns::UIValuePattern>()
            .map_err(|e| AutomationError::PlatformError(e.to_string()));
        debug!("setting value: {:#?} to ui element {:#?}", &value, &self.element.0);

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
        // start a instance of `uiautomation` just to check the 
        // current focused element is same as focused element or not
        let automation = WindowsEngine::new(false, false)
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        let focused_element = automation.automation.0.get_focused_element()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
        if Arc::ptr_eq(&self.element.0, &Arc::new(focused_element)) {
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn perform_action(&self, action: &str) -> Result<(), AutomationError> {
        // actions those don't take args
        match action {
            "focus" => self.focus(),
            "invoke" => {
                let invoke_pat = self.element.0.get_pattern::<patterns::UIInvokePattern>()
                    .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
                invoke_pat.invoke().map_err(|e| AutomationError::PlatformError(e.to_string()))
            },
            "click" => self.click().map(|_| ()),
            "double_click" => self.double_click().map(|_| ()),
            "right_click" => self.right_click().map(|_| ()),
            "toggle" => {
                let toggle_pattern = self.element.0.get_pattern::<patterns::UITogglePattern>()
                    .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
                toggle_pattern.toggle().map_err(|e| AutomationError::PlatformError(e.to_string()))
            },
            "expand_collapse" => {
                let expand_collapse_pattern = self.element.0.get_pattern::<patterns::UIExpandCollapsePattern>()
                    .map_err(|e| AutomationError::PlatformError(e.to_string()))?;
                expand_collapse_pattern.expand().map_err(|e| AutomationError::PlatformError(e.to_string()))
            },
            _ => Err(AutomationError::UnsupportedOperation(format!("action '{}' not supported", action))),
        }
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn create_locator(&self, selector: Selector) -> Result<Locator, AutomationError> {
        let automation = WindowsEngine::new(false, false)
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;

        let attrs = self.attributes();
        debug!("creating locator for element: control_type={:#?}, label={:#?}",
            attrs.role, attrs.label);

        let self_element = UIElement::new(Box::new(WindowsUIElement {
            element: self.element.clone(),
        }));

        Ok(Locator::new(std::sync::Arc::new(automation), selector).within(self_element))
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(WindowsUIElement { element: self.element.clone() })
    }

    fn scroll(&self, direction: &str, amount: f64) -> Result<(), AutomationError> {
        let scroll_pattern = self.element.0.get_pattern::<patterns::UIScrollPattern>()
            .map_err(|e| AutomationError::PlatformError(e.to_string()))?;

        let scroll_amount = if amount > 0.0 {
            ScrollAmount::SmallIncrement
        } else if amount < 0.0 {
            ScrollAmount::SmallDecrement
        } else {
            ScrollAmount::NoAmount
        };

        let times = amount.abs() as usize;
        for _ in 0..times {
            match direction {
                "up" => scroll_pattern.scroll(ScrollAmount::NoAmount, scroll_amount)
                    .map_err(|e| AutomationError::PlatformError(e.to_string())),
                "down" => scroll_pattern.scroll(ScrollAmount::NoAmount, scroll_amount)
                    .map_err(|e| AutomationError::PlatformError(e.to_string())),
                "left" => scroll_pattern.scroll(scroll_amount, ScrollAmount::NoAmount)
                    .map_err(|e| AutomationError::PlatformError(e.to_string())),
                "right" => scroll_pattern.scroll(scroll_amount, ScrollAmount::NoAmount)
                    .map_err(|e| AutomationError::PlatformError(e.to_string())),
                _ => Err(AutomationError::UnsupportedOperation("Invalid scroll direction".to_string())),
            }?
        }
        Ok(())
    }
}

// make easier to pass roles
fn map_generic_role_to_win_roles(role: &str) -> ControlType {
    match role.to_lowercase().as_str() {
        "window" => ControlType::Window,
        "button" => ControlType::Button,
        "checkbox" => ControlType::CheckBox,
        "menu" => ControlType::Menu, 
        "menuitem" => ControlType::MenuItem,
        "dialog" => ControlType::Window,
        "text" => ControlType::Text, 
        "tree"  =>  ControlType::Tree, 
        "treeitem" =>  ControlType::TreeItem,
        "data" | "dataitem" => ControlType::DataGrid,
        "datagrid" => ControlType::DataGrid,
        "url" | "urlfield" => ControlType::Edit, 
        "list" => ControlType::List, 
        "image" => ControlType::Image, 
        "title" => ControlType::TitleBar,
        "listitem" => ControlType::ListItem,
        "combobox" => ControlType::ComboBox,
        "tab" => ControlType::Tab, 
        "tabitem" => ControlType::TabItem,
        "toolbar" => ControlType::ToolBar,
        "appbar" => ControlType::AppBar,
        "calendar" => ControlType::Calendar,
        "edit" => ControlType::Edit, 
        "hyperlink" => ControlType::Hyperlink,
        "progressbar" => ControlType::ProgressBar,
        "radiobutton" => ControlType::RadioButton,
        "scrollbar" => ControlType::ScrollBar,
        "slider" => ControlType::Slider,
        "spinner" => ControlType::Spinner,
        "statusbar" => ControlType::StatusBar,
        "tooltip" => ControlType::ToolTip,
        "custom" => ControlType::Custom,
        "group" => ControlType::Group, 
        "thumb" => ControlType::Thumb, 
        "document" => ControlType::Document,
        "splitbutton" => ControlType::SplitButton,
        "pane" => ControlType::Pane, 
        "header" => ControlType::Header,
        "headeritem" => ControlType::HeaderItem,
        "table" => ControlType::Table, 
        "titlebar" => ControlType::TitleBar,
        "separator" => ControlType::Separator,
        "semanticzoom" => ControlType::SemanticZoom,
        _ => ControlType::Custom, // keep as it is for unknown roles
    }
}

fn get_pid_by_name(name: &str) -> Option<i32> {
    // window title shouldn't be empty
    let command = format!(
        "Get-Process | Where-Object {{ $_.MainWindowTitle -ne '' -and $_.Name -like '*{}*' }} | ForEach-Object {{ $_.Id }}",
        name
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "hidden", "-Command", &command])
        .output()
        .expect("Failed to execute PowerShell script");

    if output.status.success() {
        // return only parent pid
        let pid_str = String::from_utf8_lossy(&output.stdout);
        pid_str.lines().next()?.trim().parse().ok()
    } else {
        None
    }
}
