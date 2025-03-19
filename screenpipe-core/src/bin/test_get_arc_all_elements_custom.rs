use screenpipe_core::operator::{Selector, UIElement};
use screenpipe_core::operator::platforms::AccessibilityEngine;
use screenpipe_core::operator::platforms::macos::MacOSEngine;
use std::collections::VecDeque;
use std::time::Instant;

// Recursive function to collect all UI elements using breadth-first traversal
fn collect_all_elements(root: &UIElement) -> Vec<UIElement> {
    let mut all_elements = Vec::new();
    let mut queue = VecDeque::new();
    queue.push_back(root.clone());
    
    let mut processed = 0;
    let start_time = Instant::now();
    
    while let Some(element) = queue.pop_front() {
        all_elements.push(element.clone());
        
        processed += 1;
        if processed % 100 == 0 {
            println!("processed {} elements so far ({:?} elapsed)", 
                     processed, start_time.elapsed());
        }
        
        if let Ok(children) = element.children() {
            for child in children {
                queue.push_back(child);
            }
        }
    }
    
    println!("collected {} total elements in {:?}", 
             all_elements.len(), start_time.elapsed());
    all_elements
}

// Print summary of collected elements
fn print_element_stats(elements: &[UIElement]) {
    println!("\nelement statistics:");
    
    let mut role_counts = std::collections::HashMap::new();
    
    for element in elements {
        let attrs = element.attributes();
        let role = attrs.role.clone();
        *role_counts.entry(role).or_insert(0) += 1;
    }
    
    println!("found {} unique element roles", role_counts.len());
    
    // Sort roles by count (most frequent first)
    let mut roles: Vec<_> = role_counts.into_iter().collect();
    roles.sort_by(|a, b| b.1.cmp(&a.1));
    
    println!("top 10 element roles:");
    for (i, (role, count)) in roles.iter().take(10).enumerate() {
        println!("  {}: {} - {} instances", i+1, role, count);
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // create engine with default settings
    println!("creating accessibility engine...");
    let engine = MacOSEngine::new(true, true)?;
    
    // find arc browser
    println!("finding arc browser...");
    let arc_app = match engine.get_application_by_name("Arc") {
        Ok(app) => {
            println!("found arc with direct search");
            app
        },
        Err(_) => {
            println!("direct search failed, trying app list");
            
            // get all applications and filter
            let apps = engine.get_applications()?;
            println!("found {} applications", apps.len());
            
            // find arc in the app list
            let arc = apps.into_iter().find(|app| {
                app.attributes().label.as_ref().map_or(false, |label| 
                    label.contains("Arc"))
            });
            
            match arc {
                Some(app) => {
                    println!("found arc in app list");
                    
                    // try to bring it to focus
                    engine.refresh_accessibility_tree(Some("Arc"))?;
                    app
                },
                None => {
                    return Err("couldn't find arc browser".into());
                }
            }
        }
    };
    
    println!("arc app info: {:?}", arc_app.attributes());
    
    // Get all elements from Arc
    println!("collecting all elements from arc (this may take a while)...");
    let all_elements = collect_all_elements(&arc_app);
    
    // Print statistics about the elements
    print_element_stats(&all_elements);
    
    // Sample some elements to explore their structure
    println!("\nsampling elements by depth:");
    
    // Some elements at different depth levels
    let depths = [0, 1, 2, 3, 5, 10]; // different depths to explore
    
    // Build depth map
    let mut elements_by_depth = std::collections::HashMap::new();
    let mut queue = VecDeque::new();
    queue.push_back((arc_app.clone(), 0)); // (element, depth)
    
    while let Some((element, depth)) = queue.pop_front() {
        elements_by_depth.entry(depth).or_insert_with(Vec::new).push(element.clone());
        
        if let Ok(children) = element.children() {
            for child in children {
                queue.push_back((child, depth + 1));
            }
        }
    }
    
    // Display elements at each sample depth
    for &depth in &depths {
        if let Some(elements) = elements_by_depth.get(&depth) {
            println!("\n--- depth {} ({} elements) ---", depth, elements.len());
            
            // Show first few elements at this depth
            for (i, element) in elements.iter().take(3).enumerate() {
                let attrs = element.attributes();
                println!("  {}: role={}, label={:?}", i, attrs.role, attrs.label);
                
            }
        } else {
            println!("\n--- depth {} (no elements) ---", depth);
        }
    }
    
    // Show elements with specific roles
    println!("\nsearching for interesting element roles:");
    let interesting_roles = ["AXButton", "AXTextField", "AXLink", "AXWebArea", "AXStaticText"];
    
    for role in interesting_roles {
        let matching = all_elements.iter()
            .filter(|e| e.attributes().role == role)
            .collect::<Vec<_>>();
        
        println!("\nfound {} elements with role '{}'", matching.len(), role);
        
        // Show sample of these elements
        for (i, element) in matching.iter().take(3).enumerate() {
            let attrs = element.attributes();
            println!("  {}: label={:?}", i, attrs.label);
            
            // Try to show description if available
            if let Some(desc) = &attrs.description {
                println!("    description: {}", desc);
            }
            
            // Try to show value if available
            if let Some(val) = &attrs.value {
                println!("    value: {:?}", val);
            }
        }
    }
    
    Ok(())
}