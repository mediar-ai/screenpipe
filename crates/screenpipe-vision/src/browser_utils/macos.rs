use accessibility_sys::{
    kAXChildrenAttribute, kAXFocusedWindowAttribute, kAXRoleAttribute, kAXTextFieldRole,
    kAXValueAttribute, AXUIElementCopyAttributeValue, AXUIElementCreateApplication, AXUIElementRef,
};
use anyhow::Result;
use core_foundation::{
    array::CFArray,
    base::{CFRelease, CFTypeRef, TCFType},
    string::CFString,
};
use url::Url;

use super::BrowserUrlDetector;

pub struct MacOSUrlDetector;

impl Default for MacOSUrlDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl MacOSUrlDetector {
    pub fn new() -> Self {
        Self
    }

    /// Recursively search the AX tree for a text field containing a URL.
    /// Returns the URL string directly instead of a borrowed AXUIElementRef,
    /// avoiding dangling-pointer risks when child elements are freed.
    unsafe fn find_url_in_tree(&self, element: AXUIElementRef) -> Option<String> {
        // Check if this element is a text field with a URL value
        let mut role: CFTypeRef = std::ptr::null_mut();
        let status = AXUIElementCopyAttributeValue(
            element,
            CFString::from_static_string(kAXRoleAttribute).as_concrete_TypeRef(),
            &mut role,
        );

        if status == accessibility_sys::kAXErrorSuccess && !role.is_null() {
            // AXUIElementCopyAttributeValue returns +1 retained — use create_rule
            let cf_role = CFString::wrap_under_create_rule(role as _);
            let role_str = cf_role.to_string();
            // cf_role drops here and releases the CF object

            if role_str == kAXTextFieldRole {
                let mut value: CFTypeRef = std::ptr::null_mut();
                let status = AXUIElementCopyAttributeValue(
                    element,
                    CFString::from_static_string(kAXValueAttribute).as_concrete_TypeRef(),
                    &mut value,
                );

                if status == accessibility_sys::kAXErrorSuccess && !value.is_null() {
                    // +1 retained — use create_rule so it's released on drop
                    let cf_value = CFString::wrap_under_create_rule(value as _);
                    let url_str = cf_value.to_string();
                    // cf_value drops here and releases

                    let url_to_parse =
                        if !url_str.starts_with("http://") && !url_str.starts_with("https://") {
                            format!("https://{}", url_str)
                        } else {
                            url_str.clone()
                        };

                    if Url::parse(&url_to_parse).is_ok() {
                        return Some(url_str);
                    }
                }
                // If CopyAttributeValue failed, value is still null — nothing to release
            }
        }
        // If CopyAttributeValue failed for role, role is still null — nothing to release

        // Recurse into children
        let mut children: CFTypeRef = std::ptr::null_mut();
        let status = AXUIElementCopyAttributeValue(
            element,
            CFString::from_static_string(kAXChildrenAttribute).as_concrete_TypeRef(),
            &mut children,
        );

        if status == accessibility_sys::kAXErrorSuccess && !children.is_null() {
            // +1 retained — use create_rule so the array is released on drop
            let children_array =
                CFArray::<*const std::ffi::c_void>::wrap_under_create_rule(children as _);
            for child in children_array.iter() {
                if let Some(url) = self.find_url_in_tree(*child as AXUIElementRef) {
                    return Some(url);
                }
            }
            // children_array drops here, releasing the CF array
        }

        None
    }

    fn get_url_via_applescript(&self, script: &str) -> Result<Option<String>> {
        let output = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()?;

        if output.status.success() {
            let url = String::from_utf8(output.stdout)?.trim().to_string();
            return Ok(Some(url));
        }
        Ok(None)
    }

    fn get_url_via_accessibility(&self, process_id: i32) -> Result<Option<String>> {
        unsafe {
            let app_element = AXUIElementCreateApplication(process_id);

            let mut focused_window: CFTypeRef = std::ptr::null_mut();
            let status = AXUIElementCopyAttributeValue(
                app_element,
                CFString::from_static_string(kAXFocusedWindowAttribute).as_concrete_TypeRef(),
                &mut focused_window,
            );

            if status != accessibility_sys::kAXErrorSuccess || focused_window.is_null() {
                CFRelease(app_element as CFTypeRef);
                return Ok(None);
            }

            let window_ref = focused_window as AXUIElementRef;
            // find_url_in_tree returns the URL string directly —
            // no dangling AXUIElementRef concerns
            let result = self.find_url_in_tree(window_ref);

            // Release focused_window (+1 from CopyAttributeValue)
            CFRelease(focused_window);
            // Release app_element (+1 from AXUIElementCreateApplication)
            CFRelease(app_element as CFTypeRef);

            Ok(result)
        }
    }
}

impl BrowserUrlDetector for MacOSUrlDetector {
    fn get_active_url(
        &self,
        app_name: &str,
        process_id: i32,
        _window_title: &str,
    ) -> Result<Option<String>> {
        if app_name == "Arc" {
            let script = r#"tell application "Arc" to return URL of active tab of front window"#;
            self.get_url_via_applescript(script)
        } else {
            self.get_url_via_accessibility(process_id)
        }
    }
}
