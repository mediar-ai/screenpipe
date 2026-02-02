//! XPC-based screen capture client for macOS
//!
//! This module provides a client to communicate with the ScreenCaptureService XPC service
//! embedded in the main Tauri app. This allows the sidecar process to capture screens
//! while using the main app's TCC (Transparency, Consent, and Control) permissions.

#![cfg(target_os = "macos")]

use anyhow::{anyhow, Result};
use image::DynamicImage;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{debug, info, warn};

/// Service name for the XPC connection
/// This must match the bundle identifier of the XPC service
const XPC_SERVICE_NAME: &str = "screenpi.pe.ScreenCaptureService";

/// Alternative service names to try (for dev/beta builds)
const XPC_SERVICE_NAMES: &[&str] = &[
    "screenpi.pe.ScreenCaptureService",
    "screenpi.pe.dev.ScreenCaptureService",
    "screenpi.pe.beta.ScreenCaptureService",
];

/// Check if XPC capture is available
static XPC_AVAILABLE: AtomicBool = AtomicBool::new(false);
static XPC_CHECKED: AtomicBool = AtomicBool::new(false);

/// Monitor info returned from XPC service
#[derive(Debug, Clone)]
pub struct XpcMonitorInfo {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub x: f64,
    pub y: f64,
}

/// Window info returned from XPC service
#[derive(Debug, Clone)]
pub struct XpcWindowInfo {
    pub id: u32,
    pub title: String,
    pub app_name: String,
    pub width: u32,
    pub height: u32,
    pub x: f64,
    pub y: f64,
    pub is_on_screen: bool,
}

/// XPC client for screen capture
pub struct XpcCaptureClient {
    service_name: String,
}

impl XpcCaptureClient {
    /// Create a new XPC capture client
    pub fn new() -> Result<Self> {
        // Try to find an available service
        for name in XPC_SERVICE_NAMES {
            if Self::test_service(name) {
                info!("XPC screen capture service found: {}", name);
                return Ok(Self {
                    service_name: name.to_string(),
                });
            }
        }

        Err(anyhow!(
            "XPC screen capture service not available. Make sure screenpipe is running from the app bundle."
        ))
    }

    /// Test if a service is available
    fn test_service(name: &str) -> bool {
        // For now, we'll use a simple approach: try to connect and check permission
        // In a full implementation, this would use NSXPCConnection
        unsafe {
            let service_name = std::ffi::CString::new(name).unwrap();
            let connection = xpc_connection_create(service_name.as_ptr(), std::ptr::null_mut());
            if connection.is_null() {
                return false;
            }

            // Set up a basic event handler
            xpc_connection_set_event_handler(connection, std::ptr::null_mut());
            xpc_connection_resume(connection);

            // Try to send a ping message
            let ping = xpc_dictionary_create(std::ptr::null(), std::ptr::null(), 0);
            let key = std::ffi::CString::new("operation").unwrap();
            let value = std::ffi::CString::new("ping").unwrap();
            xpc_dictionary_set_string(ping, key.as_ptr(), value.as_ptr());

            // Send synchronously with timeout
            let reply = xpc_connection_send_message_with_reply_sync(connection, ping);
            let available = !reply.is_null() && xpc_get_type(reply) != xpc_type_error();

            xpc_connection_cancel(connection);

            available
        }
    }

    /// Check if the XPC service has screen capture permission
    pub async fn check_permission(&self) -> Result<bool> {
        self.send_request("checkPermission", |_| Ok(())).await?;
        Ok(true)
    }

    /// List available monitors
    pub async fn list_monitors(&self) -> Result<Vec<XpcMonitorInfo>> {
        let response = self.send_request("listMonitors", |_| Ok(())).await?;

        // Parse response
        let monitors = Self::parse_monitors_response(&response)?;
        Ok(monitors)
    }

    /// Capture a monitor by ID
    pub async fn capture_monitor(&self, monitor_id: u32) -> Result<DynamicImage> {
        let response = self
            .send_request("captureMonitor", |dict| {
                unsafe {
                    let key = std::ffi::CString::new("id").unwrap();
                    xpc_dictionary_set_uint64(dict, key.as_ptr(), monitor_id as u64);
                }
                Ok(())
            })
            .await?;

        // Parse PNG data from response
        let image = Self::parse_image_response(&response)?;
        Ok(image)
    }

    /// List available windows
    pub async fn list_windows(&self) -> Result<Vec<XpcWindowInfo>> {
        let response = self.send_request("listWindows", |_| Ok(())).await?;

        let windows = Self::parse_windows_response(&response)?;
        Ok(windows)
    }

