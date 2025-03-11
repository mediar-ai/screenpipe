use crate::operator::platforms::AccessibilityEngine;
use crate::operator::tree_search::{ElementFinderWithWindows, TreeWalkerWithWindows};
use crate::operator::{
    element::UIElementImpl, AutomationError, Locator, Selector, UIElement, UIElementAttributes,
};

use accessibility::AXUIElementAttributes;
use accessibility::{AXAttribute, AXUIElement};
use anyhow::Result;
use core_foundation::array::{
    CFArrayGetCount, CFArrayGetTypeID, CFArrayGetValueAtIndex, __CFArray,
};
use core_foundation::base::{CFGetTypeID, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::CFString;
use core_graphics::display::{CGPoint, CGSize};
use serde_json::{self, Value};
use std::collections::{HashMap, HashSet, VecDeque};
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

// Add these extern "C" declarations if not already present
extern "C" {
    fn AXValueGetValue(
        value: *const ::std::os::raw::c_void,
        type_: u32,
        out: *mut ::std::os::raw::c_void,
    ) -> i32;
}

// Add these constant definitions instead - these are the official values from Apple's headers
const K_AXVALUE_CGPOINT_TYPE: u32 = 1;
const K_AXVALUE_CGSIZE_TYPE: u32 = 2;

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
    use_background_apps: bool,
    activate_app: bool,
}

impl MacOSEngine {
    pub fn new(use_background_apps: bool, activate_app: bool) -> Result<Self, AutomationError> {
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
            use_background_apps,
            activate_app,
        })
    }

    // Helper to convert ThreadSafeAXUIElement to our UIElement
    fn wrap_element(&self, ax_element: ThreadSafeAXUIElement) -> UIElement {
        // Try to check element validity
        let is_valid = match ax_element.0.role() {
            Ok(_) => true,
            Err(e) => {
                debug!(target: "operator", "Warning: Potentially invalid AXUIElement: {:?}", e);
                false
            }
        };

        if !is_valid {
            debug!(target: "operator", "Warning: Wrapping possibly invalid AXUIElement");
        }

        UIElement::new(Box::new(MacOSUIElement {
            element: ax_element,
            use_background_apps: self.use_background_apps,
            activate_app: self.activate_app,
        }))
    }

    // Add this new method to refresh the accessibility tree
    pub fn refresh_accessibility_tree(
        &self,
        app_name: Option<&str>,
    ) -> Result<(), AutomationError> {
        if !self.activate_app {
            return Ok(());
        }

        debug!(target: "operator", "Refreshing accessibility tree");

        // If app name is provided, try to activate that app first
        if let Some(name) = app_name {
            unsafe {
                use objc::{class, msg_send, sel, sel_impl};

                let workspace_class = class!(NSWorkspace);
                let shared_workspace: *mut objc::runtime::Object =
                    msg_send![workspace_class, sharedWorkspace];
                let apps: *mut objc::runtime::Object =
                    msg_send![shared_workspace, runningApplications];
                let count: usize = msg_send![apps, count];

                for i in 0..count {
                    let app: *mut objc::runtime::Object = msg_send![apps, objectAtIndex:i];
                    let app_name_obj: *mut objc::runtime::Object = msg_send![app, localizedName];

                    if !app_name_obj.is_null() {
                        let app_name_str: &str = {
                            let nsstring = app_name_obj as *const objc::runtime::Object;
                            let bytes: *const std::os::raw::c_char =
                                msg_send![nsstring, UTF8String];
                            let len: usize = msg_send![nsstring, lengthOfBytesUsingEncoding:4]; // NSUTF8StringEncoding = 4
                            let bytes_slice = std::slice::from_raw_parts(bytes as *const u8, len);
                            std::str::from_utf8_unchecked(bytes_slice)
                        };

                        if app_name_str.to_lowercase() == name.to_lowercase() {
                            // Found the app, activate it
                            let _: () = msg_send![app, activateWithOptions:1]; // NSApplicationActivateIgnoringOtherApps = 1
                            debug!(target: "operator", "Activated application: {}", name);

                            // Give the system a moment to update
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            break;
                        }
                    }
                }
            }
        }

        // Force a refresh of the system-wide element
        // This is a bit of a hack, but querying the system-wide element
        // can force the accessibility API to refresh its cache
        let _ = self.system_wide.0.attribute_names();

        Ok(())
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
            "AXStaticText".to_string(), // Static text fields
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
fn get_running_application_pids(use_background_apps: bool) -> Result<Vec<i32>, AutomationError> {
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

            if !use_background_apps {
                let activation_policy: i32 = msg_send![app, activationPolicy];
                // NSApplicationActivationPolicyRegular = 0
                // NSApplicationActivationPolicyAccessory = 1
                // NSApplicationActivationPolicyProhibited = 2 (background only)
                if activation_policy == 2 || activation_policy == 1 {
                    // NSApplicationActivationPolicyProhibited or NSApplicationActivationPolicyAccessory
                    continue;
                }
            }
            // Filter out common background workers by bundle identifier
            let bundle_id: *mut objc::runtime::Object = msg_send![app, bundleIdentifier];
            if !bundle_id.is_null() {
                let bundle_id_str: &str = {
                    let nsstring = bundle_id as *const objc::runtime::Object;
                    let bytes: *const std::os::raw::c_char = msg_send![nsstring, UTF8String];
                    let len: usize = msg_send![nsstring, lengthOfBytesUsingEncoding:4]; // NSUTF8StringEncoding = 4
                    let bytes_slice = std::slice::from_raw_parts(bytes as *const u8, len);
                    std::str::from_utf8_unchecked(bytes_slice)
                };

                // Skip common background processes and workers
                if bundle_id_str.contains(".worker")
                    || bundle_id_str.contains("com.apple.WebKit")
                    || bundle_id_str.contains("com.apple.CoreServices")
                    || bundle_id_str.contains(".helper")
                    || bundle_id_str.contains(".agent")
                {
                    debug!(target: "operator", "Filtered out background worker: {}", bundle_id_str);
                    continue;
                }
            }

            let pid: i32 = msg_send![app, processIdentifier];
            pids.push(pid);
        }

        debug!(target: "operator", "Found {} application PIDs", pids.len());
        Ok(pids)
    }
}

