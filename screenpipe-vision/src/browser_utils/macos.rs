use accessibility_sys::{
    kAXChildrenAttribute, kAXFocusedWindowAttribute, kAXRoleAttribute, kAXTextFieldRole,
    kAXValueAttribute, AXUIElementCopyAttributeValue, AXUIElementCreateApplication,
    AXUIElementRef,
};
use anyhow::Result;
use core_foundation::{
    array::CFArray, base::{CFRelease, CFTypeRef, TCFType}, string::CFString
};
use url::Url;

use super::BrowserUrlDetector;

pub struct MacOSUrlDetector;

impl MacOSUrlDetector {
    pub fn new() -> Self {
        Self
    }

    unsafe fn find_url_field(&self, element: AXUIElementRef) -> Option<AXUIElementRef> {
        let mut role: CFTypeRef = std::ptr::null_mut();
        let status = AXUIElementCopyAttributeValue(
            element,
            CFString::from_static_string(kAXRoleAttribute).as_concrete_TypeRef(),
            &mut role,
        );

        if status == accessibility_sys::kAXErrorSuccess {
            let _cf_role = CFString::wrap_under_get_rule(role as _);
            let role_str = _cf_role.to_string();

            if role_str == kAXTextFieldRole {
                let mut value: CFTypeRef = std::ptr::null_mut();
                let status = AXUIElementCopyAttributeValue(
                    element,
                    CFString::from_static_string(kAXValueAttribute).as_concrete_TypeRef(),
                    &mut value,
                );

                if status == accessibility_sys::kAXErrorSuccess {
                    let _value_str = CFString::wrap_under_get_rule(value as _);
                    let url_str = _value_str.to_string();
                    let url_to_parse = if !url_str.starts_with("http://") && !url_str.starts_with("https://") {
                        format!("https://{}", url_str)
                    } else {
                        url_str
                    };
                    
                    if Url::parse(&url_to_parse).is_ok() {
                        return Some(element);
                    }
                }
            }
        }

        let mut children: CFTypeRef = std::ptr::null_mut();
        let status = AXUIElementCopyAttributeValue(
            element,
            CFString::from_static_string(kAXChildrenAttribute).as_concrete_TypeRef(),
            &mut children,
        );
        
        if status == accessibility_sys::kAXErrorSuccess {
            let _children_array = CFArray::<*const std::ffi::c_void>::wrap_under_get_rule(children as _);
            for child in _children_array.iter() {
                if let Some(found) = self.find_url_field(*child as AXUIElementRef) {
                    return Some(found);
                }
            }
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
            
            if status != accessibility_sys::kAXErrorSuccess {
                CFRelease(app_element as CFTypeRef);
                return Ok(None);
            }

            let window_ref = focused_window as AXUIElementRef;
            let address_bar = match self.find_url_field(window_ref) {
                Some(bar) => bar,
                None => {
                    CFRelease(focused_window as CFTypeRef);
                    CFRelease(app_element as CFTypeRef);
                    return Ok(None);
                }
            };

            let mut url_value: CFTypeRef = std::ptr::null_mut();
            let status = AXUIElementCopyAttributeValue(
                address_bar,
                CFString::from_static_string(kAXValueAttribute).as_concrete_TypeRef(),
                &mut url_value,
            );
            
            let result = if status == accessibility_sys::kAXErrorSuccess {
                let url_str = CFString::wrap_under_get_rule(url_value as _);
                Ok(Some(url_str.to_string()))
            } else {
                Ok(None)
            };

            CFRelease(url_value as CFTypeRef);
            CFRelease(focused_window as CFTypeRef);
            CFRelease(app_element as CFTypeRef);
            
            result
        }
    }
}

impl BrowserUrlDetector for MacOSUrlDetector {
    fn get_active_url(&self, app_name: &str, process_id: i32) -> Result<Option<String>> {
        if app_name == "Arc" {
            let script = r#"tell application "Arc" to return URL of active tab of front window"#;
            self.get_url_via_applescript(script)
        } else {
            self.get_url_via_accessibility(process_id)
        }
    }
}