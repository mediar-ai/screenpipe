//! Windows-specific overlay window functionality
//!
//! This module provides Win32 API wrappers to create click-through overlay windows
//! similar to macOS NSPanel behavior. The overlay can be toggled between:
//! - Click-through mode: mouse events pass through to windows below
//! - Interactive mode: window receives mouse events normally

use tauri::WebviewWindow;
use tracing::{error, info};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, SetWindowPos,
    GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW, SWP_NOMOVE, SWP_NOSIZE,
    WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_TOOLWINDOW,
};

/// Extended window styles for overlay behavior
/// Note: Removed WS_EX_NOACTIVATE so window can receive keyboard focus for shortcuts
const OVERLAY_EX_STYLE: i32 = (WS_EX_LAYERED.0 | WS_EX_TOOLWINDOW.0) as i32;
const CLICK_THROUGH_STYLE: i32 = WS_EX_TRANSPARENT.0 as i32;

/// Retrieves the HWND from a Tauri WebviewWindow
///
/// # Safety
/// This function uses raw window handles which require careful handling
pub fn get_hwnd(window: &WebviewWindow) -> Option<HWND> {
    use raw_window_handle::HasWindowHandle;

    match window.window_handle() {
        Ok(handle) => {
            match handle.as_raw() {
                raw_window_handle::RawWindowHandle::Win32(win32_handle) => {
                    let hwnd = HWND(win32_handle.hwnd.get() as *mut std::ffi::c_void);
                    Some(hwnd)
                }
                _ => {
                    error!("Window handle is not Win32");
                    None
                }
            }
        }
        Err(e) => {
            error!("Failed to get window handle: {}", e);
            None
        }
    }
}

/// Configures a window as an overlay with optional click-through behavior
///
/// This sets up the window with:
/// - WS_EX_LAYERED: Required for transparency and click-through
/// - WS_EX_TOOLWINDOW: Prevents showing in taskbar/alt-tab
/// - WS_EX_NOACTIVATE: Prevents stealing focus
/// - HWND_TOPMOST: Always on top of other windows
pub fn setup_overlay(window: &WebviewWindow, click_through: bool) -> Result<(), String> {
    let hwnd = get_hwnd(window).ok_or("Failed to get HWND")?;

    unsafe {
        // Get current extended style
        let current_style = GetWindowLongW(hwnd, GWL_EXSTYLE);

        // Build new style with overlay flags
        let mut new_style = current_style | OVERLAY_EX_STYLE;

        if click_through {
            new_style |= CLICK_THROUGH_STYLE;
        }

        // Apply the new style
        let result = SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
        if result == 0 {
            // SetWindowLongW returns 0 on failure, but also returns 0 if previous value was 0
            // Check GetLastError for actual failures
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() != Some(0) {
                return Err(format!("SetWindowLongW failed: {}", err));
            }
        }

        // Set as topmost window, keeping Tauri's position and size.
        // Tauri already positioned the window on the correct monitor with
        // proper logical coordinates — don't override with GetSystemMetrics
        // which only returns primary monitor physical pixels and breaks
        // multi-monitor and DPI-scaled setups.
        let pos_result = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0, 0, 0, 0,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOMOVE | SWP_NOSIZE,
        );

        if let Err(e) = pos_result {
            return Err(format!("SetWindowPos failed: {}", e));
        }

        info!(
            "Overlay setup complete - click_through: {}, style: 0x{:X}",
            click_through, new_style
        );
    }

    Ok(())
}

/// Enables click-through mode on the overlay
///
/// When enabled, all mouse events pass through to windows below.
/// Use this when the overlay should not intercept user input.
pub fn enable_click_through(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = get_hwnd(window).ok_or("Failed to get HWND")?;

    unsafe {
        let current_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_style = current_style | CLICK_THROUGH_STYLE;

        let result = SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
        if result == 0 {
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() != Some(0) {
                return Err(format!("Failed to enable click-through: {}", err));
            }
        }

        info!("Click-through enabled");
    }

    Ok(())
}

/// Disables click-through mode on the overlay
///
/// When disabled, the window receives mouse events normally.
/// Use this when the user needs to interact with the overlay.
pub fn disable_click_through(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = get_hwnd(window).ok_or("Failed to get HWND")?;

    unsafe {
        let current_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_style = current_style & !CLICK_THROUGH_STYLE;

        let result = SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
        if result == 0 {
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() != Some(0) {
                return Err(format!("Failed to disable click-through: {}", err));
            }
        }

        info!("Click-through disabled");
    }

    Ok(())
}

/// Checks if click-through is currently enabled on the window
pub fn is_click_through_enabled(window: &WebviewWindow) -> bool {
    if let Some(hwnd) = get_hwnd(window) {
        unsafe {
            let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            (style & CLICK_THROUGH_STYLE) != 0
        }
    } else {
        false
    }
}

/// Brings the overlay window to the front without activating it
pub fn bring_to_front(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = get_hwnd(window).ok_or("Failed to get HWND")?;

    unsafe {
        // Keep existing position and size — just re-assert TOPMOST
        let result = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0, 0, 0, 0,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOMOVE | SWP_NOSIZE,
        );

        if let Err(e) = result {
            return Err(format!("Failed to bring to front: {}", e));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Unit tests would require a running Tauri app context
    // Integration tests should be done in the main application
}
