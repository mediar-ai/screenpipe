use crate::ui_automation::platforms::AccessibilityEngine;
use crate::ui_automation::{
    element::UIElementImpl, AutomationError, Locator, Selector, UIElement, UIElementAttributes,
};

use accessibility::AXUIElementAttributes;
use accessibility::{AXAttribute, AXUIElement, TreeVisitor, TreeWalker, TreeWalkerFlow};
use anyhow::Result;
use core_foundation::array::CFArray;
use core_foundation::{
    base::TCFType, boolean::CFBoolean, dictionary::CFDictionary, string::CFString,
};
use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use tracing::{debug, trace};

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

    pub fn clone(&self) -> Self {
        Self(self.0.clone())
    }

    // Helper method to debug this element
    pub fn debug_info(&self) -> String {
        let mut info = String::new();

        // Try to get role
        match self.0.role() {
            Ok(role) => info.push_str(&format!("Role: {}, ", role)),
            Err(e) => info.push_str(&format!("Role error: {:?}, ", e)),
        }

        // Try to get title
        match self.0.title() {
            Ok(title) => info.push_str(&format!("Title: {}, ", title)),
            Err(e) => info.push_str(&format!("Title error: {:?}, ", e)),
        }

        // Try to get description
        let desc_attr = AXAttribute::new(&CFString::new("AXDescription"));
        match self.0.attribute(&desc_attr) {
            Ok(value) => {
                if let Some(cf_string) = value.downcast_into::<CFString>() {
                    info.push_str(&format!("Description: {}", cf_string));
                } else {
                    info.push_str("Description: <non-string>");
                }
            }
            Err(e) => info.push_str(&format!("Description error: {:?}", e)),
        }

        info
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
        // Try to check element validity
        let is_valid = match ax_element.0.role() {
            Ok(_) => true,
            Err(e) => {
                debug!(target: "ui_automation", "Warning: Potentially invalid AXUIElement: {:?}", e);
                false
            }
        };

        if !is_valid {
            debug!(target: "ui_automation", "Warning: Wrapping possibly invalid AXUIElement");
        }

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
    ) -> Result<Vec<UIElement>, AutomationError> {
        let macos_role = map_generic_role_to_macos_role(role);
        debug!(
            target: "ui_automation",
            "Searching for elements with role={} (macOS role={}) name={:?}",
            role, macos_role, name
        );

        let collector = ElementCollector::new(&macos_role, name);
        let walker = TreeWalker::new();

        let start_element = match root {
            Some(elem) => {
                debug!(target: "ui_automation", "Starting tree walk from provided root element");
                &elem.0
            }
            None => {
                debug!(target: "ui_automation", "Starting tree walk from system_wide element");
                &self.system_wide.0
            }
        };

        walker.walk(start_element, &collector.adapter());

        debug!(
            target: "ui_automation",
            "Found {} elements with role '{}' (macOS role={})",
            collector.elements.len(),
            role,
            macos_role
        );

        Ok(collector
            .elements
            .into_iter()
            .map(|e| self.wrap_element(e))
            .collect())
    }
}

// Add this function to map generic roles to macOS-specific roles
fn map_generic_role_to_macos_role(role: &str) -> String {
    match role.to_lowercase().as_str() {
        "window" => "AXWindow".to_string(),
        "button" => "AXButton".to_string(),
        "checkbox" => "AXCheckBox".to_string(),
        "menu" => "AXMenu".to_string(),
        "menuitem" => "AXMenuItem".to_string(),
        "dialog" => "AXSheet".to_string(), // macOS often uses Sheet for dialogs
        "text" | "textfield" => "AXTextField".to_string(),
        "list" => "AXList".to_string(),
        "listitem" => "AXCell".to_string(), // List items are often cells in macOS
        "combobox" => "AXPopUpButton".to_string(),
        "tab" => "AXTabGroup".to_string(),
        "tabitem" => "AXRadioButton".to_string(), // Tab items are sometimes radio buttons
        _ => role.to_string(),                    // Keep as-is for unknown roles
    }
}

