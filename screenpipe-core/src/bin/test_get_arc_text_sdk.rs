use std::time::Instant;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use screenpipe_core::operator::platforms::macos::MacOSEngine;
use screenpipe_core::operator::platforms::AccessibilityEngine;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

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

    info!("extracting text from arc browser...");
    let start = Instant::now();

    // Get text directly using our improved method
    let text = arc_app.text(10)?;
    
    let duration = start.elapsed();
    
    info!("extracted text from arc browser in {:?}", duration);
    info!("text length: {} characters", text.len());
    info!("text content:\n{}", text);
    
    Ok(())
}