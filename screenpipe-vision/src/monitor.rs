use scap::{
    capturer::{Capturer, Options},
    get_all_targets, Target,
};

#[derive(Debug, Clone)]
pub struct Monitor {
    pub id: u32,
    pub name: String,
    // pub width: u32,
    // pub height: u32,
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
        .enumerate()
        .map(|(index, m)| {
            if let Target::Display(display) = m {
                Monitor {
                    id: display.id,
                    name: display.title.clone(),
                    // width: display.raw_handle.screen_size().width as u32,
                    // height: display.raw_handle.screen_size().height as u32,
                    // is_primary: display.raw_handle.is_active(),
                    is_primary: index == 0, // HACK bcs not available in windows
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

pub async fn get_capturer(monitor_id: u32, fps: u32) -> Capturer {
    let monitor = get_target_by_id(monitor_id).await.unwrap();

    let options = Options {
        fps,
        target: Some(monitor.clone()),
        show_cursor: true,
        show_highlight: false,
        excluded_targets: None,
        output_type: scap::frame::FrameType::RGB,
        output_resolution: scap::capturer::Resolution::_1080p, // TODO
        ..Default::default()
    };

    Capturer::new(options)
}
