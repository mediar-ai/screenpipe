use crate::ui_automation::platforms::AccessibilityEngine;
use crate::ui_automation::{
    element::UIElementImpl, AutomationError, Locator, Selector, UIElement, UIElementAttributes,
};

use accessibility::AXUIElementAttributes;
use accessibility::{AXAttribute, AXUIElement, TreeVisitor, TreeWalker, TreeWalkerFlow};
use anyhow::Result;
use core_foundation::array::CFArray;
use core_foundation::base::CFTypeRef;
use core_foundation::{
    base::TCFType, boolean::CFBoolean, dictionary::CFDictionary, string::CFString,
};
use objc::runtime::Object;
use objc_foundation::{INSArray, INSObject, NSArray, NSObject};
use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;
use std::process::id;
use std::sync::Arc;
use tracing::{debug, info, trace, warn};

// Thread-safe wrapper for AXUIElement
#[derive(Clone)]
pub struct ThreadSafeAXUIElement(Arc<AXUIElement>);

// Implement Send and Sync for our wrapper
// SAFETY: AXUIElement is safe to send and share between threads as Apple's
// accessibility API is designed to be called from any thread. The underlying
// Core Foundation objects manage their own thread safety.
unsafe impl Send for ThreadSafeAXUIElement {}
unsafe impl Sync for ThreadSafeAXUIElement {}

impl ThreadSafeAXUIElement {
    pub fn new(element: AXUIElement) -> Self {
        Self(Arc::new(element))
    }

    pub fn system_wide() -> Self {
        Self(Arc::new(AXUIElement::system_wide()))
    }

    pub fn application(pid: i32) -> Self {
        Self(Arc::new(AXUIElement::application(pid)))
    }

    // Add method to get a reference to the underlying AXUIElement
    pub fn as_ref(&self) -> &AXUIElement {
        &self.0
    }

    // Delegate methods to the wrapped AXUIElement
    // Generic version that uses the T parameter from AXAttribute<T>
    pub fn attribute<T: TCFType>(
        &self,
        attribute: &AXAttribute<T>,
    ) -> Result<T, accessibility::Error> {
        self.0.attribute(attribute)
    }

    pub fn perform_action(&self, action: &CFString) -> Result<(), accessibility::Error> {
        self.0.perform_action(action)
    }

    pub fn set_attribute<T: Into<CFTypeRef> + TCFType>(
        &self,
        attribute: &AXAttribute<T>,
        value: T,
    ) -> Result<(), accessibility::Error> {
        self.0.set_attribute(attribute, value)
    }

    // Add other delegated methods as needed
    pub fn attribute_names(&self) -> Result<Vec<CFString>, accessibility::Error> {
        let array = self.0.attribute_names()?;
        let len = array.len();
        let mut result = Vec::with_capacity(len as usize);

        for i in 0..len {
            let string_ref = array.get(i).unwrap();
            // Create a new CFString from the reference
            result.push(CFString::new(&string_ref.to_string()));
        }

        Ok(result)
    }

    pub fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

// Implement Debug
impl fmt::Debug for ThreadSafeAXUIElement {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("ThreadSafeAXUIElement")
            .field(&"<AXUIElement>")
            .finish()
    }
}

pub struct MacOSEngine {
    system_wide: ThreadSafeAXUIElement,
}

impl MacOSEngine {
    pub fn new() -> Result<Self, AutomationError> {
        // Check accessibility permissions using FFI directly
        // Since accessibility::AXIsProcessTrustedWithOptions is not available
        let accessibility_enabled = unsafe {
            use core_foundation::dictionary::CFDictionaryRef;

            #[link(name = "ApplicationServices", kind = "framework")]
            extern "C" {
                fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
            }

            let check_attr = CFString::new("AXTrustedCheckOptionPrompt");
            let options = CFDictionary::from_CFType_pairs(&[(
                check_attr.as_CFType(),
                CFBoolean::true_value().as_CFType(),
            )])
            .as_concrete_TypeRef();

            AXIsProcessTrustedWithOptions(options)
        };

        if !accessibility_enabled {
            return Err(AutomationError::PermissionDenied(
                "Accessibility permissions not granted".to_string(),
            ));
        }

        Ok(Self {
            system_wide: ThreadSafeAXUIElement::system_wide(),
        })
    }

    // Helper to convert ThreadSafeAXUIElement to our UIElement
    fn wrap_element(&self, ax_element: ThreadSafeAXUIElement) -> UIElement {
        UIElement::new(Box::new(MacOSUIElement {
            element: ax_element,
        }))
    }

