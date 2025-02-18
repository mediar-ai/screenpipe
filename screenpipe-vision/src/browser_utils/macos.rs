use accessibility_sys::{
    kAXChildrenAttribute, kAXFocusedWindowAttribute, kAXRoleAttribute, kAXTextFieldRole,
    kAXValueAttribute, AXUIElementCopyAttributeValue, AXUIElementCreateApplication,
    AXUIElementRef,
};
use anyhow::Result;
use core_foundation::{
    base::{CFTypeRef, TCFType},
    string::CFString,
    array::CFArray,
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
            let cf_role = CFString::wrap_under_get_rule(role as _);
            let role_str = cf_role.to_string();

            if role_str == kAXTextFieldRole {
                let mut value: CFTypeRef = std::ptr::null_mut();
                let status = AXUIElementCopyAttributeValue(
                    element,
                    CFString::from_static_string(kAXValueAttribute).as_concrete_TypeRef(),
                    &mut value,
                );

                if status == accessibility_sys::kAXErrorSuccess {
                    let url_str = CFString::wrap_under_get_rule(value as _).to_string();
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
            let children_array = CFArray::<*const std::ffi::c_void>::wrap_under_get_rule(children as _);
            for child in children_array.iter() {
                if let Some(found) = self.find_url_field(*child as AXUIElementRef) {
                    return Some(found);
                }
            }
        }
        
        None
    }
}

impl BrowserUrlDetector for MacOSUrlDetector {
    fn get_active_url(&self, _app_name: &str, process_id: i32) -> Result<Option<String>> {
        unsafe {
            let app_element = AXUIElementCreateApplication(process_id);
            
            let mut focused_window: CFTypeRef = std::ptr::null_mut();
            let status = AXUIElementCopyAttributeValue(
                app_element,
                CFString::from_static_string(kAXFocusedWindowAttribute).as_concrete_TypeRef(),
                &mut focused_window,
            );
            
            if status != accessibility_sys::kAXErrorSuccess {
                return Ok(None);
            }

            let window_ref = focused_window as AXUIElementRef;
            let address_bar = match self.find_url_field(window_ref) {
                Some(bar) => bar,
                None => return Ok(None),
            };

            let mut url_value: CFTypeRef = std::ptr::null_mut();
            let status = AXUIElementCopyAttributeValue(
                address_bar,
                CFString::from_static_string(kAXValueAttribute).as_concrete_TypeRef(),
                &mut url_value,
            );
            
            if status == accessibility_sys::kAXErrorSuccess {
                let url = CFString::wrap_under_get_rule(url_value as _).to_string();
                Ok(Some(url))
            } else {
                Ok(None)
            }
        }
    }
}