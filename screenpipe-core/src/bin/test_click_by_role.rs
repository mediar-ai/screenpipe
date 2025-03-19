use screenpipe_core::operator::{Selector, UIElement};
use screenpipe_core::operator::platforms::AccessibilityEngine;
use screenpipe_core::operator::platforms::macos::{MacOSEngine, ClickMethodSelection};
use anyhow::Result;
use tracing::{debug, info};

fn main() -> Result<()> {
    // Add direct console output
    println!("program starting...");
    
    // Initialize tracing/logging with more verbosity
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::TRACE)
        .init();
    
    println!("tracing initialized");
    
    println!("creating accessibility engine...");
    info!("creating accessibility engine...");
    let engine = MacOSEngine::new(true, true)?;
    
    // Find Arc browser and focus it (similar to test_role.rs)
    info!("finding arc browser and focusing it...");
    
    let arc_app = match engine.get_application_by_name("Arc") {
        Ok(app) => {
            info!("found arc with direct search");
            app
        },
        Err(_) => {
            info!("direct search failed, trying app list");
            
            // Method 2: get all applications and filter
            let apps = engine.get_applications()?;
            info!("found {} applications", apps.len());
            
            // Find arc in the app list
            let arc = apps.into_iter().find(|app| {
                app.attributes().label.as_ref().map_or(false, |label| 
                    label.contains("Arc"))
            });
            
            match arc {
                Some(app) => {
                    info!("found arc in app list");
                    
                    // Try to bring it to focus
                    engine.refresh_accessibility_tree(Some("Arc"))?;
                    app
                },
                None => {
                    return Err(anyhow::anyhow!("couldn't find arc browser"));
                }
            }
        }
    };
    
    info!("looking for first element containing 'whatsapp2llm'...");
    
    // Create a selector for any element with text
    let selector = Selector::Text("whatsapp2llm".to_string());
    
    // Find elements and take only the first match
    let elements = engine.find_elements(&selector, Some(&arc_app))?;
    info!("search found {} elements, using first match", elements.len());
    
    // Click the first matching element if found
    if let Some(element) = elements.first() {
        let attrs = element.attributes();
        info!("Found match: role={}, label={:?}", attrs.role, attrs.label);
        
        // Get position info if available
        if let Ok((x, y, width, height)) = element.bounds() {
            info!("  position: ({}, {}), size: ({}, {})", x, y, width, height);
        }
        
        info!("attempting to click element with text 'whatsapp2llm' using mouse simulation...");
        
        // Use mouse simulation specifically
        match element.click_with_method(ClickMethodSelection::MouseSimulation) {
            Ok(result) => {
                info!("mouse simulation click successful");
                info!("click details: {}", result.details);
                
                if let Some((x, y)) = result.coordinates {
                    info!("clicked at coordinates: ({:.1}, {:.1})", x, y);
                }
                
                // Add delay between clicks
                info!("waiting 500ms before second click...");
                std::thread::sleep(std::time::Duration::from_millis(500));
                
                // Second click also with mouse simulation
                match element.click_with_method(ClickMethodSelection::MouseSimulation) {
                    Ok(result2) => {
                        info!("second mouse simulation click successful");
                        info!("click details: {}", result2.details);
                        
                        if let Some((x, y)) = result2.coordinates {
                            info!("second clicked at coordinates: ({:.1}, {:.1})", x, y);
                        }
                    },
                    Err(e) => {
                        info!("second click failed: {:?}", e);
                    }
                }
            },
            Err(e) => {
                info!("first click failed: {:?}", e);
            }
        }
    } else {
        info!("no elements with 'whatsapp2llm' text found to click");
    }
    
    Ok(())
}
