use xcap::Monitor;

pub async fn list_monitors() -> Vec<Monitor> {
    Monitor::all().unwrap().to_vec()
}

pub async fn get_default_monitor() -> Monitor {
    list_monitors().await.first().unwrap().clone()
}

pub async fn get_monitor_by_id(id: u32) -> Option<Monitor> {
    list_monitors().await.iter().find(|m| m.id() == id).cloned()
}