// Helper function to get PIDs of running applications using NSWorkspace
#[allow(clippy::all)]
fn get_running_application_pids() -> Result<Vec<i32>, AutomationError> {
    // Implementation using Objective-C bridging
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};

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
            if activation_policy == 2 || activation_policy == 1 {
                // NSApplicationActivationPolicyProhibited or NSApplicationActivationPolicyAccessory
                continue;
            }

            let pid: i32 = msg_send![app, processIdentifier];
            pids.push(pid);
        }

        debug!(target: "ui_automation", "Found {} application PIDs", pids.len());
        Ok(pids)
    }
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
        // Get all applications first, then filter by name
        let apps = self.get_applications()?;

        debug!(target: "ui_automation", "Searching for application '{}' among {} applications", name, apps.len());

        // Look for an application with a matching name
        for app in apps {
            let app_name = app.attributes().label.unwrap_or_default();
            debug!(target: "ui_automation", "Checking application: '{}'", app_name);

            // Case-insensitive comparison since macOS app names might have different casing
            if app_name.to_lowercase() == name.to_lowercase() {
                debug!(target: "ui_automation", "Found matching application: '{}'", app_name);
                return Ok(app);
            }
        }

        // No matching application found
        Err(AutomationError::ElementNotFound(format!(
            "Application '{}' not found",
            name
        )))
    }

    fn find_elements(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError> {
        // Regular element finding logic
        match selector {
            Selector::Role { role, name } => {
                let macos_role = map_generic_role_to_macos_role(role);
                // Special handling for window search
                if macos_role == "AXWindow" && root.is_some() {
                    if let Some(app_elem) = root {
                        if let Some(macos_app) = app_elem.as_any().downcast_ref::<MacOSUIElement>()
                        {
                            // Try to get windows by directly calling children()
                            if let Ok(children) = macos_app.children() {
                                // Filter the children to find windows
                                let windows = children
                                    .into_iter()
                                    .filter(|child| {
                                        let attrs = child.attributes();
                                        let is_window = attrs.role == "AXWindow";

                                        if !is_window {
                                            return false;
                                        }

                                        // If name filter is specified, check for match
                                        if let Some(filter) = name.as_ref() {
                                            return attrs
                                                .label
                                                .as_ref()
                                                .map(|label| {
                                                    label
                                                        .to_lowercase()
                                                        .contains(&filter.to_lowercase())
                                                })
                                                .unwrap_or(false);
                                        }

                                        // No name filter, accept all windows
                                        true
                                    })
                                    .collect();

                                return Ok(windows);
                            }
                        }
                    }
                }

                // Fall back to regular role search
                let root_ax_element = root.map(|el| {
                    if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                        &macos_el.element
                    } else {
                        panic!("Root element is not a macOS element")
                    }
                });

                self.find_by_role(role, name.as_deref(), root_ax_element)
            }
            Selector::Id(id) => {
                // Try to find by AXIdentifier
                let collector = ElementCollectorByAttribute::new("AXIdentifier", id);
                let walker = TreeWalker::new();

                let start_element = root
                    .map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element.0
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    })
                    .unwrap_or(&self.system_wide.0);

                walker.walk(start_element, &collector.adapter());

                Ok(collector
                    .elements
                    .into_iter()
                    .map(|e| self.wrap_element(e))
                    .collect())
            }
            Selector::Name(name) => {
                // Try to find by AXTitle or AXDescription
                let collector = ElementCollectorByAttribute::new("AXTitle", &name);
                let walker = TreeWalker::new();

                let start_element = root
                    .map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element.0
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    })
                    .unwrap_or(&self.system_wide.0);

                walker.walk(start_element, &collector.adapter());

                Ok(collector
                    .elements
                    .into_iter()
                    .map(|e| self.wrap_element(e))
                    .collect())
            }
            Selector::Text(text) => {
                // Try to find by AXValue
                let collector = ElementCollectorByAttribute::new("AXValue", &text);
                let walker = TreeWalker::new();

                let start_element = root
                    .map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element.0
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    })
                    .unwrap_or(&self.system_wide.0);

                walker.walk(start_element, &collector.adapter());

                Ok(collector
                    .elements
                    .into_iter()
                    .map(|e| self.wrap_element(e))
                    .collect())
            }
            Selector::Attributes(attrs) => {
                // Search by multiple attributes not yet fully implemented
                // For now, just use the first attribute
                if let Some((name, value)) = attrs.iter().next() {
                    let collector = ElementCollectorByAttribute::new(name, value);
                    let walker = TreeWalker::new();

                    let start_element = root
                        .map(|el| {
                            if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                                &macos_el.element.0
                            } else {
                                panic!("Root element is not a macOS element")
                            }
                        })
                        .unwrap_or(&self.system_wide.0);

                    walker.walk(start_element, &collector.adapter());

                    Ok(collector
                        .elements
                        .into_iter()
                        .map(|e| self.wrap_element(e))
                        .collect())
                } else {
                    Ok(Vec::new())
                }
            }
            Selector::Path(_) => {
                // XPath/Path not yet implemented
                Err(AutomationError::UnsupportedOperation(
                    "Path selector not implemented".to_string(),
                ))
            }
            _ => {
                // For more complex selectors, we'll mark as unimplemented for now
                Err(AutomationError::UnsupportedOperation(
                    "Complex selector not implemented".to_string(),
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
        std::ptr::addr_of!(*(self.element.0)) as usize
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn id(&self) -> Option<String> {
        let id_attr = AXAttribute::new(&CFString::new("AXIdentifier"));
        match self.element.0.attribute(&id_attr) {
            Ok(value) => value.downcast_into::<CFString>().map(|s| s.to_string()),
            Err(_) => None,
        }
    }

    fn role(&self) -> String {
        // First, check if this is a window to handle special case
        let is_window = self
            .element
            .0
            .role()
            .map_or(false, |r| r.to_string() == "AXWindow");

        if is_window {
            return "window".to_string();
        }

        self.element
            .0
            .role()
            .map(|r| r.to_string())
            .unwrap_or_default()
    }

    fn attributes(&self) -> UIElementAttributes {
        let mut properties = HashMap::new();

        // Check if this is a window element first
        let is_window = self
            .element
            .0
            .role()
            .map_or(false, |r| r.to_string() == "AXWindow");

        // Special case for windows
        if is_window {
            debug!(target: "ui_automation", "Getting attributes for window element");

            let mut attrs = UIElementAttributes {
                role: "window".to_string(),
                label: None,
                value: None,
                description: None,
                properties,
            };

            // Special handling for window title - try multiple attributes
            let title_attrs = [
                "AXTitle",
                "AXTitleUIElement",
                "AXDocument",
                "AXFilename",
                "AXName",
            ];

            for title_attr_name in title_attrs {
                let title_attr = AXAttribute::new(&CFString::new(title_attr_name));
                if let Ok(value) = self.element.0.attribute(&title_attr) {
                    if let Some(cf_string) = value.downcast_into::<CFString>() {
                        attrs.label = Some(cf_string.to_string());
                        debug!(target: "ui_automation", "Found window title via {}: {:?}", title_attr_name, attrs.label);
                        break;
                    }
                }
            }

            // Try to get window position and size for debugging
            let pos_attr = AXAttribute::new(&CFString::new("AXPosition"));
            if let Ok(_) = self.element.0.attribute(&pos_attr) {
                debug!(target: "ui_automation", "Window has position attribute");
            }

            // Try to get standard macOS window attributes
            let std_attrs = ["AXMinimized", "AXMain", "AXFocused"];

            for attr_name in std_attrs {
                let attr = AXAttribute::new(&CFString::new(attr_name));
                if let Ok(value) = self.element.0.attribute(&attr) {
                    if let Some(cf_bool) = value.downcast_into::<CFBoolean>() {
                        attrs
                            .properties
                            .insert(attr_name.to_string(), format!("{:?}", cf_bool));
                    }
                }
            }

            return attrs;
        }

        // For non-window elements, use standard attribute retrieval
        let mut attrs = UIElementAttributes {
            role: self.role(),
            label: None,
            value: None,
            description: None,
            properties,
        };

        // Debug attribute collection
        debug!(target: "ui_automation", "Collecting attributes for element");

        // Directly try common macOS attributes one by one
        let label_attr = AXAttribute::new(&CFString::new("AXTitle"));
        match self.element.0.attribute(&label_attr) {
            Ok(value) => {
                if let Some(cf_string) = value.downcast_into::<CFString>() {
                    attrs.label = Some(cf_string.to_string());
                    debug!(target: "ui_automation", "Found AXTitle: {:?}", attrs.label);
                }
            }
            Err(e) => {
                debug!(target: "ui_automation", "Error getting AXTitle: {:?}", e);

                // Fallback to AXLabel if AXTitle fails
                let alt_label_attr = AXAttribute::new(&CFString::new("AXLabel"));
                if let Ok(value) = self.element.0.attribute(&alt_label_attr) {
                    if let Some(cf_string) = value.downcast_into::<CFString>() {
                        attrs.label = Some(cf_string.to_string());
                        debug!(target: "ui_automation", "Found AXLabel: {:?}", attrs.label);
                    }
                }
            }
        }

        // Try to get description
        let desc_attr = AXAttribute::new(&CFString::new("AXDescription"));
        match self.element.0.attribute(&desc_attr) {
            Ok(value) => {
                if let Some(cf_string) = value.downcast_into::<CFString>() {
                    attrs.description = Some(cf_string.to_string());
                    debug!(target: "ui_automation", "Found AXDescription: {:?}", attrs.description);
                }
            }
            Err(e) => {
                debug!(target: "ui_automation", "Error getting AXDescription: {:?}", e);
            }
        }

        // Collect all other attributes
        if let Ok(attr_names) = self.element.0.attribute_names() {
            debug!(target: "ui_automation", "Found {} attributes", attr_names.len());

            for name in attr_names.iter() {
                let attr = AXAttribute::new(&name);
                match self.element.0.attribute(&attr) {
                    Ok(value) => {
                        // Try to convert to string for display
                        if let Some(cf_string) = value.downcast_into::<CFString>() {
                            attrs
                                .properties
                                .insert(name.to_string(), cf_string.to_string());
                        } else {
                            attrs
                                .properties
                                .insert(name.to_string(), "<non-string value>".to_string());
                        }
                    }
                    Err(e) => {
                        debug!(target: "ui_automation", "Error getting attribute {:?}: {:?}", name, e);
                    }
                }
            }
        } else {
            debug!(target: "ui_automation", "Failed to get attribute names");
        }

        attrs
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
        // Try multiple possible attributes that might contain text

        // First try AXValue (commonly used for text fields, text areas)
        let value_attr = AXAttribute::new(&CFString::new("AXValue"));
        if let Ok(value) = self.element.0.attribute(&value_attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let text = cf_string.to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }
        }

        // Then try AXTitle (commonly used for labels, buttons)
        let title_attr = AXAttribute::new(&CFString::new("AXTitle"));
        if let Ok(value) = self.element.0.attribute(&title_attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let text = cf_string.to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }
        }

        // Try AXDescription (commonly used for more detailed descriptions)
        let desc_attr = AXAttribute::new(&CFString::new("AXDescription"));
        if let Ok(value) = self.element.0.attribute(&desc_attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let text = cf_string.to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }
        }

        // If none of the above contain text, return an empty string
        // This is more useful than an error as many valid UI elements might not have text
        Ok(String::new())
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
        // Get the platform-specific instance of the engine
        let engine = MacOSEngine::new()?;

        // Add some debug output to understand the current element
        let attrs = self.attributes();
        debug!(target: "ui_automation", "Creating locator for element: role={}, label={:?}", attrs.role, attrs.label);

        // Special handling for window searches which can be tricky
        if let Selector::Role { role, name } = &selector {
            let macos_role = map_generic_role_to_macos_role(role);
            if macos_role == "AXWindow" {
                debug!(target: "ui_automation", "Special handling for AXWindow search");

                // When looking for windows, we might need to first get the application
                if attrs.role == "AXApplication" {
                    // Use the predefined AXAttribute for windows
                    let windows_attr: AXAttribute<CFArray<AXUIElement>> =
                        accessibility::AXAttribute::<()>::windows();
                    match self.element.0.attribute(&windows_attr) {
                        Ok(windows_value) => {
                            let mut windows = Vec::new();
                            debug!(target: "ui_automation", "Found windows array with {} windows", windows_value.len());

                            // Simplest approach: just get children directly from the app
                            if let Ok(children) = self.children() {
                                for child in children {
                                    let attrs = child.attributes();
                                    if attrs.role == "window" {
                                        // If name filter is provided, check for match
                                        if let Some(name_filter) = name {
                                            if let Some(title) = &attrs.label {
                                                if title
                                                    .to_lowercase()
                                                    .contains(&name_filter.to_lowercase())
                                                {
                                                    debug!(target: "ui_automation", "Found matching window with title: {:?}", title);
                                                    windows.push(child);
                                                }
                                            }
                                        } else {
                                            // No name filter, add all windows
                                            windows.push(child);
                                        }
                                    }
                                }
                            }

                            debug!(target: "ui_automation", "Found {} windows", windows.len());

                            let engine = WindowsEngine { windows };
                            return Ok(Locator::new(std::sync::Arc::new(engine), selector.clone()));
                        }
                        Err(e) => {
                            debug!(target: "ui_automation", "Failed to get AXWindows attribute: {:?}, falling back to standard search", e);
                            // Fall back to the standard approach
                        }
                    }
                }
            }
        }

        // Create a new locator with this element as root
        let self_element = UIElement::new(Box::new(MacOSUIElement {
            element: self.element.clone(),
        }));

        // Create a locator for the selector with the engine, then set root to this element
        let locator = Locator::new(std::sync::Arc::new(engine), selector).within(self_element);

        Ok(locator)
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(MacOSUIElement {
            element: self.element.clone(),
        })
    }
}

