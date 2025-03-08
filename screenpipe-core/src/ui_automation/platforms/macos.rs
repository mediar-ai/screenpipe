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

// Import the C function for setting attributes
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementSetAttributeValue(
        element: *mut ::std::os::raw::c_void,
        attribute: *const ::std::os::raw::c_void,
        value: *const ::std::os::raw::c_void,
    ) -> i32;
}

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
        let macos_roles = map_generic_role_to_macos_roles(role);
        debug!(
            target: "ui_automation",
            "Searching for elements with role={} (macOS roles={:?}) name={:?}",
            role, macos_roles, name
        );

        let mut all_elements = Vec::new();

        // Search for each possible macOS role
        let collector = ElementCollector::new(
            macos_roles
                .iter()
                .map(|r| r.as_str())
                .collect::<Vec<&str>>()
                .as_slice(),
            name,
        );
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
        all_elements.extend(collector.elements);

        debug!(
            target: "ui_automation",
            "Found {} elements with role '{}' (macOS roles={:?})",
            all_elements.len(),
            role,
            macos_roles
        );

        Ok(all_elements
            .into_iter()
            .map(|e| self.wrap_element(e))
            .collect())
    }
}

// Modified to return Vec<String> for multiple possible role matches
fn map_generic_role_to_macos_roles(role: &str) -> Vec<String> {
    match role.to_lowercase().as_str() {
        "window" => vec!["AXWindow".to_string()],
        "button" => vec![
            "AXButton".to_string(),
            "AXMenuItem".to_string(),
            "AXMenuBarItem".to_string(),
            "AXStaticText".to_string(), // Some text might be clickable buttons
            "AXImage".to_string(),      // Some images might be clickable buttons
        ], // Button can be any of these
        "checkbox" => vec!["AXCheckBox".to_string()],
        "menu" => vec!["AXMenu".to_string()],
        "menuitem" => vec!["AXMenuItem".to_string(), "AXMenuBarItem".to_string()], // Include both types
        "dialog" => vec!["AXSheet".to_string(), "AXDialog".to_string()], // macOS often uses Sheet or Dialog
        "text" | "textfield" | "input" | "textbox" => vec![
            "AXTextField".to_string(),
            "AXTextArea".to_string(),
            "AXText".to_string(),
            "AXComboBox".to_string(),
            "AXTextEdit".to_string(),
            "AXSearchField".to_string(),
            "AXWebArea".to_string(), // Web content might contain inputs
            "AXGroup".to_string(),   // Twitter uses groups that contain editable content
            "AXGenericElement".to_string(), // Generic elements that might be inputs
            "AXURIField".to_string(), // Explicit URL field type
            "AXAddressField".to_string(), // Another common name for URL fields
        ],
        // Add specific support for URL fields
        "url" | "urlfield" => vec![
            "AXTextField".to_string(),    // URL fields are often text fields
            "AXURIField".to_string(),     // Explicit URL field type
            "AXAddressField".to_string(), // Another common name for URL fields
        ],
        "list" => vec!["AXList".to_string()],
        "listitem" => vec!["AXCell".to_string()], // List items are often cells in macOS
        "combobox" => vec!["AXPopUpButton".to_string(), "AXComboBox".to_string()],
        "tab" => vec!["AXTabGroup".to_string()],
        "tabitem" => vec!["AXRadioButton".to_string()], // Tab items are sometimes radio buttons
        "toolbar" => vec!["AXToolbar".to_string()],

        _ => vec![role.to_string()], // Keep as-is for unknown roles
    }
}

