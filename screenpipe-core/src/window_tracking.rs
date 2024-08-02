use core::ffi::c_void;
use core_foundation::array::CFArrayGetCount;
use core_foundation::base::{CFGetTypeID, CFRelease, CFTypeRef};
use core_foundation::base::{CFType, ToVoid};
use core_foundation::dictionary::{CFDictionaryGetValueIfPresent, CFDictionaryRef};
use core_foundation::number::{CFNumber, CFNumberGetType, CFNumberGetValue, CFNumberRef};
use core_foundation::string::{
    kCFStringEncodingUTF8, CFString, CFStringGetCStringPtr, CFStringRef,
};

use core_graphics::display::CFArrayGetValueAtIndex;
use core_graphics::window::{kCGWindowListOptionOnScreenOnly, CGWindowListCopyWindowInfo};
use std::ffi::CStr;

#[derive(Debug)]
pub struct WindowInfo {
    pub name: String,
    pub owner_name: String,
    pub process_id: i64,
}
use core_foundation::array::{CFArray, CFArrayRef};
use core_foundation::base::TCFType;
use core_foundation::dictionary::CFDictionary;
use core_graphics::display::CGMainDisplayID;

#[link(name = "ApplicationServices", kind = "framework")]
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;
}

type AXUIElementRef = *mut std::os::raw::c_void;
// type CFTypeRef = *mut std::os::raw::c_void;
type AXError = i32;

pub fn get_active_window() -> anyhow::Result<WindowInfo> {
    unsafe {
        let ax_element = AXUIElementCreateSystemWide();
        let attribute = CFString::new("AXFocusedApplication");
        let mut app_ref: CFTypeRef = std::ptr::null_mut();

        let result = AXUIElementCopyAttributeValue(
            ax_element,
            attribute.as_concrete_TypeRef(),
            &mut app_ref,
        );

        println!("result: {}", result);

        match result {
            0 => {
            let app = CFType::wrap_under_create_rule(app_ref);
            let app_dict: CFDictionary<CFString, CFType> =
                CFDictionary::wrap_under_get_rule(app.as_CFTypeRef() as *const _);

            println!("app_dict: {:?}", app_dict);
            let name = {
                let value = app_dict.get(CFString::new("AXTitle").as_concrete_TypeRef());
                let cf_string_ref = value.as_CFTypeRef() as CFStringRef;
                CFString::wrap_under_get_rule(cf_string_ref).to_string()
            };

            println!("app_dict: {:?}", app_dict);
            let pid = {
                let value = app_dict.get(CFString::new("kCGWindowOwnerPID").as_concrete_TypeRef());
                let cf_number_ref = value.as_CFTypeRef() as CFNumberRef;
                CFNumber::wrap_under_get_rule(cf_number_ref)
                    .to_i64()
                    .ok_or_else(|| anyhow::anyhow!("Failed to convert PID to i64"))?
            };

            println!("name: {}, pid: {}", name, pid);

            return Ok(WindowInfo {
                name: String::new(), // We don't have the specific window name here
                owner_name: name,
                process_id: pid,
            });
        },
        -25204 => Err(anyhow::anyhow!("Accessibility API is disabled. Please enable it in System Preferences -> Security & Privacy -> Privacy -> Accessibility")),
            _ => Err(anyhow::anyhow!("Failed to get active application. Error code: {}", result)),
        }
    }
}

fn get_string_value(dic_ref: CFDictionaryRef, key: &str) -> Option<String> {
    let cf_key = CFString::new(key);
    let mut value: *const c_void = std::ptr::null();
    if unsafe { CFDictionaryGetValueIfPresent(dic_ref, cf_key.to_void(), &mut value) != 0 } {
        let cf_ref = value as CFStringRef;
        let c_ptr = unsafe { CFStringGetCStringPtr(cf_ref, kCFStringEncodingUTF8) };
        if !c_ptr.is_null() {
            let c_result = unsafe { CStr::from_ptr(c_ptr) };
            return Some(c_result.to_str().unwrap().to_string());
        }
    }
    None
}

fn get_number_value(dic_ref: CFDictionaryRef, key: &str) -> Option<i64> {
    let cf_key = CFString::new(key);
    let mut value: *const c_void = std::ptr::null();
    if unsafe { CFDictionaryGetValueIfPresent(dic_ref, cf_key.to_void(), &mut value) != 0 } {
        let number_ref = value as CFNumberRef;
        let mut result: i64 = 0;
        let success = unsafe {
            CFNumberGetValue(
                number_ref,
                CFNumberGetType(number_ref),
                &mut result as *mut _ as *mut c_void,
            )
        };
        if success {
            return Some(result);
        }
    }
    None
}