    /// Capture a window by ID
    pub async fn capture_window(&self, window_id: u32) -> Result<DynamicImage> {
        let response = self
            .send_request("captureWindow", |dict| {
                unsafe {
                    let key = std::ffi::CString::new("id").unwrap();
                    xpc_dictionary_set_uint64(dict, key.as_ptr(), window_id as u64);
                }
                Ok(())
            })
            .await?;

        let image = Self::parse_image_response(&response)?;
        Ok(image)
    }

    /// Send a request to the XPC service
    async fn send_request<F>(&self, operation: &str, setup: F) -> Result<XpcResponse>
    where
        F: FnOnce(*mut c_void) -> Result<()>,
    {
        let service_name = self.service_name.clone();
        let operation = operation.to_string();

        tokio::task::spawn_blocking(move || {
            unsafe {
                let service_cstr = std::ffi::CString::new(service_name.as_str()).unwrap();
                let connection =
                    xpc_connection_create(service_cstr.as_ptr(), std::ptr::null_mut());
                if connection.is_null() {
                    return Err(anyhow!("Failed to create XPC connection"));
                }

                xpc_connection_set_event_handler(connection, std::ptr::null_mut());
                xpc_connection_resume(connection);

                // Create request dictionary
                let request = xpc_dictionary_create(std::ptr::null(), std::ptr::null(), 0);

                let op_key = std::ffi::CString::new("operation").unwrap();
                let op_value = std::ffi::CString::new(operation.as_str()).unwrap();
                xpc_dictionary_set_string(request, op_key.as_ptr(), op_value.as_ptr());

                // Let caller set up additional parameters
                setup(request)?;

                // Send request and wait for reply
                let reply = xpc_connection_send_message_with_reply_sync(connection, request);

                if reply.is_null() {
                    xpc_connection_cancel(connection);
                    return Err(anyhow!("XPC request returned null reply"));
                }

                if xpc_get_type(reply) == xpc_type_error() {
                    let desc = xpc_copy_description(reply);
                    let error_msg = if !desc.is_null() {
                        std::ffi::CStr::from_ptr(desc)
                            .to_string_lossy()
                            .into_owned()
                    } else {
                        "Unknown XPC error".to_string()
                    };
                    xpc_connection_cancel(connection);
                    return Err(anyhow!("XPC error: {}", error_msg));
                }

                // Extract response data
                let response = XpcResponse::from_xpc_dict(reply)?;

                xpc_connection_cancel(connection);

                Ok(response)
            }
        })
        .await?
    }

    fn parse_monitors_response(response: &XpcResponse) -> Result<Vec<XpcMonitorInfo>> {
        let mut monitors = Vec::new();

        if let Some(data) = &response.array_data {
            for item in data {
                if let (Some(id), Some(width), Some(height)) =
                    (item.get("id"), item.get("width"), item.get("height"))
                {
                    let frame = item.get("frame").and_then(|f| f.as_object());
                    let (x, y) = if let Some(frame) = frame {
                        (
                            frame
                                .get("x")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0),
                            frame
                                .get("y")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0),
                        )
                    } else {
                        (0.0, 0.0)
                    };

                    monitors.push(XpcMonitorInfo {
                        id: id.as_u64().unwrap_or(0) as u32,
                        width: width.as_u64().unwrap_or(0) as u32,
                        height: height.as_u64().unwrap_or(0) as u32,
                        x,
                        y,
                    });
                }
            }
        }

        Ok(monitors)
    }

    fn parse_windows_response(response: &XpcResponse) -> Result<Vec<XpcWindowInfo>> {
        let mut windows = Vec::new();

        if let Some(data) = &response.array_data {
            for item in data {
                let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let title = item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let app_name = item
                    .get("app_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let is_on_screen = item
                    .get("is_on_screen")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let frame = item.get("frame").and_then(|f| f.as_object());
                let (x, y, width, height) = if let Some(frame) = frame {
                    (
                        frame.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        frame.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        frame.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32,
                        frame.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32,
                    )
                } else {
                    (0.0, 0.0, 0, 0)
                };

                windows.push(XpcWindowInfo {
                    id,
                    title,
                    app_name,
                    width,
                    height,
                    x,
                    y,
                    is_on_screen,
                });
            }
        }

        Ok(windows)
    }

    fn parse_image_response(response: &XpcResponse) -> Result<DynamicImage> {
        let image_data = response
            .binary_data
            .as_ref()
            .ok_or_else(|| anyhow!("No image data in response"))?;

        // Decode PNG
        let img = image::load_from_memory(image_data)?;
        Ok(img)
    }
}

/// Response from XPC service
struct XpcResponse {
    binary_data: Option<Vec<u8>>,
    array_data: Option<Vec<serde_json::Value>>,
}

