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

    info!("looking for messages app...");
    
    // Create accessibility engine
    let engine = MacOSEngine::new(true, false)?;
    
    // Get Messages application
    let messages_app = match engine.get_application_by_name("Messages") {
        Ok(app) => {
            info!("found messages app!");
            app
        }
        Err(e) => {
            info!("error finding messages app: {:?} - is it running?", e);
            return Ok(());
        }
    };

    info!("extracting text from messages app...");
    let start = Instant::now();

    // Get text directly using our improved method
    let text = messages_app.text(10)?;
    
    let duration = start.elapsed();
    
    info!("extracted text from messages app in {:?}", duration);
    info!("text length: {} characters", text.len());
    info!("text content:\n{}", text);
    
    Ok(())
} 