impl AccessibilityEngine for MacOSEngine {
    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        // Get running application PIDs using NSWorkspace
        let pids = get_running_application_pids(self.use_background_apps)?;

        debug!(target: "operator", "Found {} running applications", pids.len());

        // Create AXUIElements for each application
        let mut app_elements = Vec::new();
        for pid in pids {
            trace!(target: "operator", "Creating AXUIElement for application with PID: {}", pid);
            let app_element = ThreadSafeAXUIElement::application(pid);

            app_elements.push(self.wrap_element(app_element));
        }

        Ok(app_elements)
    }
    fn get_root_element(&self) -> UIElement {
        self.wrap_element(self.system_wide.clone())
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        // not implemented
        Err(AutomationError::UnsupportedOperation(
            "get_focused_element not yet implemented for macOS".to_string(),
        ))
    }

    fn get_application_by_name(&self, name: &str) -> Result<UIElement, AutomationError> {
        // Refresh the accessibility tree before searching
        self.refresh_accessibility_tree(Some(name))?;

        // Get all applications first, then filter by name
        let apps = self.get_applications()?;

        debug!(target: "operator", "Searching for application '{}' among {} applications", name, apps.len());

        // Look for an application with a matching name
        for app in apps {
            let app_name = app.attributes().label.unwrap_or_default();
            debug!(target: "operator", "Checking application: '{}'", app_name);

            // Case-insensitive comparison since macOS app names might have different casing
            if app_name.to_lowercase() == name.to_lowercase() {
                debug!(target: "operator", "Found matching application: '{}'", app_name);
                return Ok(app);
            }
        }

        // No matching application found
        Err(AutomationError::ElementNotFound(format!(
            "Application '{}' not found",
            name
        )))
    }

    fn find_element(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<UIElement, AutomationError> {
        // If we have a root element that's an application, refresh the tree for that app
        if let Some(root_elem) = root {
            if let Some(macos_el) = root_elem.as_any().downcast_ref::<MacOSUIElement>() {
                if macos_el
                    .element
                    .0
                    .role()
                    .map_or(false, |r| r.to_string() == "AXApplication")
                {
                    if let Some(app_name) = root_elem.attributes().label {
                        self.refresh_accessibility_tree(Some(&app_name))?;
                    }
                }
            }
        }

        let start_element = root
            .map(|el| {
                if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                    &macos_el.element.0
                } else {
                    panic!("Root element is not a macOS element")
                }
            })
            .unwrap_or(&self.system_wide.0);

        // Regular element finding logic
        match selector {
            Selector::Role { role, name: _ } => {
                // Get all possible macOS roles for this generic role
                let macos_roles = map_generic_role_to_macos_roles(role);

                let collector = ElementFinderWithWindows::new(
                    &self.system_wide.0,
                    move |e| {
                        let element_role = e.role().unwrap_or(CFString::new("")).to_string();
                        macos_roles.contains(&element_role)
                    },
                    None,
                );
                let walker: TreeWalkerWithWindows = TreeWalkerWithWindows::new();

                walker.walk(start_element, &collector);

                let ax_ui_element = match collector.find() {
                    Ok(ax_ui_element) => ax_ui_element,
                    Err(_) => {
                        return Err(AutomationError::ElementNotFound(format!(
                            "Element with role '{}' not found",
                            role
                        )))
                    }
                };
                Ok(self.wrap_element(ThreadSafeAXUIElement::new(ax_ui_element)))
            }
            Selector::Id(id) => {
                let id_owned = id.clone(); // Create an owned copy
                let collector = ElementFinderWithWindows::new(
                    &self.system_wide.0,
                    move |e| {
                        // Use move to take ownership of id_owned
                        e.identifier().unwrap_or(CFString::new("")).to_string() == id_owned
                    },
                    None,
                );
                let walker: TreeWalkerWithWindows = TreeWalkerWithWindows::new();

                walker.walk(start_element, &collector);

                let ax_ui_element = match collector.find() {
                    Ok(ax_ui_element) => ax_ui_element,
                    Err(_) => {
                        return Err(AutomationError::ElementNotFound(format!(
                            "Element with ID '{}' not found",
                            id
                        )))
                    }
                };
                Ok(self.wrap_element(ThreadSafeAXUIElement::new(ax_ui_element)))
            }
            Selector::Name(name) => {
                let name_owned = name.clone(); // Create an owned copy
                let collector = ElementFinderWithWindows::new(
                    &self.system_wide.0,
                    move |e| {
                        // Use move to take ownership of name_owned
                        e.title().unwrap_or(CFString::new("")).to_string() == name_owned
                    },
                    None,
                );
                let walker: TreeWalkerWithWindows = TreeWalkerWithWindows::new();

                walker.walk(start_element, &collector);

                let ax_ui_element = match collector.find() {
                    Ok(ax_ui_element) => ax_ui_element,
                    Err(_) => {
                        return Err(AutomationError::ElementNotFound(format!(
                            "Element with name '{}' not found",
                            name
                        )))
                    }
                };
                Ok(self.wrap_element(ThreadSafeAXUIElement::new(ax_ui_element)))
            }

            Selector::Text(text) => {
                let text_owned = text.clone(); // Create an owned copy

                // Create a collector that recursively checks children
                let collector = ElementFinderWithWindows::new(
                    &self.system_wide.0,
                    move |e| {
                        // First check if element itself contains the text in any attribute
                        if element_contains_text(e, &text_owned) {
                            return true;
                        }

                        false
                    },
                    None,
                );

                let walker: TreeWalkerWithWindows = TreeWalkerWithWindows::new();

                walker.walk(start_element, &collector);

                let ax_ui_element = match collector.find() {
                    Ok(ax_ui_element) => ax_ui_element,
                    Err(_) => {
                        return Err(AutomationError::ElementNotFound(format!(
                            "Element with text '{}' not found",
                            text
                        )))
                    }
                };
                Ok(self.wrap_element(ThreadSafeAXUIElement::new(ax_ui_element)))
            }
            Selector::Attributes(_attrs) => Err(AutomationError::UnsupportedOperation(
                "Attributes selector not implemented".to_string(),
            )),
            Selector::Path(_) => Err(AutomationError::UnsupportedOperation(
                "Path selector not implemented".to_string(),
            )),
            _ => {
                // For more complex selectors, we'll mark as unimplemented for now
                Err(AutomationError::UnsupportedOperation(
                    "Complex selector not implemented".to_string(),
                ))
            }
        }
    }

    fn find_elements(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError> {
        use crate::operator::tree_search::ElementsCollectorWithWindows;

        // Get the start element from the provided root or fall back to system_wide
        let start_element = root
            .map(|el| {
                if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                    &macos_el.element.0
                } else {
                    panic!("Root element is not a macOS element")
                }
            })
            .unwrap_or(&self.system_wide.0);

        match selector {
            Selector::Role { role, name: _ } => {
                let macos_roles = map_generic_role_to_macos_roles(role);

                let collector = ElementsCollectorWithWindows::new(start_element, move |e| {
                    let element_role = e.role().unwrap_or(CFString::new("")).to_string();
                    macos_roles.contains(&element_role)
                });

                let ax_ui_elements = collector.find_all();

                // Convert AXUIElements to UIElements
                let ui_elements = ax_ui_elements
                    .into_iter()
                    .map(|e| self.wrap_element(ThreadSafeAXUIElement::new(e)))
                    .collect();

                Ok(ui_elements)
            }
            Selector::Id(id) => {
                let id_owned = id.clone();
                let collector = ElementsCollectorWithWindows::new(start_element, move |e| {
                    e.identifier().unwrap_or(CFString::new("")).to_string() == id_owned
                });

                let ax_ui_elements = collector.find_all();

                // Convert AXUIElements to UIElements
                let ui_elements = ax_ui_elements
                    .into_iter()
                    .map(|e| self.wrap_element(ThreadSafeAXUIElement::new(e)))
                    .collect();

                Ok(ui_elements)
            }
            Selector::Name(name) => {
                let name_owned = name.clone();
                let collector = ElementsCollectorWithWindows::new(start_element, move |e| {
                    e.title().unwrap_or(CFString::new("")).to_string() == name_owned
                });

                let ax_ui_elements = collector.find_all();

                // Convert AXUIElements to UIElements
                let ui_elements = ax_ui_elements
                    .into_iter()
                    .map(|e| self.wrap_element(ThreadSafeAXUIElement::new(e)))
                    .collect();

                Ok(ui_elements)
            }
            Selector::Text(text) => {
                let text_owned = text.clone();
                let collector = ElementsCollectorWithWindows::new(start_element, move |e| {
                    element_contains_text(e, &text_owned)
                });

                let ax_ui_elements = collector.find_all();

                // Convert AXUIElements to UIElements
                let ui_elements = ax_ui_elements
                    .into_iter()
                    .map(|e| self.wrap_element(ThreadSafeAXUIElement::new(e)))
                    .collect();

                Ok(ui_elements)
            }
            Selector::Attributes(_attrs) => Err(AutomationError::UnsupportedOperation(
                "Attributes selector not implemented for find_elements".to_string(),
            )),
            Selector::Path(_) => Err(AutomationError::UnsupportedOperation(
                "Path selector not implemented for find_elements".to_string(),
            )),
            Selector::Filter(_) => Err(AutomationError::UnsupportedOperation(
                "Filter selector not implemented for find_elements".to_string(),
            )),
            Selector::Chain(_) => Err(AutomationError::UnsupportedOperation(
                "Chain selector not implemented for find_elements".to_string(),
            )),
        }
    }
}

