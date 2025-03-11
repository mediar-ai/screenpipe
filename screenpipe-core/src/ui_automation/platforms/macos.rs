use crate::ui_automation::platforms::AccessibilityEngine;
use crate::ui_automation::tree_search::{ElementFinderWithWindows, TreeWalkerWithWindows};
use crate::ui_automation::{
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
use serde_json;
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
    use_background_apps: bool,
}

impl MacOSEngine {
    pub fn new(use_background_apps: bool) -> Result<Self, AutomationError> {
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
            use_background_apps: self.use_background_apps,
        }))
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
                    debug!(target: "ui_automation", "Filtered out background worker: {}", bundle_id_str);
                    continue;
                }
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
        let pids = get_running_application_pids(self.use_background_apps)?;

        debug!(target: "ui_automation", "Found {} running applications", pids.len());

        // Create AXUIElements for each application
        let mut app_elements = Vec::new();
        for pid in pids {
            trace!(target: "ui_automation", "Creating AXUIElement for application with PID: {}", pid);
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

    fn find_element(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<UIElement, AutomationError> {
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

                let start_element = root
                    .map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element.0
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    })
                    .unwrap_or(&self.system_wide.0);

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

                let start_element = root
                    .map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element.0
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    })
                    .unwrap_or(&self.system_wide.0);

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

                let start_element = root
                    .map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element.0
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    })
                    .unwrap_or(&self.system_wide.0);

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
                let collector = ElementFinderWithWindows::new(
                    &self.system_wide.0,
                    move |e| {
                        // Use move to take ownership of text_owned
                        // AXValue is the text of the element
                        if let Some(cf_string) = e.value().unwrap().downcast_into::<CFString>() {
                            cf_string.to_string() == text_owned
                        } else {
                            false
                        }
                    },
                    None,
                );
                let walker: TreeWalkerWithWindows = TreeWalkerWithWindows::new();

                let start_element = root
                    .map(|el| {
                        if let Some(macos_el) = el.as_any().downcast_ref::<MacOSUIElement>() {
                            &macos_el.element.0
                        } else {
                            panic!("Root element is not a macOS element")
                        }
                    })
                    .unwrap_or(&self.system_wide.0);

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
}

// Our concrete UIElement implementation for macOS
pub struct MacOSUIElement {
    element: ThreadSafeAXUIElement,
    use_background_apps: bool,
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
                            .insert(attr_name.to_string(), Some(format!("{:?}", cf_bool)));
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
                            debug!(target: "ui_automation", "Error getting attribute {:?}: {:?}", name, e);
                        }
                    }
                }
            }
        } else {
            debug!(target: "ui_automation", "Failed to get attribute names");
        }

        attrs
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        debug!(target: "ui_automation", "Getting children for element: {:?}", self.element.0.role());
        let mut all_children = Vec::new();

        // First try to get windows
        if let Ok(windows) = self.element.0.windows() {
            debug!(target: "ui_automation", "Found {} windows", windows.len());

            // Add all windows to our collection
            for window in windows.iter() {
                all_children.push(UIElement::new(Box::new(MacOSUIElement {
                    element: ThreadSafeAXUIElement::new(window.clone()),
                    use_background_apps: self.use_background_apps,
                })));
            }
        }
        // try main window
        if let Ok(window) = self.element.0.main_window() {
            debug!(target: "ui_automation", "Found main window");
            all_children.push(UIElement::new(Box::new(MacOSUIElement {
                element: ThreadSafeAXUIElement::new(window.clone()),
                use_background_apps: self.use_background_apps,
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
                    })));
                }

                Ok(all_children)
            }
            Err(e) => {
                // If we have windows but failed to get children, return the windows
                if !all_children.is_empty() {
                    debug!(target: "ui_automation", "Failed to get regular children but returning {} windows", all_children.len());
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

        debug!(target: "ui_automation", "Element bounds: x={}, y={}, width={}, height={}", x, y, width, height);

        Ok((x, y, width, height))
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
        let engine = MacOSEngine::new(self.use_background_apps)?;
        // Add some debug output to understand the current element
        let attrs = self.attributes();
        debug!(target: "ui_automation", "Creating locator for element: role={}, label={:?}", attrs.role, attrs.label);

        // Create a new locator with this element as root
        let self_element = UIElement::new(Box::new(MacOSUIElement {
            element: self.element.clone(),
            use_background_apps: self.use_background_apps,
        }));

        // Create a locator for the selector with the engine, then set root to this element
        let locator = Locator::new(std::sync::Arc::new(engine), selector).within(self_element);

        Ok(locator)
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(MacOSUIElement {
            element: self.element.clone(),
            use_background_apps: self.use_background_apps,
        })
    }
}

// Helper function to parse AXUIElement attribute values into appropriate types
fn parse_ax_attribute_value(name: &str, value: core_foundation::base::CFType) -> Option<String> {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::geometry::{CGPoint, CGSize};

    // Handle different types based on known attribute names and value types
    match name {
        // String values (text, identifiers, descriptions)
        "AXRole" | "AXRoleDescription" | "AXIdentifier" | "AXValue" => {
            if let Some(cf_string) = value.downcast_into::<CFString>() {
                return Some(cf_string.to_string());
            }
        }

        // Boolean values
        "AXEnabled" | "AXFocused" => {
            if let Some(cf_bool) = value.downcast_into::<CFBoolean>() {
                return Some((cf_bool == CFBoolean::true_value()).to_string());
            }
        }

        // Numeric values
        "AXNumberOfCharacters" | "AXInsertionPointLineNumber" => {
            if let Some(cf_num) = value.downcast_into::<CFNumber>() {
                if let Some(num) = cf_num.to_i64() {
                    return Some(num.to_string());
                } else if let Some(num) = cf_num.to_f64() {
                    return Some(num.to_string());
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
                    return Some(serde_json::json!({ "x": point.x, "y": point.y }).to_string());
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
                    return Some(
                        serde_json::json!({ "width": size.width, "height": size.height })
                            .to_string(),
                    );
                }
            }
        }

        // For attributes that are references to other UI elements
        "AXParent" | "AXWindow" | "AXTopLevelUIElement" => {
            // get object id
            if let Some(ax_element) = value.downcast_into::<AXUIElement>() {
                return Some(format!("{}", &ax_element as *const _ as usize));
            }
        }

        // For array types (children)
        name if name.starts_with("AXChildren") => {
            debug!(target: "ui_automation", "Processing AXChildren attribute");

            unsafe {
                let value_ref = value.as_CFTypeRef();
                let type_id = CFGetTypeID(value_ref);

                if type_id == CFArrayGetTypeID() {
                    // Cast to CFArrayRef
                    let array_ref = value_ref as *const __CFArray;
                    let count = CFArrayGetCount(array_ref);
                    debug!(target: "ui_automation", "AXChildren array with {} elements", count);

                    // Print info about first few elements (limit to avoid spam)
                    let max_items = 5.min(count as usize);
                    for i in 0..max_items {
                        let item = CFArrayGetValueAtIndex(array_ref, i as isize);
                        if !item.is_null() {
                            debug!(target: "ui_automation", "  Child[{}] ptr: {:?}", i, item);
                        }
                    }
                }
            }

            return None;
        }

        _ => {}
    }

    // Fallback for unhandled types
    None
}
