use scap::{get_all_targets, Target};

#[derive(Debug, Clone)]
pub struct Monitor {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

pub async fn list_monitors() -> Vec<Monitor> {
    // filter those which are Target::Display
    let monitors: Vec<Target> = get_all_targets()
        .into_iter()
        .filter(|m| matches!(m, Target::Display(_)))
        .collect();
    monitors
        .iter()
        .map(|m| {
            if let Target::Display(display) = m {
                Monitor {
                    id: display.id,
                    name: display.title.clone(),
                    width: display.raw_handle.screen_size().width as u32,
                    height: display.raw_handle.screen_size().height as u32,
                    is_primary: display.raw_handle.is_active(),
                }
            } else {
                unreachable!("All targets should be Display at this point")
            }
        })
        .collect()
}

pub async fn get_default_monitor() -> Monitor {
    let monitors = list_monitors().await;
    monitors.first().unwrap().clone()
}

pub async fn get_monitor_by_id(id: u32) -> Option<Monitor> {
    let monitors = list_monitors().await;
    monitors.iter().find(|m| m.id == id).cloned()
}

pub async fn get_target_by_id(id: u32) -> Option<Target> {
    let monitors: Vec<Target> = get_all_targets()
        .into_iter()
        .filter(|m| matches!(m, Target::Display(_)))
        .collect();
    monitors.iter().find_map(|m| {
        if let Target::Display(display) = m {
            (display.id == id).then(|| m.clone())
        } else {
            None
        }
    })
}
