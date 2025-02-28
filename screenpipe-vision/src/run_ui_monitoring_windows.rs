use anyhow::{Ok, Result};
use serde::{Deserialize, Serialize};
use windows::{
    Win32::Foundation::HWND,
    core::*,
    Win32::UI::Accessibility::*,
    Win32::UI::WindowsAndMessaging::*,
};

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    app_name: String,
    window_name: String,
    elements: Vec<ElementAttributes>,
    text_output: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ElementAttributes {
    name: String,
    control_type: i32,
    children: Vec<Self>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UIFrame {
    windows: isize, // Store HWND as an integer
    app_name : String,
    text_output: String,
    initial_traversal_time:u64,
}


fn get_foreground_windows()-> Result<HWND>{
    unsafe {
        let hwnd  = GetForegroundWindow();
        if hwnd.is_invalid() {
                Err(anyhow::Error::msg("Failed to get foreground window"))
        }else {
            Ok(hwnd)
        }
    }

}



pub async fn run_ui() -> Result<()> {
    Ok(())
}
