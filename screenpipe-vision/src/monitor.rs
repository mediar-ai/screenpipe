use std::sync::Arc;

use xcap::{Monitor, Window};

// ! logic here: we pick the biggest window and assume it's the one showing the most text that will be grabbed by OCR
// TODO: longer term we should define a data structure for OCR on specific monitor, window, etc.
pub async fn get_focused_window(monitor: Arc<Monitor>) -> Option<Window> {
    let windows = Window::all().unwrap_or_default();

    let focused_window = windows
        .into_iter()
        .filter(|w| w.current_monitor().id() == monitor.id())
        .filter(|w| !is_system_window(w))
        .filter(|w| is_significant_size(w, &monitor))
        .max_by_key(|w| w.width() * w.height());

    focused_window
}

fn is_system_window(window: &Window) -> bool {
    // TODO linux windows
    let system_apps = ["Dock", "Window Server", "Control Centre", "WindowManager"];
    system_apps.contains(&window.app_name())
}

fn is_significant_size(window: &Window, monitor: &Monitor) -> bool {
    let window_area = window.width() * window.height();
    let monitor_area = monitor.width() * monitor.height();
    let ratio = window_area as f64 / monitor_area as f64;

    // Consider windows that take up between 20% and 100% of the screen
    ratio > 0.2 && ratio <= 1.0
}

pub async fn get_windows_for_monitor(monitor: Monitor) -> Vec<Window> {
    Window::all()
        .unwrap_or_default()
        .into_iter()
        .filter(|w| w.current_monitor().id() == monitor.id())
        .collect()
}

pub async fn list_monitors() -> Vec<Monitor> {
    let monitors = Monitor::all().unwrap();
    return monitors.iter().map(|m| m.clone()).collect();
}

pub async fn get_default_monitor() -> Monitor {
    let monitors = list_monitors().await;
    return monitors.first().unwrap().clone();
}

pub async fn get_monitor_by_id(id: u32) -> Option<Monitor> {
    let monitors = list_monitors().await;
    monitors.iter().find(|m| m.id() == id).cloned()
}
