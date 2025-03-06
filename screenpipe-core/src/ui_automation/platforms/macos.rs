use crate::ui_automation::platforms::AccessibilityEngine;
use crate::ui_automation::{
    element::UIElementImpl, AutomationError, Selector, UIElement, UIElementAttributes,
};

use accessibility::AXUIElementAttributes;
use accessibility::{AXAttribute, AXUIElement, TreeVisitor, TreeWalker, TreeWalkerFlow};
use anyhow::Result;
use core_foundation::base::CFTypeRef;
use core_foundation::{
    base::TCFType, boolean::CFBoolean, dictionary::CFDictionary, string::CFString,
};
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

// Thread-safe wrapper for AXUIElement
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

    // Update find_by_role to use ThreadSafeAXUIElement
    fn find_by_role(
        &self,
        _role: &str,
        _name: Option<&str>,
        _root: Option<&ThreadSafeAXUIElement>,
    ) -> Result<Vec<ThreadSafeAXUIElement>, AutomationError> {
        // Implementation details would need to be adjusted
        // This is just a placeholder
        Err(AutomationError::UnsupportedOperation(
            "find_by_role not yet fully implemented for macOS".to_string(),
        ))
    }
}

impl AccessibilityEngine for MacOSEngine {
    fn get_root_element(&self) -> UIElement {
        self.wrap_element(self.system_wide.clone())
    }

    fn get_element_by_id(&self, id: &str) -> Result<UIElement, AutomationError> {
        // AXIdentifier is not always available or reliable, so we'll search
        // by AXIdentifier attribute if available
        let mut collector = ElementCollectorByAttribute::new("AXIdentifier", id);
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

    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        // In macOS, we can find applications by their AXRole being "AXApplication"
        self.find_by_role("AXApplication", None, None)
            .map(|elements| elements.into_iter().map(|e| self.wrap_element(e)).collect())
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
                let mut collector = ElementCollectorByAttribute::new("AXIdentifier", id);
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
                let mut collector = ElementCollectorByAttribute::new("AXTitle", name);
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
                let mut collector = ElementCollectorByAttribute::new("AXValue", text);
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
struct ElementCollectorAdapter<'a> {
    inner: &'a mut ElementCollector,
}

impl<'a> TreeVisitor for ElementCollectorAdapter<'a> {
    fn enter_element(&mut self, element: &AXUIElement) -> TreeWalkerFlow {
        // Wrap the AXUIElement in ThreadSafeAXUIElement and delegate
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.enter_element_impl(&wrapped)
    }

    fn exit_element(&mut self, element: &AXUIElement) {
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.exit_element_impl(&wrapped)
    }
}

struct ElementCollectorByAttributeAdapter<'a> {
    inner: &'a mut ElementCollectorByAttribute,
}

impl<'a> TreeVisitor for ElementCollectorByAttributeAdapter<'a> {
    fn enter_element(&mut self, element: &AXUIElement) -> TreeWalkerFlow {
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.enter_element_impl(&wrapped)
    }

    fn exit_element(&mut self, element: &AXUIElement) {
        let wrapped = ThreadSafeAXUIElement::new(element.clone());
        self.inner.exit_element_impl(&wrapped)
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

    fn adapter(&mut self) -> ElementCollectorAdapter {
        ElementCollectorAdapter { inner: self }
    }

    fn enter_element_impl(&mut self, element: &ThreadSafeAXUIElement) -> TreeWalkerFlow {
        // Existing implementation goes here
        if let Ok(role) = element.0.role() {
            if role.to_owned() == self.target_role {
                // If name is specified, check it matches
                if let Some(ref target_name) = self.target_name {
                    if let Ok(title) = element.0.title() {
                        if title.to_owned() == *target_name {
                            self.elements.push(element.clone());
                        }
                    }
                } else {
                    // No name filter, just collect by role
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

    fn adapter(&mut self) -> ElementCollectorByAttributeAdapter {
        ElementCollectorByAttributeAdapter { inner: self }
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

impl UIElementImpl for MacOSUIElement {
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
        // Get children of this element
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
}
