use std::time::Instant;
use tracing::{debug, info, Level};
use tracing_subscriber::FmtSubscriber;

use screenpipe_core::operator::platforms::macos::MacOSEngine;
use screenpipe_core::operator::platforms::AccessibilityEngine;
use screenpipe_core::operator::Selector;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging with DEBUG level to see all logs
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::DEBUG)  // Changed from INFO to DEBUG
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    debug!("debug logging enabled");
    info!("looking for arc browser...");
    
    // Create accessibility engine
    let engine = MacOSEngine::new(true, false)?;
    
    // Get Arc browser application
    let arc_app = match engine.get_application_by_name("Arc") {
        Ok(app) => {
            info!("found arc browser!");
            app
        }
        Err(e) => {
            info!("error finding arc browser: {:?} - is it running?", e);
            return Ok(());
        }
    };

    info!("starting element collection...");
    let start = Instant::now();

    // Use String::from("") for the text selector
    debug!("calling find_elements with empty text selector");
    let elements = engine.find_elements(&Selector::Text(String::from("")), Some(&arc_app))?;
    
    let duration = start.elapsed();
    
    info!("found {} elements in arc browser in {:?}", elements.len(), duration);
        
    Ok(())
}