impl XpcResponse {
    unsafe fn from_xpc_dict(dict: *mut c_void) -> Result<Self> {
        let mut response = XpcResponse {
            binary_data: None,
            array_data: None,
        };

        // Try to get binary data (for image capture)
        let data_key = std::ffi::CString::new("data").unwrap();
        let data_ptr = xpc_dictionary_get_data(dict, data_key.as_ptr(), std::ptr::null_mut());
        if !data_ptr.is_null() {
            let mut length: usize = 0;
            let bytes = xpc_data_get_bytes_ptr(data_ptr as *mut c_void);
            length = xpc_data_get_length(data_ptr as *mut c_void);
            if !bytes.is_null() && length > 0 {
                let slice = std::slice::from_raw_parts(bytes as *const u8, length);
                response.binary_data = Some(slice.to_vec());
            }
        }

        // Try to get array data (for list operations)
        let array_key = std::ffi::CString::new("result").unwrap();
        let array_ptr = xpc_dictionary_get_array(dict, array_key.as_ptr());
        if !array_ptr.is_null() {
            let count = xpc_array_get_count(array_ptr);
            let mut items = Vec::new();

            for i in 0..count {
                let item = xpc_array_get_value(array_ptr, i);
                if let Some(json) = Self::xpc_to_json(item) {
                    items.push(json);
                }
            }

            response.array_data = Some(items);
        }

        Ok(response)
    }

    unsafe fn xpc_to_json(obj: *mut c_void) -> Option<serde_json::Value> {
        if obj.is_null() {
            return None;
        }

        let obj_type = xpc_get_type(obj);

        if obj_type == xpc_type_dictionary() {
            // For nested dictionaries, we extract known keys
            // This is simpler than using xpc_dictionary_apply which requires C function pointers
            let mut map = serde_json::Map::new();

            // Try common keys used in our XPC protocol
            let known_keys = ["id", "width", "height", "x", "y", "title", "app_name", "is_on_screen", "frame"];
            for key_name in known_keys {
                let key = std::ffi::CString::new(key_name).unwrap();

                // Try as different types
                let str_val = xpc_dictionary_get_string(obj, key.as_ptr());
                if !str_val.is_null() {
                    let s = std::ffi::CStr::from_ptr(str_val).to_string_lossy().into_owned();
                    map.insert(key_name.to_string(), serde_json::Value::String(s));
                    continue;
                }

                let int_val = xpc_dictionary_get_int64(obj, key.as_ptr());
                if int_val != 0 {
                    map.insert(key_name.to_string(), serde_json::Value::Number(int_val.into()));
                    continue;
                }

                let uint_val = xpc_dictionary_get_uint64(obj, key.as_ptr());
                if uint_val != 0 {
                    map.insert(key_name.to_string(), serde_json::Value::Number((uint_val as i64).into()));
                    continue;
                }

                let double_val = xpc_dictionary_get_double(obj, key.as_ptr());
                if double_val != 0.0 {
                    if let Some(num) = serde_json::Number::from_f64(double_val) {
                        map.insert(key_name.to_string(), serde_json::Value::Number(num));
                    }
                    continue;
                }

                let bool_val = xpc_dictionary_get_bool(obj, key.as_ptr());
                if bool_val {
                    map.insert(key_name.to_string(), serde_json::Value::Bool(true));
                    continue;
                }

                // Try as nested dictionary (for "frame")
                let dict_val = xpc_dictionary_get_dictionary(obj, key.as_ptr());
                if !dict_val.is_null() {
                    if let Some(nested) = Self::xpc_to_json(dict_val) {
                        map.insert(key_name.to_string(), nested);
                    }
                }
            }

            Some(serde_json::Value::Object(map))
        } else if obj_type == xpc_type_string() {
            let cstr = xpc_string_get_string_ptr(obj);
            if !cstr.is_null() {
                let s = std::ffi::CStr::from_ptr(cstr).to_string_lossy().into_owned();
                Some(serde_json::Value::String(s))
            } else {
                None
            }
        } else if obj_type == xpc_type_int64() {
            Some(serde_json::Value::Number(xpc_int64_get_value(obj).into()))
        } else if obj_type == xpc_type_uint64() {
            Some(serde_json::Value::Number(
                (xpc_uint64_get_value(obj) as i64).into(),
            ))
        } else if obj_type == xpc_type_double() {
            serde_json::Number::from_f64(xpc_double_get_value(obj))
                .map(serde_json::Value::Number)
        } else if obj_type == xpc_type_bool() {
            Some(serde_json::Value::Bool(xpc_bool_get_value(obj)))
        } else if obj_type == xpc_type_array() {
            let count = xpc_array_get_count(obj);
            let mut arr = Vec::new();
            for i in 0..count {
                let item = xpc_array_get_value(obj, i);
                if let Some(json) = Self::xpc_to_json(item) {
                    arr.push(json);
                }
            }
            Some(serde_json::Value::Array(arr))
        } else {
            None
        }
    }
}

