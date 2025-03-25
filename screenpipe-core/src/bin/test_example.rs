use screenpipe_core::operator::{Selector, UIElement};
use screenpipe_core::operator::platforms::AccessibilityEngine;
use screenpipe_core::operator::platforms::macos::MacOSEngine;

fn print_element_tree(element: &UIElement, depth: usize) {
    let attrs = element.attributes();
    let indent = "  ".repeat(depth);
    let label = attrs.label.unwrap_or_default();
    
    println!("{}role: {}, label: {}", indent, attrs.role, label);
    
    if depth < 3 { // limit depth for readability
        if let Ok(children) = element.children() {
            for child in children.iter().take(3) { // limit to 3 children 
                print_element_tree(child, depth + 1);
            }
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // create engine with default settings
    println!("creating accessibility engine...");
    let engine = MacOSEngine::new(true, true)?;
    
    // specifically find and focus the Arc browser
    println!("finding arc browser and focusing it...");
    
    // method 1: direct application search + focus  
    let arc_app = match engine.get_application_by_name("Arc") {
        Ok(app) => {
            println!("found arc with direct search");
            app
        },
        Err(_) => {
            println!("direct search failed, trying app list");
            
            // method 2: get all applications and filter
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
    
    // test with wildcard role
    let selector = Selector::Role { 
        role: "*".to_string(), 
        name: None 
    };
    
    println!("finding elements with wildcard role in arc...");
    
    // find elements within arc
    let elements = engine.find_elements(&selector, Some(&arc_app))?;
    println!("found {} elements with wildcard role", elements.len());
    
    // print info about first few
    for (i, element) in elements.iter().take(10).enumerate() {
        let attrs = element.attributes();
        println!("{}: role={}, label={:?}", i, attrs.role, attrs.label);
    }
    
    // get direct children as a comparison
    println!("\ngetting direct children of arc...");
    if let Ok(children) = arc_app.children() {
        println!("arc has {} direct children", children.len());
        
        // print first few children
        for (i, child) in children.iter().take(10).enumerate() {
            let attrs = child.attributes();
            println!("child {}: role={}, label={:?}", i, attrs.role, attrs.label);
            
            // try to get grandchildren for first couple of children
            if i < 2 {
                if let Ok(grandchildren) = child.children() {
                    println!("  child {} has {} children", i, grandchildren.len());
                    
                    // print first few grandchildren
                    for (j, grandchild) in grandchildren.iter().take(3).enumerate() {
                        let gc_attrs = grandchild.attributes();
                        println!("    grandchild {}.{}: role={}, label={:?}", 
                                 i, j, gc_attrs.role, gc_attrs.label);
                    }
                }
            }
        }
    }
    
    Ok(())
}