    // Update find_by_role to actually search for elements
    fn find_by_role(
        &self,
        role: &str,
        name: Option<&str>,
        root: Option<&ThreadSafeAXUIElement>,
    ) -> Result<Vec<ThreadSafeAXUIElement>, AutomationError> {
        debug!(target: "ui_automation", "Searching for elements with role={} name={:?}", role, name);

        let collector = ElementCollector::new(role, name);
        let walker = TreeWalker::new();

        let start_element = root.unwrap_or(&self.system_wide);
        debug!(target: "ui_automation", "Starting tree walk from root element");
        walker.walk(start_element.as_ref(), &collector.adapter());

        // Get the collected elements from the adapter
        let elements = collector.adapter().inner.borrow().elements.clone();

        debug!(target: "ui_automation", "Found {} elements with role '{}'", elements.len(), role);

        Ok(elements)
    }
}

// Helper function to get PIDs of running applications using NSWorkspace
fn get_running_application_pids() -> Result<Vec<i32>, AutomationError> {
    // Implementation using Objective-C bridging
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        use objc_foundation::{INSArray, NSArray};

        let workspace_class = class!(NSWorkspace);
        let shared_workspace: *mut objc::runtime::Object =
            msg_send![workspace_class, sharedWorkspace];
        let apps: *mut objc::runtime::Object = msg_send![shared_workspace, runningApplications];
        let count: usize = msg_send![apps, count];

        let mut pids = Vec::with_capacity(count);
        for i in 0..count {
            let app: *mut objc::runtime::Object = msg_send![apps, objectAtIndex:i];

            let activation_policy: i32 = msg_send![app, activationPolicy];
            // NSApplicationActivationPolicyRegular = 0
            // NSApplicationActivationPolicyAccessory = 1
            // NSApplicationActivationPolicyProhibited = 2 (background only)
            if activation_policy == 2 {
                // NSApplicationActivationPolicyProhibited
                continue;
            }

            let pid: i32 = msg_send![app, processIdentifier];
            pids.push(pid);
        }

        debug!(target: "ui_automation", "Found {} application PIDs", pids.len());
        Ok(pids)
    }

    #[cfg(not(target_os = "macos"))]
    Err(AutomationError::UnsupportedPlatform(
        "get_running_application_pids is only supported on macOS".to_string(),
    ))
}

impl AccessibilityEngine for MacOSEngine {
    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        // Get running application PIDs using NSWorkspace
        let pids = get_running_application_pids()?;

        debug!(target: "ui_automation", "Found {} running applications", pids.len());

        // Create AXUIElements for each application
        let mut app_elements = Vec::new();
        for pid in pids {
            debug!(target: "ui_automation", "Creating AXUIElement for application with PID: {}", pid);
            let app_element = ThreadSafeAXUIElement::application(pid);
            app_elements.push(self.wrap_element(app_element));
        }