// Our concrete UIElement implementation for macOS
pub struct MacOSUIElement {
    element: ThreadSafeAXUIElement,
    use_background_apps: bool,
    activate_app: bool,
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
                        use_background_apps: self.use_background_apps,
                        activate_app: self.activate_app,
                    })
                } else {
                    None
                }
            }
            Err(_) => None,
        }
    }

    // Add the extract_web_content_text method here as a regular method
    fn extract_web_content_text(&self, max_depth: usize) -> Result<String, AutomationError> {
        // Default to a reasonably high but not infinite depth
        self.extract_web_content_text_with_depth(max_depth)
    }

    fn extract_web_content_text_with_depth(
        &self,
        max_depth: usize,
    ) -> Result<String, AutomationError> {
        let mut all_text = Vec::new();
        let mut visited = HashSet::new();

        // Simple breadth-first traversal with depth tracking
        let mut queue = VecDeque::new();
        queue.push_back((self.clone_box(), 0)); // (element, depth)

        while let Some((element, depth)) = queue.pop_front() {
            // Check depth limit
            if depth > max_depth {
                continue;
            }

            let elem = element.as_any().downcast_ref::<MacOSUIElement>().unwrap();
            let id = elem.object_id();

            if visited.contains(&id) {
                continue;
            }
            visited.insert(id);

            // Extract ALL text attributes, no filtering
            for attr_name in &[
                "AXValue",
                "AXTitle",
                "AXDescription",
                "AXHelp",
                "AXLabel",
                "AXText",
            ] {
                let attr = AXAttribute::new(&CFString::new(attr_name));
                if let Ok(value) = elem.element.0.attribute(&attr) {
                    if let Some(cf_string) = value.downcast_into::<CFString>() {
                        let text = cf_string.to_string();
                        if !text.is_empty() && !all_text.contains(&text) {
                            all_text.push(text);
                        }
                    }
                }
            }

            // Get ALL children and add to queue with incremented depth
            let next_depth = depth + 1;

            // Try navigation order children first
            let nav_attr = AXAttribute::new(&CFString::new("AXChildrenInNavigationOrder"));
            if let Ok(value) = elem.element.0.attribute(&nav_attr) {
                if let Some(array) = extract_children_from_array(value) {
                    for child in array {
                        queue.push_back((
                            Box::new(MacOSUIElement {
                                element: ThreadSafeAXUIElement::new(child),
                                use_background_apps: elem.use_background_apps,
                                activate_app: elem.activate_app,
                            }),
                            next_depth,
                        ));
                    }
                }
            }

            // Add regular children too to be thorough
            if let Ok(children) = elem.children() {
                for child in children {
                    let child_impl = child.as_any().downcast_ref::<MacOSUIElement>().unwrap();
                    queue.push_back((child_impl.clone_box(), next_depth));
                }
            }
        }

        Ok(all_text.join("\n"))
    }

    fn click_with_applescript(&self) -> Result<(), AutomationError> {
        // Get element position
        let (x, y, width, height) = self.bounds()?;
        let center_x = x + width / 2.0;
        let center_y = y + height / 2.0;

        // Create AppleScript to click at position
        let script = format!(
            "tell application \"System Events\" to click at {{{}, {}}}",
            center_x as i32, center_y as i32
        );

        // Execute AppleScript
        use std::process::Command;
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| {
                AutomationError::PlatformError(format!("Failed to execute AppleScript: {}", e))
            })?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(AutomationError::PlatformError(format!(
                "AppleScript execution failed: {}",
                error
            )));
        }

        Ok(())
    }
}

