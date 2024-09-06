
// #[tauri::command]
// pub fn has_screen_capture_access() -> bool {
//     scap::has_permission()
// }

#[tauri::command]
pub fn open_screen_capture_preferences() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn()
        .expect("failed to open system preferences");
}

#[allow(unused_imports)]
#[tauri::command]
pub fn open_mic_preferences() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .spawn()
        .expect("failed to open system preferences");
}

#[allow(unused_imports)]
#[tauri::command]
pub fn reset_screen_permissions() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("tccutil")
        .arg("reset")
        .arg("ScreenCapture")
        .arg("so.cap.desktop")
        .spawn()
        .expect("failed to reset screen permissions");
}

#[tauri::command]
pub fn reset_microphone_permissions() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("tccutil")
        .arg("reset")
        .arg("Microphone")
        .arg("so.cap.desktop")
        .spawn()
        .expect("failed to reset microphone permissions");
}
