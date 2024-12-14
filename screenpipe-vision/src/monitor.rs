#[cfg(target_os = "macos")]
use xcap_macos::Monitor;

#[cfg(not(target_os = "macos"))]
use xcap::Monitor;

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