        Ok(app_elements)
    }
    fn get_root_element(&self) -> UIElement {
        self.wrap_element(self.system_wide.clone())
    }

    fn get_element_by_id(&self, id: &str) -> Result<UIElement, AutomationError> {
        let collector = ElementCollectorByAttribute::new("AXIdentifier", id);
        let walker = TreeWalker::new();

        walker.walk(self.system_wide.as_ref(), &collector.adapter());

        collector
            .elements
            .first()
            .map(|e| self.wrap_element(e.clone()))
            .ok_or_else(|| {
                AutomationError::ElementNotFound(format!("Element with ID '{}' not found", id))
            })
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "get_focused_element not yet implemented for macOS".to_string(),
        ))
    }

    fn get_application_by_name(&self, name: &str) -> Result<UIElement, AutomationError> {
        // Find application by name/title
        self.find_by_role("AXApplication", Some(name), None)
            .and_then(|elements| {
                elements
                    .first()
                    .map(|e| self.wrap_element(e.clone()))
                    .ok_or_else(|| {
                        AutomationError::ElementNotFound(format!(
                            "Application '{}' not found",
                            name
                        ))
                    })
            })
    }

    fn find_elements(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError> {
        // Extract the macOS element if root is provided
        let root_ax_element = root.map(|el| {
            if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                &macos_el.element
            } else {
                panic!("Root element is not a macOS element")
            }
        });

        match selector {
            Selector::Role { role, name } => self
                .find_by_role(role, name.as_deref(), root_ax_element)
                .map(|elements| elements.into_iter().map(|e| self.wrap_element(e)).collect()),

            Selector::Id(id) => {
                // Try to find by AXIdentifier
                let collector = ElementCollectorByAttribute::new("AXIdentifier", id);
                let walker = TreeWalker::new();

                let start_element = root_ax_element.unwrap_or(&self.system_wide);
                walker.walk(start_element.as_ref(), &collector.adapter());

                Ok(collector
                    .elements
                    .into_iter()
                    .map(|e| self.wrap_element(e))
                    .collect())
            }

            Selector::Name(name) => {
                // Try to find by AXTitle or AXDescription
                let collector = ElementCollectorByAttribute::new("AXTitle", name);
                let walker = TreeWalker::new();

                let start_element = root_ax_element.unwrap_or(&self.system_wide);
                walker.walk(start_element.as_ref(), &collector.adapter());

                Ok(collector
                    .elements
                    .into_iter()
                    .map(|e| self.wrap_element(e))
                    .collect())
            }

            Selector::Text(text) => {
                // Try to find by AXValue
                let collector = ElementCollectorByAttribute::new("AXValue", text);
                let walker = TreeWalker::new();

                let start_element = root_ax_element.unwrap_or(&self.system_wide);
                walker.walk(start_element.as_ref(), &collector.adapter());

                Ok(collector
                    .elements
                    .into_iter()
                    .map(|e| self.wrap_element(e))
                    .collect())
            }

            _ => {
                // For more complex selectors, we'll mark as unimplemented for now
                Err(AutomationError::UnsupportedOperation(
                    "Complex selector not yet implemented for macOS".to_string(),
                ))
            }
        }
    }
}

// Adapter structs to bridge between AXUIElement and ThreadSafeAXUIElement
struct ElementCollectorAdapter {
    inner: RefCell<ElementCollector>,
}

impl TreeVisitor for ElementCollectorAdapter {
    fn enter_element(&self, element: &AXUIElement) -> TreeWalkerFlow {
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.borrow_mut().enter_element_impl(&wrapped)
    }

    fn exit_element(&self, element: &AXUIElement) {
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.borrow_mut().exit_element_impl(&wrapped)
    }
}

struct ElementCollectorByAttributeAdapter {
    inner: RefCell<ElementCollectorByAttribute>,
}

impl TreeVisitor for ElementCollectorByAttributeAdapter {
    fn enter_element(&self, element: &AXUIElement) -> TreeWalkerFlow {
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.borrow_mut().enter_element_impl(&wrapped)
    }

    fn exit_element(&self, element: &AXUIElement) {
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.borrow_mut().exit_element_impl(&wrapped)
    }
}

// Helper struct for collecting elements by role
struct ElementCollector {
    target_role: String,
    target_name: Option<String>,
    elements: Vec<ThreadSafeAXUIElement>,
}

impl ElementCollector {
    fn new(role: &str, name: Option<&str>) -> Self {
        Self {
            target_role: role.to_string(),
            target_name: name.map(|s| s.to_string()),
            elements: Vec::new(),
        }
    }

    fn adapter(&self) -> ElementCollectorAdapter {
        ElementCollectorAdapter {
            inner: RefCell::new(ElementCollector {
                target_role: self.target_role.clone(),
                target_name: self.target_name.clone(),
                elements: Vec::new(),
            }),
        }
    }

    fn enter_element_impl(&mut self, element: &ThreadSafeAXUIElement) -> TreeWalkerFlow {
        // Check for role match - macOS uses AXRole attribute
        let role_attr = AXAttribute::new(&CFString::new("AXRole"));

        // Get all attribute names to help debug
        let attr_names = match element.0.attribute_names() {
            Ok(names) => {
                let names_str: Vec<String> = names.iter().map(|n| n.to_string()).collect();
                trace!(target: "ui_automation", "Element attributes: {:?}", names_str);
                names
            }
            Err(e) => {
                trace!(target: "ui_automation", "Failed to get attribute names: {}", e);
                CFArray::<CFString>::from_CFTypes(&[])
            }
        };

        debug!(target: "ui_automation", "Attribute names: {:?}", attr_names);

        // Always get children to validate we're traversing properly
        if let Ok(children) = element.0.children() {
            debug!(target: "ui_automation", "Element has {} children", children.len());
        }

        if let Ok(value) = element.0.attribute(&role_attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let role_value = cf_string.to_string();

                trace!(target: "ui_automation", "Element role: {}", role_value);

                // Get title if available
                let mut title = String::new();
                let title_attr = AXAttribute::new(&CFString::new("AXTitle"));
                if let Ok(title_value) = element.0.attribute(&title_attr) {
                    if let Some(title_cf_string) = title_value.downcast_into::<CFString>() {
                        title = title_cf_string.to_string();
                        trace!(target: "ui_automation", "Element title: {}", title);
                    }
                }

                if role_value == self.target_role {
                    debug!(
                        target: "ui_automation",
                        "Found element with matching role: {}, title: {}",
                        role_value,
                        title
                    );

                    // If name is specified, check it matches
                    if let Some(ref target_name) = self.target_name {
                        if title == *target_name {
                            debug!(target: "ui_automation", "Found element with matching name: {}", title);
                            self.elements.push(element.clone());
                        }
                    } else {
                        // No name filter, just collect by role
                        debug!(target: "ui_automation", "Adding element with role: {}", role_value);
                        self.elements.push(element.clone());
                    }
                }
            }
        } else {
            trace!(target: "ui_automation", "Element has no role attribute");
        }