// Create a custom WindowsEngine to handle window-related operations
struct WindowsEngine {
    windows: Vec<UIElement>,
}

impl AccessibilityEngine for WindowsEngine {
    fn get_root_element(&self) -> UIElement {
        if !self.windows.is_empty() {
            self.windows[0].clone()
        } else {
            panic!("No windows available")
        }
    }

    fn get_element_by_id(&self, id: &str) -> Result<UIElement, AutomationError> {
        Err(AutomationError::ElementNotFound(format!(
            "Element with id {} not found",
            id
        )))
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedOperation(
            "Not implemented".to_string(),
        ))
    }

    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        Err(AutomationError::UnsupportedOperation(
            "Not implemented".to_string(),
        ))
    }

    fn get_application_by_name(&self, _name: &str) -> Result<UIElement, AutomationError> {
        Err(AutomationError::UnsupportedOperation(
            "Not implemented".to_string(),
        ))
    }

    fn find_elements(
        &self,
        selector: &Selector,
        _root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError> {
        // Return all windows when asked for windows
        if let Selector::Role { role, name: _ } = selector {
            if role == "window" {
                return Ok(self.windows.clone());
            }
        }

        // For other selectors, search within windows
        let mut results = Vec::new();
        for window in &self.windows {
            if let Ok(children) = window.children() {
                for child in children {
                    // Basic filtering based on role/name/attr matching
                    if let Selector::Role { role, name } = selector {
                        let attrs = child.attributes();
                        if attrs.role.to_lowercase() == role.to_lowercase() {
                            // Check name match if specified
                            if let Some(filter) = name {
                                if let Some(label) = &attrs.label {
                                    if label.to_lowercase().contains(&filter.to_lowercase()) {
                                        results.push(child);
                                    }
                                }
                            } else {
                                // No name filter, add all matching roles
                                results.push(child);
                            }
                        }
                    }
                }
            }
        }

        Ok(results)
    }
}
