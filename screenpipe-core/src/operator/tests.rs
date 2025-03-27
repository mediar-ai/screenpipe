use tracing_subscriber::prelude::*;

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::{filter::LevelFilter, fmt, EnvFilter};

    #[cfg(target_os = "macos")]
    mod macos_tests {
        use serde_json::Value;

        use crate::Desktop;

        use super::*;

        // Setup tracing for tests
        fn setup_tracing() {
            let filter = EnvFilter::from_default_env()
                .add_directive(LevelFilter::DEBUG.into())
                .add_directive("operator=debug".parse().unwrap());

            tracing_subscriber::registry()
                .with(fmt::layer())
                .with(filter)
                .try_init()
                .unwrap_or_default();
        }

        #[test]
        #[ignore]

        fn test_find_buttons_in_iphone_mirroring() {
            setup_tracing();

            // Create a desktop automation instance
            let desktop = match Desktop::new(true, false) {
                Ok(d) => {
                    println!("Successfully created Desktop automation");
                    d
                }
                Err(e) => {
                    println!("Failed to create Desktop automation: {:?}", e);
                    return;
                }
            };

            let app = match desktop.application("Cursor") {
                Ok(w) => w,
                Err(e) => {
                    println!("Failed to find application: {:?}", e);
                    return;
                }
            };
            println!("App: {:?}", app.attributes().label);

            let windows = app.locator("window").unwrap().all().unwrap_or_default();
            println!("Found {} windows", windows.len());

            // Print the window hierarchy to understand the structure
            println!("\n===== WINDOW HIERARCHY =====");
            if let Ok(children) = app.children() {
                println!("App has {} direct children", children.len());
                for (i, child) in children.iter().enumerate() {
                    println!(
                        "Child #{}: role={}, label={:?}, description={:?}",
                        i,
                        child.role(),
                        child.attributes().label,
                        child.attributes().description
                    );

                    // Print the next level down to see buttons
                    if let Ok(grandchildren) = child.children() {
                        println!("  Has {} children", grandchildren.len());
                        for (j, grandchild) in grandchildren.iter().enumerate() {
                            println!(
                                "  Grandchild #{}.{}: role={}, label={:?}, description={:?}",
                                i,
                                j,
                                grandchild.role(),
                                grandchild.attributes().label,
                                grandchild.attributes().description
                            );

                            // Try one more level
                            if let Ok(great_grandchildren) = grandchild.children() {
                                println!("    Has {} children", great_grandchildren.len());
                                for (k, ggc) in great_grandchildren.iter().take(5).enumerate() {
                                    println!(
                                        "    Great-grandchild #{}.{}.{}: role={}, label={:?}",
                                        i,
                                        j,
                                        k,
                                        ggc.role(),
                                        ggc.attributes().label
                                    );
                                }
                                if great_grandchildren.len() > 5 {
                                    println!("    ... and {} more", great_grandchildren.len() - 5);
                                }
                            }
                        }
                    }
                }
            }

            // Find buttons in the application window
            println!("\n===== BUTTON SEARCH RESULTS =====");
            let buttons = match app.locator("button") {
                Ok(locator) => locator.all().unwrap_or_default(),
                Err(_) => Vec::new(),
            };
            println!("Found {} buttons via locator API", buttons.len());

            // Print details about each button by type
            let mut ax_button_count = 0;
            let mut ax_menu_item_count = 0;
            let mut ax_menu_bar_item_count = 0;
            let mut ax_static_text_count = 0;
            let mut ax_image_count = 0;
            let mut other_count = 0;

            for (i, button) in buttons.iter().enumerate() {
                let button_type = if let Some(props) = button.attributes().properties.get("AXRole")
                {
                    let props_str = props.clone();
                    props_str.unwrap_or_default()
                } else {
                    Value::String("unknown".to_string())
                };

                println!(
                    "Button #{}: type={}, role={}, label={:?}, description={:?}",
                    i,
                    button_type,
                    button.role(),
                    button.attributes().label,
                    button.attributes().description
                );

                // if description is "Rust" then click it
                if button.attributes().description == Some("Rust".to_string()) {
                    match button.click() {
                        Ok(_) => println!("Clicked button: {:?}", button.attributes().label),
                        Err(e) => println!("Failed to click button: {:?}", e),
                    }
                }

                // Count by type
                match button_type.as_str() {
                    Some("AXButton") => ax_button_count += 1,
                    Some("AXMenuItem") => ax_menu_item_count += 1,
                    Some("AXMenuBarItem") => ax_menu_bar_item_count += 1,
                    Some("AXStaticText") => ax_static_text_count += 1,
                    Some("AXImage") => ax_image_count += 1,
                    _ => other_count += 1,
                }
            }

            // Print summary of button types
            println!("\n===== BUTTON TYPE SUMMARY =====");
            println!("AXButton: {}", ax_button_count);
            println!("AXMenuItem: {}", ax_menu_item_count);
            println!("AXMenuBarItem: {}", ax_menu_bar_item_count);
            println!("AXStaticText: {}", ax_static_text_count);
            println!("AXImage: {}", ax_image_count);
            println!("Other: {}", other_count);
            println!("Total: {}", buttons.len());

            // Make sure we found at least some buttons
            assert!(buttons.len() > 0, "No buttons found in iPhone Mirroring");

            // Check that we found the standard menu bar items
            assert_eq!(
                ax_menu_bar_item_count, 6,
                "Should find exactly 6 menu bar items"
            );
        }

        #[test]
        #[ignore]
        fn test_scroll_wheel() {
            setup_tracing();

            let desktop = Desktop::new(true, true).unwrap();
            let app = desktop.application("Cursor").unwrap();
            let stuff = app.locator("AXGroup").unwrap().all().unwrap();
            for s in stuff.iter().take(10) {
                println!("s: {:?}", s.role());
                println!("s: {:?}", s.attributes().value);
                println!("s: {:?}", s.attributes().properties);
                println!("s: {:?}", s.text(10).unwrap());
                s.scroll("down", 10000.0).unwrap();
            }
        }

        #[test]
        #[ignore]
        fn test_find_and_fill_text_inputs() {
            setup_tracing();

            // Create a desktop automation instance
            let desktop = match Desktop::new(true, true) {
                Ok(d) => {
                    println!("Successfully created Desktop automation");
                    d
                }
                Err(e) => {
                    println!("Failed to create Desktop automation: {:?}", e);
                    return;
                }
            };

            let app = desktop.application("Arc").unwrap();

            let children = app.children().unwrap();

            println!("App children: {:?}", children.len());

            for (i, child) in children.iter().enumerate() {
                println!("App child #{}: {:?}", i, child.role());
            }

            let inputs = app.locator("AXButton").unwrap().all().unwrap_or_default();

            for input in inputs.clone() {
                println!("input: {:?}", input.id());
                println!("input: {:?}", input.text(10).unwrap());
                println!("input: {:?}", input.attributes().label);
                // println!("input: {:?}", input.type_text("foo").unwrap());
                println!("input: {:?}", input.role());
            }

            let specific_input = app
                .locator(&*format!("#{}", inputs[0].id().unwrap()))
                .unwrap()
                .first()
                .unwrap()
                .unwrap();

            println!("specific_input: {:?}", specific_input.text(10).unwrap());
            println!(
                "specific_input: {:?}",
                specific_input.click().unwrap().details
            );
            println!("specific_input: {:?}", specific_input.role());

            let _ = Desktop::new(true, true).unwrap().application("cursor");
        }

        #[test]
        #[ignore]
        fn test_find_and_fill_text_inputsv2() {
            setup_tracing();

            // Create a desktop automation instance
            let desktop = match Desktop::new(true, true) {
                Ok(d) => {
                    println!("Successfully created Desktop automation");
                    d
                }
                Err(e) => {
                    println!("Failed to create Desktop automation: {:?}", e);
                    return;
                }
            };

            let app = desktop.application("Arc").unwrap();

            let children = app.children().unwrap();

            println!("App children: {:?}", children.len());

            for (i, child) in children.iter().enumerate() {
                println!("App child #{}: {:?}", i, child.role());
            }

            let buttons = app.locator("AXButton").unwrap().all().unwrap_or_default();
            for b in buttons {
                println!("b: {:?}", b.role());
                println!("b: {:?}", b.attributes().label);
                let text = b.text(4).unwrap_or_default();
                println!("b: {:?}", text);
                if text.contains("Click") {
                    println!("clicking");
                    let _ = b.type_text("foo");
                    b.focus().unwrap();
                    if let Err(e) = b.click() {
                        println!("failed to click: {:?}", e);
                    }
                }
            }
            // input.focus().err().unwrap();
            // let text = input.text(10).unwrap();
            // println!("text: {:?}", text);

            // let children = input.children().unwrap();
            // println!("children: {:?}", children.len());
        }
    }
}