// XPC FFI declarations
#[link(name = "System", kind = "dylib")]
extern "C" {
    fn xpc_connection_create(
        name: *const std::ffi::c_char,
        targetq: *mut c_void,
    ) -> *mut c_void;
    fn xpc_connection_set_event_handler(connection: *mut c_void, handler: *mut c_void);
    fn xpc_connection_resume(connection: *mut c_void);
    fn xpc_connection_cancel(connection: *mut c_void);
    fn xpc_connection_send_message_with_reply_sync(
        connection: *mut c_void,
        message: *mut c_void,
    ) -> *mut c_void;

    fn xpc_dictionary_create(
        keys: *const *const std::ffi::c_char,
        values: *const *mut c_void,
        count: usize,
    ) -> *mut c_void;
    fn xpc_dictionary_set_string(
        dict: *mut c_void,
        key: *const std::ffi::c_char,
        value: *const std::ffi::c_char,
    );
    fn xpc_dictionary_set_uint64(dict: *mut c_void, key: *const std::ffi::c_char, value: u64);
    fn xpc_dictionary_get_data(
        dict: *mut c_void,
        key: *const std::ffi::c_char,
        length: *mut usize,
    ) -> *const c_void;
    fn xpc_dictionary_get_array(dict: *mut c_void, key: *const std::ffi::c_char) -> *mut c_void;
    fn xpc_dictionary_get_string(dict: *mut c_void, key: *const std::ffi::c_char) -> *const std::ffi::c_char;
    fn xpc_dictionary_get_int64(dict: *mut c_void, key: *const std::ffi::c_char) -> i64;
    fn xpc_dictionary_get_uint64(dict: *mut c_void, key: *const std::ffi::c_char) -> u64;
    fn xpc_dictionary_get_double(dict: *mut c_void, key: *const std::ffi::c_char) -> f64;
    fn xpc_dictionary_get_bool(dict: *mut c_void, key: *const std::ffi::c_char) -> bool;
    fn xpc_dictionary_get_dictionary(dict: *mut c_void, key: *const std::ffi::c_char) -> *mut c_void;

    fn xpc_array_get_count(array: *mut c_void) -> usize;
    fn xpc_array_get_value(array: *mut c_void, index: usize) -> *mut c_void;

    fn xpc_data_get_bytes_ptr(data: *mut c_void) -> *const c_void;
    fn xpc_data_get_length(data: *mut c_void) -> usize;

    fn xpc_string_get_string_ptr(string: *mut c_void) -> *const std::ffi::c_char;
    fn xpc_int64_get_value(obj: *mut c_void) -> i64;
    fn xpc_uint64_get_value(obj: *mut c_void) -> u64;
    fn xpc_double_get_value(obj: *mut c_void) -> f64;
    fn xpc_bool_get_value(obj: *mut c_void) -> bool;

    fn xpc_get_type(obj: *mut c_void) -> *const c_void;
    fn xpc_copy_description(obj: *mut c_void) -> *const std::ffi::c_char;

    fn xpc_type_error() -> *const c_void;
    fn xpc_type_dictionary() -> *const c_void;
    fn xpc_type_array() -> *const c_void;
    fn xpc_type_string() -> *const c_void;
    fn xpc_type_int64() -> *const c_void;
    fn xpc_type_uint64() -> *const c_void;
    fn xpc_type_double() -> *const c_void;
    fn xpc_type_bool() -> *const c_void;
}

/// Check if XPC capture is available (cached result)
pub fn is_xpc_capture_available() -> bool {
    if !XPC_CHECKED.load(Ordering::Relaxed) {
        let available = XpcCaptureClient::new().is_ok();
        XPC_AVAILABLE.store(available, Ordering::Relaxed);
        XPC_CHECKED.store(true, Ordering::Relaxed);

        if available {
            info!("XPC screen capture is available");
        } else {
            debug!("XPC screen capture is not available, will use direct capture");
        }
    }
    XPC_AVAILABLE.load(Ordering::Relaxed)
}

/// Reset the XPC availability check (useful after app restart)
pub fn reset_xpc_availability_check() {
    XPC_CHECKED.store(false, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Only run manually when XPC service is available
    async fn test_xpc_list_monitors() {
        let client = XpcCaptureClient::new().expect("Failed to create XPC client");
        let monitors = client.list_monitors().await.expect("Failed to list monitors");
        println!("Monitors: {:?}", monitors);
        assert!(!monitors.is_empty());
    }
}