fn macos_role_to_generic_role(role: &str) -> Vec<String> {
    match role.to_lowercase().as_str() {
        "AXWindow" => vec!["window".to_string()],
        "AXButton" | "AXMenuItem" | "AXMenuBarItem" => vec!["button".to_string()],
        "AXTextField" | "AXTextArea" | "AXTextEdit" | "AXSearchField" | "AXURIField"
        | "AXAddressField" => vec![
            "textfield".to_string(),
            "input".to_string(),
            "textbox".to_string(),
            "url".to_string(),
            "urlfield".to_string(),
        ],
        "AXList" => vec!["list".to_string()],
        "AXCell" => vec!["listitem".to_string()],
        "AXSheet" | "AXDialog" => vec!["dialog".to_string()],
        "AXGroup" | "AXGenericElement" | "AXWebArea" => {
            vec!["group".to_string(), "genericElement".to_string()]
        }
        _ => vec![role.to_string()],
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
                let macos_roles = map_generic_role_to_macos_roles(role);

                // Special case for URL fields
                if macos_roles.contains(&"AXTextField".to_string())
                    || macos_roles.contains(&"AXTextArea".to_string())
                    || macos_roles.contains(&"AXSearchField".to_string())
                    || macos_roles.contains(&"AXComboBox".to_string())
                    || macos_roles.contains(&"AXURIField".to_string())
                    || macos_roles.contains(&"AXAddressField".to_string())
                {
                    debug!(
                        target: "ui_automation",
                        "URL field selector detected, will search for URL input elements"
                    );

                    debug!(
                        target: "ui_automation",
                        "Button selector detected, will search for buttons and button-like elements"
                    );

                    // Always require a root element for searches to avoid searching the entire system
                    // If no root is provided, we'll just return an empty list instead of using system_wide
                    if root.is_none() {
                        debug!(
                            target: "ui_automation",
                            "No root element provided for button search, returning empty list to avoid system-wide search"
                        );
                        return Ok(Vec::new());
                    }

                    let root_ax_element = root.map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    });

                    let start_element = match root_ax_element {
                        Some(elem) => &elem.0,
                        // We should never reach this case due to the check above
                        None => return Ok(Vec::new()),
                    };

                    // First search for regular buttons
                    let collector = ElementCollector::new(
                        &[
                            "AXTextField",
                            "AXTextArea",
                            "AXSearchField",
                            "AXComboBox",
                            "AXURIField",
                            "AXAddressField",
                        ],
                        name.as_deref(),
                    );
                    let elements = collector.collect_elements(start_element);

                    debug!(
                        target: "ui_automation",
                        "Found {} AXTextField elements", elements.len()
                    );

                    // Convert the elements to UIElements
                    let ui_elements: Vec<UIElement> =
                        elements.into_iter().map(|e| self.wrap_element(e)).collect();

                    return Ok(ui_elements);
                }

                // Special case for buttons - directly search for menu items
                if macos_roles.contains(&"AXButton".to_string())
                    || macos_roles.contains(&"AXMenuItem".to_string())
                    || macos_roles.contains(&"AXMenuBarItem".to_string())
                {
                    debug!(
                        target: "ui_automation",
                        "Button selector detected, will search for buttons and button-like elements"
                    );

                    // Always require a root element for searches to avoid searching the entire system
                    // If no root is provided, we'll just return an empty list instead of using system_wide
                    if root.is_none() {
                        debug!(
                            target: "ui_automation",
                            "No root element provided for button search, returning empty list to avoid system-wide search"
                        );
                        return Ok(Vec::new());
                    }

                    let root_ax_element = root.map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    });

                    let start_element = match root_ax_element {
                        Some(elem) => &elem.0,
                        // We should never reach this case due to the check above
                        None => return Ok(Vec::new()),
                    };

                    // First search for regular buttons
                    let collector = ElementCollector::new(
                        &[
                            "AXButton",
                            "AXMenuItem",
                            "AXMenuBarItem",
                            "AXTextField",
                            "AXTextArea",
                        ],
                        name.as_deref(),
                    );
                    let elements = collector.collect_elements(start_element);

                    debug!(
                        target: "ui_automation",
                        "Found {} AXButton elements", elements.len()
                    );

                    // Convert the elements to UIElements
                    let ui_elements: Vec<UIElement> =
                        elements.into_iter().map(|e| self.wrap_element(e)).collect();

                    return Ok(ui_elements);
                }

                // Special handling for window search
                if macos_roles.contains(&"AXWindow".to_string()) && root.is_some() {
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
                                        let is_window = macos_roles.contains(&attrs.role);

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
    target_roles: Vec<String>,
    target_name: Option<String>,
    elements: Vec<ThreadSafeAXUIElement>,
}

