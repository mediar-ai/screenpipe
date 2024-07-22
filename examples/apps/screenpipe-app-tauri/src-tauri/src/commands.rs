#[tauri::command]
fn send_feedback() -> String {
    // Here you would typically implement the logic to send feedback
    // For now, we'll just return a message
    "Feedback sent successfully".to_string()
}

#[tauri::command]
fn toggle_analytics(app_handle: tauri::AppHandle) -> bool {
    // This is a simplified example. You'd typically store this in a persistent config
    let analytics_enabled = app_handle.state::<bool>("analytics_enabled");
    let mut analytics_enabled = analytics_enabled.inner().clone();
    analytics_enabled = !analytics_enabled;
    *app_handle.state::<bool>("analytics_enabled").inner() = analytics_enabled;
    analytics_enabled
}

#[tauri::command]
fn quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}
