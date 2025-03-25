use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use screenpipe_core::operator::platforms::macos::MacOSEngine;
use screenpipe_core::operator::platforms::AccessibilityEngine;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("fetching all running applications...");
    
    // create accessibility engine - true for use_background_apps, false for activate_app
    let engine = MacOSEngine::new(true, false)?;
    
    // get all applications
    let apps = engine.get_applications()?;
    
    info!("found {} applications", apps.len());
    
    // collect app details
    let mut app_details = Vec::new();
    for app in apps {
        let attrs = app.attributes();
        
        // get process id if available
        let pid = if let Some(Some(pid_value)) = attrs.properties.get("AXPid") {
            if let Some(pid_str) = pid_value.as_str() {
                pid_str.parse::<i32>().ok()
            } else {
                None
            }
        } else {
            None
        };
        
        app_details.push((attrs.label.unwrap_or_default(), pid, attrs.role));
    }
    
    // sort by name for easier viewing
    app_details.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    
    // print application details
    info!("application details:");
    for (i, (name, pid, role)) in app_details.iter().enumerate() {
        info!("{}. '{}' (pid: {:?}, role: {})", i+1, name, pid, role);
    }
    
    Ok(())
}