impl ElementCollector {
    fn new(roles: &[&str], name: Option<&str>) -> Self {
        Self {
            target_roles: roles.iter().map(|r| r.to_string()).collect(),
            target_name: name.map(|s| s.to_string()),
            elements: Vec::new(),
        }
    }

    fn adapter(&self) -> ElementCollectorAdapter {
        ElementCollectorAdapter {
            inner: RefCell::new(ElementCollector {
                target_roles: self.target_roles.clone(),
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

                if self.target_roles.contains(&role_value) {
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
                if self.target_roles.contains(&subrole_value)
                    || (self.target_roles.contains(&"AXButton".to_string())
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

    fn collect_elements(&self, root: &AXUIElement) -> Vec<ThreadSafeAXUIElement> {
        let adapter = self.adapter();
        let walker = TreeWalker::new();
        walker.walk(root, &adapter);

        // Extract the collected elements from the adapter's inner RefCell
        let elements = adapter.inner.borrow().elements.clone();
        elements
    }
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

impl MacOSUIElement {
    // Helper function to get the containing application
    fn get_application(&self) -> Option<MacOSUIElement> {
        let attr = AXAttribute::new(&CFString::new("AXTopLevelUIElement"));
        match self.element.0.attribute(&attr) {
            Ok(value) => {
                if let Some(app) = value.downcast::<AXUIElement>() {
                    Some(MacOSUIElement {
                        element: ThreadSafeAXUIElement::new(app),
                    })
                } else {
                    None
                }
            }
            Err(_) => None,
        }
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
        // Get the actual role
        let role = self
            .element
            .0
            .role()
            .map(|r| r.to_string())
            .unwrap_or_default();

        debug!(target: "ui_automation", "Original role from AXUIElement: {}", role);

        // Map macOS-specific roles to generic roles
        // TODO: why first? any issue?
        macos_role_to_generic_role(&role)
            .first()
            .unwrap_or(&role)
            .to_string()
    }

    fn attributes(&self) -> UIElementAttributes {
        let properties = HashMap::new();

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
            // Use our role() method which handles the mapping of AXMenuItem to button
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
        // Implement proper focus functionality using AXUIElementPerformAction with the "AXRaise" action
        // or by setting it as the AXFocusedUIElement of its parent window

        // First try using the AXRaise action
        let raise_attr = AXAttribute::new(&CFString::new("AXRaise"));
        if let Ok(_) = self.element.0.perform_action(&raise_attr.as_CFString()) {
            debug!(target: "ui_automation", "Successfully raised element");

            // Now try to directly focus the element
            // Get the application element
            if let Some(app) = self.get_application() {
                // Set the focused element
                unsafe {
                    let app_ref =
                        app.element.0.as_concrete_TypeRef() as *mut ::std::os::raw::c_void;
                    let attr_str = CFString::new("AXFocusedUIElement");
                    let attr_str_ref =
                        attr_str.as_concrete_TypeRef() as *const ::std::os::raw::c_void;
                    let elem_ref =
                        self.element.0.as_concrete_TypeRef() as *const ::std::os::raw::c_void;

                    let result = AXUIElementSetAttributeValue(app_ref, attr_str_ref, elem_ref);
                    if result == 0 {
                        debug!(target: "ui_automation", "Successfully set focus to element");
                        return Ok(());
                    } else {
                        debug!(
                            target: "ui_automation",
                            "Failed to set element as focused: error code {}", result
                        );
                    }
                }
            }
        }

        // If we can't use AXRaise or set focus directly, try to click the element
        // which often gives it focus as a side effect
        debug!(target: "ui_automation", "Attempting to focus by clicking the element");
        self.click()
    }

    fn type_text(&self, text: &str) -> Result<(), AutomationError> {
        // First, try to focus the element, but continue even if focus fails for web inputs
        match self.focus() {
            Ok(_) => debug!(target: "ui_automation", "Successfully focused element for typing"),
            Err(e) => {
                debug!(target: "ui_automation", "Focus failed, but continuing with type_text: {:?}", e);
                // Click the element, which is often needed for web inputs
                if let Err(click_err) = self.click() {
                    debug!(target: "ui_automation", "Click also failed: {:?}", click_err);
                }
            }
        }

        // Check if this is a web input by examining the role
        let is_web_input = {
            let role = self.role().to_lowercase();
            role.contains("web") || role.contains("generic")
        };

        // For web inputs, we might need a different approach
        if is_web_input {
            debug!(target: "ui_automation", "Detected web input, using specialized handling");

            // Try different attribute names that web inputs might use
            for attr_name in &["AXValue", "AXValueAttribute", "AXText"] {
                let cf_string = CFString::new(text);
                unsafe {
                    let element_ref =
                        self.element.0.as_concrete_TypeRef() as *mut ::std::os::raw::c_void;
                    let attr_str = CFString::new(attr_name);
                    let attr_str_ref =
                        attr_str.as_concrete_TypeRef() as *const ::std::os::raw::c_void;
                    let value_ref =
                        cf_string.as_concrete_TypeRef() as *const ::std::os::raw::c_void;

                    let result = AXUIElementSetAttributeValue(element_ref, attr_str_ref, value_ref);
                    if result == 0 {
                        debug!(target: "ui_automation", "Successfully set text using {}", attr_name);
                        return Ok(());
                    }
                }
            }
        }

        // Standard approach for native controls
        // Create a CFString from the input text
        let cf_string = CFString::new(text);

        // Set the value of the element using direct AXUIElementSetAttributeValue call
        unsafe {
            let element_ref = self.element.0.as_concrete_TypeRef() as *mut ::std::os::raw::c_void;
            let attr_str = CFString::new("AXValue");
            let attr_str_ref = attr_str.as_concrete_TypeRef() as *const ::std::os::raw::c_void;
            let value_ref = cf_string.as_concrete_TypeRef() as *const ::std::os::raw::c_void;

            let result = AXUIElementSetAttributeValue(element_ref, attr_str_ref, value_ref);

            if result != 0 {
                debug!(
                    target: "ui_automation",
                    "Failed to set text value via AXValue: error code {}", result
                );

                return Err(AutomationError::PlatformError(format!(
                    "Failed to set text: error code {}",
                    result
                )));
            }
        }

        Ok(())
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

    fn set_value(&self, value: &str) -> Result<(), AutomationError> {
        // This is essentially the same implementation as type_text for macOS,
        // as both rely on setting the AXValue attribute

        // Create a CFString from the input value
        let cf_string = CFString::new(value);

        // Set the value of the element using direct AXUIElementSetAttributeValue call
        unsafe {
            let element_ref = self.element.0.as_concrete_TypeRef() as *mut ::std::os::raw::c_void;
            let attr_str = CFString::new("AXValue");
            let attr_str_ref = attr_str.as_concrete_TypeRef() as *const ::std::os::raw::c_void;
            let value_ref = cf_string.as_concrete_TypeRef() as *const ::std::os::raw::c_void;

            let result = AXUIElementSetAttributeValue(element_ref, attr_str_ref, value_ref);

            if result != 0 {
                debug!(
                    target: "ui_automation",
                    "Failed to set value via AXValue: error code {}", result
                );

                return Err(AutomationError::PlatformError(format!(
                    "Failed to set value: error code {}",
                    result
                )));
            }
        }

        Ok(())
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
            let macos_roles = map_generic_role_to_macos_roles(role);
            if macos_roles.contains(&"AXWindow".to_string()) {
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
