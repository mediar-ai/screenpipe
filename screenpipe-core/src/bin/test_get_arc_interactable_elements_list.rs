// USAGE: cargo run --bin test_get_arc_interactable_elements_list with-text interactable    
// cargo run --bin test_get_arc_interactable_elements_list with-text 
// cargo run --bin test_get_arc_interactable_elements_list with-text interactable click:10 method:mouse


    

use std::collections::{HashMap, HashSet};
use std::time::Instant;
use tracing::{debug, info, Level};
use tracing_subscriber::FmtSubscriber;
use std::env;
use std::path::PathBuf;
use std::fs::OpenOptions;
use std::io::{self, Write};

use screenpipe_core::operator::platforms::macos::MacOSEngine;
use screenpipe_core::operator::platforms::AccessibilityEngine;
use screenpipe_core::operator::Selector;
use screenpipe_core::operator::platforms::macos::ClickMethodSelection;

// Replace the PrintFilter enum with a struct of filter flags
#[derive(Default)]
struct FilterOptions {
    with_text: bool,        // Only show elements with text
    interactable_only: bool, // Only show definitely interactable elements
    include_sometimes: bool, // Include sometimes interactable elements
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging with INFO level for console only
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)  
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    // Remove the early log file setup and keep logs in memory instead
    // We'll create a vector to store all log messages
    let mut log_messages: Vec<String> = Vec::new();
    
    // Helper function to log to console and store for later file writing
    let log_both = |message: &str, log_store: &mut Vec<String>| {
        // Log to console
        info!("{}", message);
        // Store for later file writing
        log_store.push(message.to_string());
    };

    // Parse command line arguments with multiple filter support
    let args: Vec<String> = env::args().collect();
    
    // Initialize default filter options (show all)
    let mut filter_options = FilterOptions::default();
    
    // Variable to store element index to click
    let mut click_element_index: Option<usize> = None;
    
    // Variable to store click method if specified
    let mut click_method = ClickMethodSelection::Auto;
    
    // Process all arguments after the program name
    if args.len() > 1 {
        for arg in args.iter().skip(1) {
            // Check if argument is a click command
            if arg.starts_with("click:") {
                if let Some(index_str) = arg.split(':').nth(1) {
                    if let Ok(index) = index_str.parse::<usize>() {
                        click_element_index = Some(index);
                        info!("will click element #{}", index);
                    } else {
                        info!("invalid element index: {}", index_str);
                    }
                }
            } else if arg.starts_with("method:") {
                if let Some(method_str) = arg.split(':').nth(1) {
                    click_method = match method_str.to_lowercase().as_str() {
                        "axpress" => ClickMethodSelection::AXPress,
                        "axclick" => ClickMethodSelection::AXClick,
                        "mouse" => ClickMethodSelection::MouseSimulation,
                        _ => {
                            info!("unknown click method: {}, using auto", method_str);
                            ClickMethodSelection::Auto
                        }
                    };
                    info!("using click method: {:?}", click_method);
                }
            } else {
                match arg.as_str() {
                    "with-text" => filter_options.with_text = true,
                    "interactable" => filter_options.interactable_only = true,
                    "possibly-interactable" => {
                        filter_options.interactable_only = true;
                        filter_options.include_sometimes = true;
                    },
                    _ => {
                        info!("unknown filter option: {}", arg);
                    }
                }
            }
        }
    }
    
    // Log the active filters
    let mut active_filters = Vec::new();
    if filter_options.with_text {
        active_filters.push("with text");
    }
    if filter_options.interactable_only {
        if filter_options.include_sometimes {
            active_filters.push("definitely or sometimes interactable");
        } else {
            active_filters.push("definitely interactable");
        }
    }
    
    if active_filters.is_empty() {
        info!("print filter: all elements");
    } else {
        info!("print filter: only elements that are {}", active_filters.join(" AND "));
    }

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
    
    // Store the indexes of printed elements to reference them later
    let mut printed_element_indices = Vec::new();
    
    // Print only the elements that match our filter
    for (i, element) in elements.iter().enumerate() {
        // Get the role
        let role = element.role();
        
        // Determine interactability
        let interactability_marker = if definitely_interactable.contains(role.as_str()) {
            "[i]"
        } else if sometimes_interactable.contains(role.as_str()) {
            "[~i~]"
        } else {
            ""
        };
        
        // Get all attributes
        let attributes = element.attributes();
        
        // Collect text from multiple fields
        let mut element_text = String::new();
        
        // Check direct attribute fields
        if let Some(text) = &attributes.value {
            if !text.is_empty() && !element_text.contains(text) {
                element_text.push_str(text);
            }
        }
        if let Some(text) = &attributes.label {
            if !text.is_empty() && !element_text.contains(text) {
                if !element_text.is_empty() {
                    element_text.push_str(" | ");
                }
                element_text.push_str(text);
            }
        }
        if let Some(text) = &attributes.description {
            if !text.is_empty() && !element_text.contains(text) {
                if !element_text.is_empty() {
                    element_text.push_str(" | ");
                }
                element_text.push_str(text);
            }
        }
        
        // Check all requested attributes from properties
        for attr_name in &["AXValue", "AXTitle", "AXDescription", "AXHelp", "AXLabel", "AXText"] {
            if let Some(Some(value)) = attributes.properties.get(*attr_name) {
                if let Some(text) = value.as_str() {
                    if !text.is_empty() && !element_text.contains(text) {
                        if !element_text.is_empty() {
                            element_text.push_str(" | ");
                        }
                        element_text.push_str(text);
                    }
                }
            }
        }
        
        // Apply filters based on multiple criteria
        let has_text = !element_text.is_empty();
        let is_definitely_interactable = definitely_interactable.contains(role.as_str());
        let is_sometimes_interactable = sometimes_interactable.contains(role.as_str());
        
        // Check if the element meets all the active filter criteria
        let mut should_print = true;
        
        // Apply text filter if active
        if filter_options.with_text && !has_text {
            should_print = false;
        }
        
        // Apply interactability filter if active
        if filter_options.interactable_only {
            let passes_interactable = is_definitely_interactable || 
                                     (filter_options.include_sometimes && is_sometimes_interactable);
            if !passes_interactable {
                should_print = false;
            }
        }
        
        // Print only if it matches our filters
        if should_print {
            info!("#{} [{}] {} {}", i, role, interactability_marker, element_text);
            printed_element_indices.push(i);
        }
    }
    
    // If click_element_index is specified, attempt to click that element
    if let Some(index) = click_element_index {
        if index < elements.len() {
            let element = &elements[index];
            let attributes = element.attributes();
            
            // Print detailed information about the element
            info!("element #{} details:", index);
            info!("  role: {}", element.role());
            
            // Print bounds information
            if let Ok((x, y, width, height)) = element.bounds() {
                info!("  bounds: x={:.1}, y={:.1}, width={:.1}, height={:.1}", x, y, width, height);
            } else {
                info!("  bounds: unknown");
            }
            
            // Print label/text information
            if let Some(label) = &attributes.label {
                info!("  label: {}", label);
            }
            if let Some(value) = &attributes.value {
                info!("  value: {}", value);
            }
            if let Some(description) = &attributes.description {
                info!("  description: {}", description);
            }
            
            // Print interactability information
            let role_str = element.role();
            let is_definitely_interactable = definitely_interactable.contains(role_str.as_str());
            let is_sometimes_interactable = sometimes_interactable.contains(role_str.as_str());
            
            if is_definitely_interactable {
                info!("  interactability: definitely interactable");
            } else if is_sometimes_interactable {
                info!("  interactability: sometimes interactable");
            } else {
                info!("  interactability: non-interactable");
            }
            
            // Print hierarchy information
            if let Ok(children) = element.children() {
                info!("  children count: {}", children.len());
            }
            if let Ok(Some(parent)) = element.parent() {
                info!("  parent role: {}", parent.role());
            }
            
            // Print additional properties if any
            if !attributes.properties.is_empty() {
                info!("  additional properties:");
                // Print only a subset of important properties to avoid too much output
                let important_props = ["AXEnabled", "AXFocused", "AXSelected", "AXRequired", "AXEditable"];
                for prop in important_props.iter() {
                    if let Some(Some(value)) = attributes.properties.get(*prop) {
                        info!("    {}: {}", prop, value);
                    }
                }
            }
            
            // Now attempt to click the element
            info!("attempting to click element #{}", index);
            
            match element.click_with_method(click_method) {
                Ok(result) => {
                    info!("successfully clicked element: {}", result.details);
                    if let Some(coords) = result.coordinates {
                        info!("clicked at coordinates: ({:.1}, {:.1})", coords.0, coords.1);
                    }
                    info!("click method used: {}", result.method);
                },
                Err(e) => {
                    info!("failed to click element: {:?}", e);
                }
            }
        } else {
            info!("element index {} is out of range (0-{})", index, elements.len() - 1);
        }
    }
    
    // Now organize elements by role
    let mut role_counts: HashMap<String, usize> = HashMap::new();
    
    // Count elements by role - keep original casing
    for element in &elements {
        let role = element.role();
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
    
    // Now write all collected log messages to file
    let exe_path = env::current_exe()?;
    let exe_dir = exe_path.parent().map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    let log_path = exe_dir.join("arc_elements_log.txt");
    
    info!("saving logs to: {}", log_path.display());
    
    let mut log_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)  // Overwrites file if it exists
        .open(&log_path)?;
    
    // Write header
    writeln!(log_file, "--- ARC ELEMENTS LOG ({}) ---", chrono::Local::now())?;
    writeln!(log_file, "Total elements found: {}", elements.len())?;
    writeln!(log_file, "")?;
    
    // Write interactivity breakdown
    writeln!(log_file, "ELEMENT INTERACTIVITY BREAKDOWN:")?;
    writeln!(log_file, "  Definitely interactable: {} elements ({:.1}%)", 
          definitely_interactable_count, 
          (definitely_interactable_count as f64 / elements.len() as f64) * 100.0)?;
    
    for (role, count) in &definitely_interactable_roles {
        writeln!(log_file, "    {}: {}", role, count)?;
    }
    
    writeln!(log_file, "  Sometimes interactable: {} elements ({:.1}%)", 
          sometimes_interactable_count,
          (sometimes_interactable_count as f64 / elements.len() as f64) * 100.0)?;
    
    for (role, count) in &sometimes_interactable_roles {
        writeln!(log_file, "    {}: {}", role, count)?;
    }
    
    writeln!(log_file, "  Non-interactable: {} elements ({:.1}%)", 
          non_interactable_count,
          (non_interactable_count as f64 / elements.len() as f64) * 100.0)?;
    
    for (role, count) in &non_interactable_roles {
        writeln!(log_file, "    {}: {}", role, count)?;
    }
    
    // Write filtered element details
    writeln!(log_file, "\nFILTERED ELEMENTS:")?;
    for &idx in &printed_element_indices {
        let element = &elements[idx];
        let role = element.role();
        let attributes = element.attributes();
        
        // Build text representation similar to what was shown in console
        let interactability_marker = if definitely_interactable.contains(role.as_str()) {
            "[i]"
        } else if sometimes_interactable.contains(role.as_str()) {
            "[~i~]"
        } else {
            ""
        };
        
        // Collect text from multiple fields (similar to existing code)
        let mut element_text = String::new();
        
        if let Some(text) = &attributes.value {
            if !text.is_empty() && !element_text.contains(text) {
                element_text.push_str(text);
            }
        }
        if let Some(text) = &attributes.label {
            if !text.is_empty() && !element_text.contains(text) {
                if !element_text.is_empty() {
                    element_text.push_str(" | ");
                }
                element_text.push_str(text);
            }
        }
        if let Some(text) = &attributes.description {
            if !text.is_empty() && !element_text.contains(text) {
                if !element_text.is_empty() {
                    element_text.push_str(" | ");
                }
                element_text.push_str(text);
            }
        }
        
        writeln!(log_file, "#{} [{}] {} {}", idx, role, interactability_marker, element_text)?;
    }
    
    info!("log file written to: {}", log_path.display());
    
    Ok(())
}