        // Try to get subrole as some macOS elements expose functionality via subrole
        let subrole_attr = AXAttribute::new(&CFString::new("AXSubrole"));
        if let Ok(value) = element.0.attribute(&subrole_attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let subrole_value = cf_string.to_string();
                trace!(target: "ui_automation", "Element subrole: {}", subrole_value);

                // Check if the subrole matches our target role (for button-like elements)
                if subrole_value == self.target_role
                    || (self.target_role == "AXButton"
                        && (subrole_value == "AXPushButton" || subrole_value == "AXToggleButton"))
                {
                    debug!(target: "ui_automation", "Found element with matching subrole: {}", subrole_value);
                    self.elements.push(element.clone());
                }
            }
        }

        TreeWalkerFlow::Continue
    }

    fn exit_element_impl(&mut self, _element: &ThreadSafeAXUIElement) {}
}

// Helper struct for collecting elements by attribute value
struct ElementCollectorByAttribute {
    attribute_name: String,
    attribute_value: String,
    elements: Vec<ThreadSafeAXUIElement>,
}

impl ElementCollectorByAttribute {
    fn new(attribute: &str, value: &str) -> Self {
        Self {
            attribute_name: attribute.to_string(),
            attribute_value: value.to_string(),
            elements: Vec::new(),
        }
    }

    fn adapter(&self) -> ElementCollectorByAttributeAdapter {
        ElementCollectorByAttributeAdapter {
            inner: RefCell::new(ElementCollectorByAttribute {
                attribute_name: self.attribute_name.clone(),
                attribute_value: self.attribute_value.clone(),
                elements: Vec::new(),
            }),
        }
    }

    fn enter_element_impl(&mut self, element: &ThreadSafeAXUIElement) -> TreeWalkerFlow {
        // Existing implementation goes here
        let attr = AXAttribute::new(&CFString::new(&self.attribute_name));

        if let Ok(value) = element.0.attribute(&attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let string_value = cf_string.to_string();
                if string_value == self.attribute_value {
                    self.elements.push(element.clone());
                }
            }
        }

        TreeWalkerFlow::Continue
    }

    fn exit_element_impl(&mut self, _element: &ThreadSafeAXUIElement) {}
}

// Our concrete UIElement implementation for macOS
pub struct MacOSUIElement {
    element: ThreadSafeAXUIElement,
}

impl std::fmt::Debug for MacOSUIElement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacOSUIElement")
            .field("element", &self.element)
            .finish()
    }
}

impl UIElementImpl for MacOSUIElement {
    fn object_id(&self) -> usize {
        // Use the pointer address of the inner AXUIElement as a unique ID
        self.element.as_ref() as *const _ as usize
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn id(&self) -> Option<String> {
        // Try to get AXIdentifier if available
        let attr = AXAttribute::new(&CFString::new("AXIdentifier"));
        self.element.0.attribute(&attr).ok().and_then(|value| {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let string_value = cf_string.to_string();
                Some(string_value)
            } else {
                None
            }
        })
    }

    fn role(&self) -> String {
        self.element
            .0
            .role()
            .map(|r| r.to_string())
            .unwrap_or_default()
    }

