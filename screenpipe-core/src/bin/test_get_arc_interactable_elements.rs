use std::collections::{HashMap, HashSet};
use std::time::Instant;
use tracing::{debug, info, Level};
use tracing_subscriber::FmtSubscriber;

use screenpipe_core::operator::platforms::macos::MacOSEngine;
use screenpipe_core::operator::platforms::AccessibilityEngine;
use screenpipe_core::operator::Selector;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging with DEBUG level to see all logs
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::DEBUG)  
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    debug!("debug logging enabled");
    info!("looking for arc browser...");
    
    // Define interactivity categories with original macOS casing
    let definitely_interactable: HashSet<&str> = [
        "AXButton", "AXMenuItem", "AXMenuBarItem", "AXCheckBox", "AXPopUpButton",
        "AXTextField", "AXTextArea", "AXComboBox", "AXLink", "AXScrollBar",
        "AXSlider", "AXRadioButtonGroup", "AXRadioButton", "AXSearchField",
        "AXTabGroup", "AXTabButton", "AXDisclosureButton", "AXStepper",
        "AXDisclosureTriangle", "AXIncrementor", "AXProgressIndicator"
    ].iter().cloned().collect();
    
    let sometimes_interactable: HashSet<&str> = [
        "AXImage", "AXCell", "AXSplitter", "AXRow", "AXStatusItem",
        "AXLevelIndicator", "AXColumnHeader", "AXRowHeader", "AXDocument",
        "AXDrawer", "AXOutline", "AXOutlineRow", "AXHandleElementProxy",
        "AXBrowser", "AXColumn", "AXGrid", "AXWebArea", "AXGenericElementProxy",
        "AXValueIndicator"
    ].iter().cloned().collect();
    
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

    // Use String::from("") for the text selector to get all elements
    debug!("calling find_elements with empty text selector");
    let elements = engine.find_elements(&Selector::Text(String::from("")), Some(&arc_app))?;
    
    let duration = start.elapsed();
    
    info!("found {} elements in arc browser in {:?}", elements.len(), duration);
    
    // Now organize elements by role
    let mut role_counts: HashMap<String, usize> = HashMap::new();
    
    // Count elements by role - keep original casing
    for element in &elements {
        let role = element.role(); // Remove .to_lowercase() to preserve original casing
        *role_counts.entry(role).or_insert(0) += 1;
    }
    
    // Create category counts
    let mut definitely_interactable_count = 0;
    let mut sometimes_interactable_count = 0;
    let mut non_interactable_count = 0;
    
    // Prepare categorized data for display
    let mut definitely_interactable_roles: Vec<(String, usize)> = Vec::new();
    let mut sometimes_interactable_roles: Vec<(String, usize)> = Vec::new();
    let mut non_interactable_roles: Vec<(String, usize)> = Vec::new();
    
    // Categorize each role and its count
    for (role, count) in &role_counts {
        if definitely_interactable.contains(role.as_str()) {
            definitely_interactable_roles.push((role.clone(), *count));
            definitely_interactable_count += count;
        } else if sometimes_interactable.contains(role.as_str()) {
            sometimes_interactable_roles.push((role.clone(), *count));
            sometimes_interactable_count += count;
        } else {
            non_interactable_roles.push((role.clone(), *count));
            non_interactable_count += count;
        }
    }
    
    // Sort each category by count (highest first)
    definitely_interactable_roles.sort_by(|a, b| b.1.cmp(&a.1));
    sometimes_interactable_roles.sort_by(|a, b| b.1.cmp(&a.1));
    non_interactable_roles.sort_by(|a, b| b.1.cmp(&a.1));
    
    // Display counts by category
    info!("element interactivity breakdown:");
    info!("  definitely interactable: {} elements ({:.1}%)", 
          definitely_interactable_count, 
          (definitely_interactable_count as f64 / elements.len() as f64) * 100.0);
    
    for (role, count) in &definitely_interactable_roles {
        info!("    {}: {}", role, count);
    }
    
    info!("  sometimes interactable: {} elements ({:.1}%)", 
          sometimes_interactable_count,
          (sometimes_interactable_count as f64 / elements.len() as f64) * 100.0);
    
    for (role, count) in &sometimes_interactable_roles {
        info!("    {}: {}", role, count);
    }
    
    info!("  non-interactable: {} elements ({:.1}%)", 
          non_interactable_count,
          (non_interactable_count as f64 / elements.len() as f64) * 100.0);
    
    for (role, count) in &non_interactable_roles {
        info!("    {}: {}", role, count);
    }
    
    Ok(())
}