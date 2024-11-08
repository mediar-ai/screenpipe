use std::ffi::{CString, c_char, CStr, c_int};
use anyhow::Result;
use log::{info, warn, error, debug};
use tokio::time::{sleep, Duration};

// FFI bindings for the Swift dylib
#[link(name = "ui_monitor")]
extern "C" {
    fn start_ui_monitoring();
    fn stop_ui_monitoring();
    fn get_current_output(app: *const c_char, window: *const c_char) -> *mut c_char;
    fn get_monitored_apps() -> *mut c_char;
    fn get_windows_for_app(app: *const c_char) -> *mut c_char;
    fn set_logging_function(log_fn: extern "C" fn(*const c_char, c_int));
}

// Define the Rust logging function
extern "C" fn rust_log_function(message: *const c_char, level: c_int) {
    if message.is_null() {
        return;
    }
    let c_str = unsafe { CStr::from_ptr(message) };
    let message_str = c_str.to_string_lossy();

    match level {
        1 => debug!("{}", message_str), // Debug
        2 => info!("{}", message_str),  // Info
        3 => warn!("{}", message_str),  // Warn
        4 => error!("{}", message_str), // Error
        _ => info!("{}", message_str),
    }
}

pub struct UiMonitor;

impl UiMonitor {
    pub fn new() -> Result<Self> {
        unsafe {
            // Set the logging function
            set_logging_function(rust_log_function);
            start_ui_monitoring();
        }
        debug!("ui monitoring started");
        Ok(Self)
    }

    pub fn get_output(&self, app: &str, window: Option<&str>) -> Option<String> {
        unsafe {
            let app = CString::new(app).ok()?;
            let window = window.map(|w| CString::new(w).ok()).flatten();
            
            let ptr = get_current_output(
                app.as_ptr(),
                window.map_or(std::ptr::null(), |w| w.as_ptr())
            );
            
            if ptr.is_null() {
                return None;
            }
            
            let result = std::ffi::CStr::from_ptr(ptr)
                .to_string_lossy()
                .into_owned();
                
            libc::free(ptr as *mut _);
            Some(result)
        }
    }

    pub fn get_monitored_apps(&self) -> Vec<String> {
        unsafe {
            let ptr = get_monitored_apps();
            if ptr.is_null() {
                return vec![];
            }
            
            let result = std::ffi::CStr::from_ptr(ptr)
                .to_string_lossy()
                .into_owned();
                
            libc::free(ptr as *mut _);
            
            result.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        }
    }

    pub fn get_windows_for_app(&self, app: &str) -> Vec<String> {
        unsafe {
            let app = match CString::new(app) {
                Ok(s) => s,
                Err(_) => return vec![],
            };
            
            let ptr = get_windows_for_app(app.as_ptr());
            if ptr.is_null() {
                return vec![];
            }
            
            let result = std::ffi::CStr::from_ptr(ptr)
                .to_string_lossy()
                .into_owned();
                
            libc::free(ptr as *mut _);
            
            result.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        }
    }
}

impl Drop for UiMonitor {
    fn drop(&mut self) {
        unsafe {
            stop_ui_monitoring();
            debug!("ui monitoring stopped");
        }
    }
}

pub async fn run_ui() -> Result<()> {
    info!("starting ui monitoring service...");
    
    loop {
        match UiMonitor::new() {
            Ok(monitor) => {
                info!("ui monitoring initialized successfully");
                
                // Main monitoring loop
                loop {
                    // Get list of monitored apps
                    let apps = monitor.get_monitored_apps();
                    
                    for app in &apps {
                        // Get windows for each app
                        let windows = monitor.get_windows_for_app(app);
                        
                        for window in &windows {
                            // Get output for each window
                            if let Some(output) = monitor.get_output(app, Some(window)) {
                                debug!("ui monitoring - {}/{}: {} chars", 
                                    app, window, output.len());
                            }
                        }
                    }
                    
                    sleep(Duration::from_secs(1)).await;
                }
            }
            Err(e) => {
                error!("failed to initialize ui monitoring: {}", e);
                warn!("retrying in 5 seconds...");
                sleep(Duration::from_secs(5)).await;
            }
        }
    }
}