    fn attributes(&self) -> UIElementAttributes {
        let mut properties = HashMap::new();

        // Collect all attributes from the element
        if let Ok(attr_names) = self.element.0.attribute_names() {
            for name in attr_names.iter() {
                let attr = AXAttribute::new(&name);
                if let Ok(value) = self.element.0.attribute(&attr) {
                    if let Some(cf_string) = value.downcast_into::<CFString>() {
                        let string_value = cf_string.to_string();
                        properties.insert(name.to_string(), string_value);
                    }
                }
            }
        }

        // Extract common attributes
        let role = self.role();
        let title = self.element.0.title().ok().map(|t| t.to_string());
        let value = properties.get("AXValue").cloned();
        let description = properties.get("AXDescription").cloned();

        UIElementAttributes {
            role,
            label: title,
            value,
            description,
            properties,
        }
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        // Regular child element traversal
        self.element
            .0
            .children()
            .map_err(|e| AutomationError::PlatformError(format!("Failed to get children: {}", e)))
            .map(|children| {
                children
                    .iter()
                    .map(|child| {
                        UIElement::new(Box::new(MacOSUIElement {
                            element: ThreadSafeAXUIElement::new(child.clone()),
                        }))
                    })
                    .collect()
            })
    }

    fn parent(&self) -> Result<Option<UIElement>, AutomationError> {
        // Get parent of this element
        let attr = AXAttribute::new(&CFString::new("AXParent"));

        match self.element.0.attribute(&attr) {
            Ok(value) => {
                if let Some(parent) = value.downcast::<AXUIElement>() {
                    Ok(Some(UIElement::new(Box::new(MacOSUIElement {
                        element: ThreadSafeAXUIElement::new(parent),
                    }))))
                } else {
                    Ok(None) // No parent
                }
            }
            Err(_) => Ok(None),
        }
    }

    fn bounds(&self) -> Result<(f64, f64, f64, f64), AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "bounds not yet implemented for macOS".to_string(),
        ))
    }

    fn click(&self) -> Result<(), AutomationError> {
        // Perform a click action on the element
        let press_attr = AXAttribute::new(&CFString::new("AXPress"));

        self.element
            .0
            .perform_action(&press_attr.as_CFString())
            .map_err(|e| AutomationError::PlatformError(format!("Failed to click element: {}", e)))
    }

    fn double_click(&self) -> Result<(), AutomationError> {
        // Not directly supported, so call click twice
        self.click()?;
        self.click()
    }

    fn right_click(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedOperation(
            "Right-click not yet implemented for macOS".to_string(),
        ))
    }

    fn hover(&self) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedOperation(
            "Hover not yet implemented for macOS".to_string(),
        ))
    }

    fn focus(&self) -> Result<(), AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "focus not yet implemented for macOS".to_string(),
        ))
    }

    fn type_text(&self, _text: &str) -> Result<(), AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "type_text not yet implemented for macOS".to_string(),
        ))
    }

    fn press_key(&self, _key: &str) -> Result<(), AutomationError> {
        Err(AutomationError::UnsupportedOperation(
            "press_key not yet implemented for macOS".to_string(),
        ))
    }

    fn get_text(&self) -> Result<String, AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "get_text not yet implemented for macOS".to_string(),
        ))
    }

    fn set_value(&self, _value: &str) -> Result<(), AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "set_value not yet implemented for macOS".to_string(),
        ))
    }

    fn is_enabled(&self) -> Result<bool, AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "is_enabled not yet implemented for macOS".to_string(),
        ))
    }

    fn is_visible(&self) -> Result<bool, AutomationError> {
        // There's no direct "visible" attribute, but we can approximate with bounds
        match self.bounds() {
            Ok((_, _, width, height)) => {
                // If element has non-zero size, it's probably visible
                Ok(width > 0.0 && height > 0.0)
            }
            Err(_) => {
                // If we can't get bounds, assume it's not visible
                Ok(false)
            }
        }
    }

    fn is_focused(&self) -> Result<bool, AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "is_focused not yet implemented for macOS".to_string(),
        ))
    }

    fn perform_action(&self, action: &str) -> Result<(), AutomationError> {
        // Perform a named action
        let action_attr = AXAttribute::new(&CFString::new(action));

        self.element
            .0
            .perform_action(&action_attr.as_CFString())
            .map_err(|e| {
                AutomationError::PlatformError(format!(
                    "Failed to perform action {}: {}",
                    action, e
                ))
            })
    }

    fn create_locator(&self, selector: Selector) -> Result<Locator, AutomationError> {
        // This is a non-generic implementation that can be used in trait objects
        Err(AutomationError::UnsupportedOperation(
            "locator not yet implemented for macOS".to_string(),
        ))
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(MacOSUIElement {
            element: self.element.clone(),
        })
    }
}