impl UIElementImpl for MacOSUIElement {
    fn object_id(&self) -> usize {
        // Use the pointer address of the inner AXUIElement as a unique ID
        self.element.0.as_ref() as *const _ as usize
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn id(&self) -> Option<String> {
        Some(self.object_id().to_string())
    }

    fn role(&self) -> String {
        // Get the actual role
        let role = self
            .element
            .0
            .role()
            .map(|r| r.to_string())
            .unwrap_or_default();

        debug!(target: "operator", "Original role from AXUIElement: {}", role);

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
            debug!(target: "operator", "Getting attributes for window element");

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
                        debug!(target: "operator", "Found window title via {}: {:?}", title_attr_name, attrs.label);
                        break;
                    }
                }
            }

            // Try to get window position and size for debugging
            let pos_attr = AXAttribute::new(&CFString::new("AXPosition"));
            if let Ok(_) = self.element.0.attribute(&pos_attr) {
                debug!(target: "operator", "Window has position attribute");
            }

            // Try to get standard macOS window attributes
            let std_attrs = ["AXMinimized", "AXMain", "AXFocused"];

            for attr_name in std_attrs {
                let attr = AXAttribute::new(&CFString::new(attr_name));
                if let Ok(value) = self.element.0.attribute(&attr) {
                    if let Some(cf_bool) = value.downcast_into::<CFBoolean>() {
                        attrs.properties.insert(
                            attr_name.to_string(),
                            Some(Value::String(format!("{:?}", cf_bool))),
                        );
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
        debug!(target: "operator", "Collecting attributes for element");

        // Directly try common macOS attributes one by one
        let label_attr = AXAttribute::new(&CFString::new("AXTitle"));
        match self.element.0.attribute(&label_attr) {
            Ok(value) => {
                if let Some(cf_string) = value.downcast_into::<CFString>() {
                    attrs.label = Some(cf_string.to_string());
                    debug!(target: "operator", "Found AXTitle: {:?}", attrs.label);
                }
            }
            Err(e) => {
                debug!(target: "operator", "Error getting AXTitle: {:?}", e);

                // Fallback to AXLabel if AXTitle fails
                let alt_label_attr = AXAttribute::new(&CFString::new("AXLabel"));
                if let Ok(value) = self.element.0.attribute(&alt_label_attr) {
                    if let Some(cf_string) = value.downcast_into::<CFString>() {
                        attrs.label = Some(cf_string.to_string());
                        debug!(target: "operator", "Found AXLabel: {:?}", attrs.label);
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
                    debug!(target: "operator", "Found AXDescription: {:?}", attrs.description);
                }
            }
            Err(e) => {
                debug!(target: "operator", "Error getting AXDescription: {:?}", e);
            }
        }

        // Collect all other attributes
        if let Ok(attr_names) = self.element.0.attribute_names() {
            debug!(target: "operator", "Found {} attributes", attr_names.len());

            for name in attr_names.iter() {
                let attr = AXAttribute::new(&name);
                match self.element.0.attribute(&attr) {
                    Ok(value) => {
                        let parsed_value = parse_ax_attribute_value(&name.to_string(), value);
                        attrs.properties.insert(name.to_string(), parsed_value);
                    }
                    Err(e) => {
                        // Avoid logging for common expected errors to reduce noise
                        if !matches!(
                            e,
                            accessibility::Error::Ax(-25212)
                                | accessibility::Error::Ax(-25205)
                                | accessibility::Error::Ax(-25204)
                        ) {
                            debug!(target: "operator", "Error getting attribute {:?}: {:?}", name, e);
                        }
                    }
                }
            }
        } else {
            debug!(target: "operator", "Failed to get attribute names");
        }

        attrs
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        debug!(target: "operator", "Getting children for element: {:?}", self.element.0.role());
        let mut all_children = Vec::new();

        // First try to get windows
        if let Ok(windows) = self.element.0.windows() {
            debug!(target: "operator", "Found {} windows", windows.len());

            // Add all windows to our collection
            for window in windows.iter() {
                all_children.push(UIElement::new(Box::new(MacOSUIElement {
                    element: ThreadSafeAXUIElement::new(window.clone()),
                    use_background_apps: self.use_background_apps,
                    activate_app: self.activate_app,
                })));
            }
        }
        // try main window
        if let Ok(window) = self.element.0.main_window() {
            debug!(target: "operator", "Found main window");
            all_children.push(UIElement::new(Box::new(MacOSUIElement {
                element: ThreadSafeAXUIElement::new(window.clone()),
                use_background_apps: self.use_background_apps,
                activate_app: self.activate_app,
            })));
        }

        // Then get regular children
        match self.element.0.children() {
            Ok(children) => {
                // Add regular children to our collection
                for child in children.iter() {
                    all_children.push(UIElement::new(Box::new(MacOSUIElement {
                        element: ThreadSafeAXUIElement::new(child.clone()),
                        use_background_apps: self.use_background_apps,
                        activate_app: self.activate_app,
                    })));
                }

                Ok(all_children)
            }
            Err(e) => {
                // If we have windows but failed to get children, return the windows
                if !all_children.is_empty() {
                    debug!(target: "operator", "Failed to get regular children but returning {} windows", all_children.len());
                    Ok(all_children)
                } else {
                    // Otherwise return the error
                    Err(AutomationError::PlatformError(format!(
                        "Failed to get children: {}",
                        e
                    )))
                }
            }
        }
    }

    fn parent(&self) -> Result<Option<UIElement>, AutomationError> {
        // Get parent of this element
        let attr = AXAttribute::new(&CFString::new("AXParent"));

        match self.element.0.attribute(&attr) {
            Ok(value) => {
                if let Some(parent) = value.downcast::<AXUIElement>() {
                    Ok(Some(UIElement::new(Box::new(MacOSUIElement {
                        element: ThreadSafeAXUIElement::new(parent),
                        use_background_apps: self.use_background_apps,
                        activate_app: self.activate_app,
                    }))))
                } else {
                    Ok(None) // No parent
                }
            }
            Err(_) => Ok(None),
        }
    }

    fn bounds(&self) -> Result<(f64, f64, f64, f64), AutomationError> {
        let mut x = 0.0;
        let mut y = 0.0;
        let mut width = 0.0;
        let mut height = 0.0;

        // Get position
        if let Ok(position) = self
            .element
            .0
            .attribute(&AXAttribute::new(&CFString::new("AXPosition")))
        {
            unsafe {
                let value_ref = position.as_CFTypeRef();

                // Use AXValueGetValue to extract CGPoint data directly
                let mut point: CGPoint = CGPoint { x: 0.0, y: 0.0 };
                let point_ptr = &mut point as *mut CGPoint as *mut ::std::os::raw::c_void;

                if AXValueGetValue(value_ref as *const _, K_AXVALUE_CGPOINT_TYPE, point_ptr) != 0 {
                    x = point.x;
                    y = point.y;
                }
            }
        }

        // Get size
        if let Ok(size) = self
            .element
            .0
            .attribute(&AXAttribute::new(&CFString::new("AXSize")))
        {
            unsafe {
                let value_ref = size.as_CFTypeRef();

                // Use AXValueGetValue to extract CGSize data directly
                let mut cg_size: CGSize = CGSize {
                    width: 0.0,
                    height: 0.0,
                };
                let size_ptr = &mut cg_size as *mut CGSize as *mut ::std::os::raw::c_void;

                if AXValueGetValue(value_ref as *const _, K_AXVALUE_CGSIZE_TYPE, size_ptr) != 0 {
                    width = cg_size.width;
                    height = cg_size.height;
                }
            }
        }

        debug!(target: "operator", "Element bounds: x={}, y={}, width={}, height={}", x, y, width, height);

        Ok((x, y, width, height))
    }

    fn click(&self) -> Result<(), AutomationError> {
        // Try multiple approaches to click the element

        // 1. Try AXPress action first (the original approach)
        let press_attr = AXAttribute::new(&CFString::new("AXPress"));
        let press_result = self.element.0.perform_action(&press_attr.as_CFString());

        if press_result.is_ok() {
            debug!(target: "operator", "Successfully clicked element with AXPress");
            // return Ok(());
        } else {
            debug!(target: "operator", "AXPress failed, trying alternative methods");
        }

        // 2. Try the more specific AXClick action
        let click_attr = AXAttribute::new(&CFString::new("AXClick"));
        let click_result = self.element.0.perform_action(&click_attr.as_CFString());

        if click_result.is_ok() {
            debug!(target: "operator", "Successfully clicked element with AXClick");
            // return Ok(());
        } else {
            debug!(target: "operator", "AXClick failed, trying alternative methods");
        }

        // match self.click_with_applescript() {
        //     Ok(_) => {
        //         debug!(target: "operator", "Successfully clicked element with AppleScript");
        //         return Ok(());
        //     }
        //     Err(e) => {
        //         debug!(target: "operator", "AppleScript click failed: {}", e);
        //     }
        // }

        // 3. If both direct methods failed, try simulating click using mouse events
        // Only do this as a last resort, as it's more invasive
        match self.bounds() {
            Ok((x, y, width, height)) => {
                // Calculate center point of the element
                let center_x = x + width / 2.0;
                let center_y = y + height / 2.0;

                // Use CGEventCreateMouseEvent to simulate mouse click
                use core_graphics::event::{CGEvent, CGEventType, CGMouseButton};
                use core_graphics::event_source::CGEventSource;
                use core_graphics::geometry::CGPoint;

                let point = CGPoint::new(center_x, center_y);

                // Create event source
                let source = CGEventSource::new(
                    core_graphics::event_source::CGEventSourceStateID::HIDSystemState,
                )
                .map_err(|_| {
                    AutomationError::PlatformError("Failed to create event source".to_string())
                })?;

                // Move mouse to position
                let mouse_move = CGEvent::new_mouse_event(
                    source.clone(),
                    CGEventType::MouseMoved,
                    point,
                    CGMouseButton::Left,
                )
                .map_err(|_| {
                    AutomationError::PlatformError("Failed to create mouse move event".to_string())
                })?;
                mouse_move.post(core_graphics::event::CGEventTapLocation::HID);

                // Brief pause to allow UI to respond
                std::thread::sleep(std::time::Duration::from_millis(50));

                debug!(target: "operator", "Mouse down at ({}, {})", center_x, center_y);

                // Mouse down
                let mouse_down = CGEvent::new_mouse_event(
                    source.clone(),
                    CGEventType::LeftMouseDown,
                    point,
                    CGMouseButton::Left,
                )
                .map_err(|_| {
                    AutomationError::PlatformError("Failed to create mouse down event".to_string())
                })?;
                mouse_down.post(core_graphics::event::CGEventTapLocation::HID);

                // Brief pause
                std::thread::sleep(std::time::Duration::from_millis(50));

                debug!(target: "operator", "Mouse up at ({}, {})", center_x, center_y);

                // Mouse up
                let mouse_up = CGEvent::new_mouse_event(
                    source,
                    CGEventType::LeftMouseUp,
                    point,
                    CGMouseButton::Left,
                )
                .map_err(|_| {
                    AutomationError::PlatformError("Failed to create mouse up event".to_string())
                })?;
                mouse_up.post(core_graphics::event::CGEventTapLocation::HID);

                debug!(target: "operator", "Performed simulated mouse click at ({}, {})", center_x, center_y);
                return Ok(());
            }
            Err(e) => {
                return Err(AutomationError::PlatformError(format!(
                    "Failed to determine element bounds for click: {}",
                    e
                )));
            }
        }
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
            debug!(target: "operator", "Successfully raised element");

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
                        debug!(target: "operator", "Successfully set focus to element");
                        return Ok(());
                    } else {
                        debug!(
                            target: "operator",
                            "Failed to set element as focused: error code {}", result
                        );
                    }
                }
            }
        }

        // If we can't use AXRaise or set focus directly, try to click the element
        // which often gives it focus as a side effect
        debug!(target: "operator", "Attempting to focus by clicking the element");
        self.click()
    }

    fn type_text(&self, text: &str) -> Result<(), AutomationError> {
        // First, try to focus the element, but continue even if focus fails for web inputs
        match self.focus() {
            Ok(_) => debug!(target: "operator", "Successfully focused element for typing"),
            Err(e) => {
                debug!(target: "operator", "Focus failed, but continuing with type_text: {:?}", e);
                // Click the element, which is often needed for web inputs
                if let Err(click_err) = self.click() {
                    debug!(target: "operator", "Click also failed: {:?}", click_err);
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
            debug!(target: "operator", "Detected web input, using specialized handling");

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
                        debug!(target: "operator", "Successfully set text using {}", attr_name);
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
                    target: "operator",
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

    fn get_text(&self, max_depth: usize) -> Result<String, AutomationError> {
        // Special case for web content - we need a different approach
        if self
            .element
            .0
            .role()
            .map_or(false, |r| r.to_string() == "AXWebArea")
            || self
                .element
                .0
                .role()
                .map_or(false, |r| r.to_string().contains("Browser"))
        {
            debug!(target: "operator", "Using specialized web content extraction for: {:?}", 
                   self.element.0.role().map(|r| r.to_string()));

            return self.extract_web_content_text(max_depth);
        }

        // Regular implementation for non-web elements
        let mut text_parts = Vec::new();

        // First try getting text from the current element's AXValue
        let value_attr = AXAttribute::new(&CFString::new("AXValue"));
        if let Ok(value) = self.element.0.attribute(&value_attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                let val = cf_string.to_string();
                if !val.is_empty() {
                    text_parts.push(val);
                }
            }
        }

        // Then check for AXDescription and AXTitle
        let desc_attr = AXAttribute::new(&CFString::new("AXDescription"));
        if let Ok(desc) = self.element.0.attribute(&desc_attr) {
            if let Some(cf_string) = desc.downcast_into::<CFString>() {
                let text = cf_string.to_string();
                if !text.is_empty() {
                    text_parts.push(text);
                }
            }
        }

        let title_attr = AXAttribute::new(&CFString::new("AXTitle"));
        if let Ok(title) = self.element.0.attribute(&title_attr) {
            if let Some(cf_string) = title.downcast_into::<CFString>() {
                let text = cf_string.to_string();
                if !text.is_empty() {
                    text_parts.push(text);
                }
            }
        }

        // Get text from children
        if let Ok(children) = self.children() {
            for child in children {
                if let Ok(child_text) = child.text(max_depth) {
                    if !child_text.is_empty() {
                        text_parts.push(child_text);
                    }
                }
            }
        }

        Ok(text_parts.join("\n"))
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
                    target: "operator",
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
        let engine = MacOSEngine::new(self.use_background_apps, self.activate_app)?;

        // If this is an application element, refresh the tree
        if self
            .element
            .0
            .role()
            .map_or(false, |r| r.to_string() == "AXApplication")
        {
            if let Some(app_name) = self.attributes().label {
                engine.refresh_accessibility_tree(Some(&app_name))?;
            }
        }

        // Add some debug output to understand the current element
        let attrs = self.attributes();
        debug!(target: "operator", "Creating locator for element: role={}, label={:?}", attrs.role, attrs.label);

        // Create a new locator with this element as root
        let self_element = UIElement::new(Box::new(MacOSUIElement {
            element: self.element.clone(),
            use_background_apps: self.use_background_apps,
            activate_app: self.activate_app,
        }));

        // Create a locator for the selector with the engine, then set root to this element
        let locator = Locator::new(std::sync::Arc::new(engine), selector).within(self_element);

        Ok(locator)
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(MacOSUIElement {
            element: self.element.clone(),
            use_background_apps: self.use_background_apps,
            activate_app: self.activate_app,
        })
    }
}

// Helper function to extract children from an array attribute
fn extract_children_from_array(value: core_foundation::base::CFType) -> Option<Vec<AXUIElement>> {
    use core_foundation::array::{CFArrayGetCount, CFArrayGetTypeID, CFArrayGetValueAtIndex};
    use core_foundation::base::{CFGetTypeID, TCFType};

    unsafe {
        let value_ref = value.as_CFTypeRef();
        let type_id = CFGetTypeID(value_ref);

        if type_id == CFArrayGetTypeID() {
            let array_ref = value_ref as *const __CFArray;
            let count = CFArrayGetCount(array_ref);

            let mut children = Vec::with_capacity(count as usize);
            for i in 0..count {
                let item = CFArrayGetValueAtIndex(array_ref, i as isize);
                if !item.is_null() {
                    let ax_element = AXUIElement::wrap_under_get_rule(item as *mut _);
                    children.push(ax_element);
                }
            }
            return Some(children);
        }
    }

    None
}

// Helper function to parse AXUIElement attribute values into appropriate types
fn parse_ax_attribute_value(
    name: &str,
    value: core_foundation::base::CFType,
) -> Option<serde_json::Value> {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::geometry::{CGPoint, CGSize};
    use serde_json::{json, Value};

    // Handle different types based on known attribute names and value types
    match name {
        // String values (text, identifiers, descriptions)
        "AXRole" | "AXRoleDescription" | "AXIdentifier" | "AXValue" => {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                return Some(Value::String(cf_string.to_string()));
            }
        }

        // Boolean values
        "AXEnabled" | "AXFocused" => {
            if let Some(cf_bool) = value.downcast_into::<CFBoolean>() {
                return Some(Value::Bool(cf_bool == CFBoolean::true_value()));
            }
        }

        // Numeric values
        "AXNumberOfCharacters" | "AXInsertionPointLineNumber" => {
            if let Some(cf_num) = value.downcast_into::<CFNumber>() {
                if let Some(num) = cf_num.to_i64() {
                    return Some(Value::Number(serde_json::Number::from(num)));
                } else if let Some(num) = cf_num.to_f64() {
                    // Need to handle possible NaN/Infinity which aren't allowed in JSON
                    if num.is_finite() {
                        return serde_json::Number::from_f64(num).map(Value::Number);
                    } else {
                        return Some(Value::Null);
                    }
                }
            }
        }

        // Position, Size and Frame require special handling with AXValue
        "AXPosition" => {
            // Try to extract CGPoint using AXValueGetValue
            unsafe {
                let value_ref = value.as_CFTypeRef();
                let mut point = CGPoint { x: 0.0, y: 0.0 };
                let point_ptr = &mut point as *mut CGPoint as *mut ::std::os::raw::c_void;

                if AXValueGetValue(value_ref, K_AXVALUE_CGPOINT_TYPE, point_ptr) != 0 {
                    return Some(json!({
                        "x": point.x,
                        "y": point.y
                    }));
                }
            }
        }

        "AXSize" => {
            // Try to extract CGSize using AXValueGetValue
            unsafe {
                let value_ref = value.as_CFTypeRef();
                let mut size = CGSize {
                    width: 0.0,
                    height: 0.0,
                };
                let size_ptr = &mut size as *mut CGSize as *mut ::std::os::raw::c_void;

                if AXValueGetValue(value_ref, K_AXVALUE_CGSIZE_TYPE, size_ptr) != 0 {
                    return Some(json!({
                        "width": size.width,
                        "height": size.height
                    }));
                }
            }
        }

        // For attributes that are references to other UI elements
        "AXParent" | "AXWindow" | "AXTopLevelUIElement" => {
            // get object id
            if let Some(ax_element) = value.downcast_into::<AXUIElement>() {
                let address = &ax_element as *const _ as usize;
                return Some(Value::String(format!("{}", address)));
            }
        }

        // For array types (children)
        name if name.starts_with("AXChildren") => {
            debug!(target: "operator", "Processing AXChildren attribute");

            unsafe {
                let value_ref = value.as_CFTypeRef();
                let type_id = CFGetTypeID(value_ref);

                if type_id == CFArrayGetTypeID() {
                    // Cast to CFArrayRef
                    let array_ref = value_ref as *const __CFArray;
                    let count = CFArrayGetCount(array_ref);
                    debug!(target: "operator", "AXChildren array with {} elements", count);

                    // Create an array of element addresses
                    let mut items = Vec::with_capacity(count as usize);
                    for i in 0..count {
                        let item = CFArrayGetValueAtIndex(array_ref, i as isize);
                        if !item.is_null() {
                            // Correctly wrap the raw pointer into AXUIElement
                            let ax_element = AXUIElement::wrap_under_get_rule(item as *mut _);
                            let address = &ax_element as *const _ as usize;
                            items.push(json!(format!("{}", address)));
                        }
                    }
                    return Some(Value::Array(items));
                }
            }

            return None;
        }

        _ => {}
    }

    // Fallback for unhandled types
    None
}

// Add this helper function after the selector handler
fn element_contains_text(e: &AXUIElement, text: &str) -> bool {
    // Check immediate element attributes for text
    let contains_in_value = e
        .value()
        .ok()
        .and_then(|v| v.downcast_into::<CFString>())
        .map_or(false, |s| s.to_string().contains(text));

    if contains_in_value {
        return true;
    }

    // Check title, description and other text attributes
    let contains_in_title = e
        .title()
        .ok()
        .map_or(false, |t| t.to_string().contains(text));

    let contains_in_desc = e
        .description()
        .ok()
        .map_or(false, |d| d.to_string().contains(text));

    // Check common text attributes
    for attr_name in &[
        "AXValue",
        "AXTitle",
        "AXDescription",
        "AXHelp",
        "AXLabel",
        "AXText",
    ] {
        let attr = AXAttribute::new(&CFString::new(attr_name));
        if let Ok(value) = e.attribute(&attr) {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                if cf_string.to_string().contains(text) {
                    return true;
                }
            }
        }
    }

    contains_in_title || contains_in_desc
}
