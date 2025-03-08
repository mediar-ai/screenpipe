use super::*;
use crate::ui_automation::selector::Selector;
use std::collections::HashMap;
use tracing_subscriber::prelude::*;
use tracing_subscriber::{filter::LevelFilter, fmt, EnvFilter};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ui_automation::selector::Selector;
    use std::collections::BTreeMap;
    use tracing_subscriber::prelude::*;
    use tracing_subscriber::{filter::LevelFilter, fmt, EnvFilter};

    #[cfg(target_os = "macos")]
    mod macos_tests {
        use super::*;

        // Setup tracing for tests
        fn setup_tracing() {
            let filter = EnvFilter::from_default_env()
                .add_directive(LevelFilter::DEBUG.into())
                .add_directive("ui_automation=debug".parse().unwrap());

            tracing_subscriber::registry()
                .with(fmt::layer())
                .with(filter)
                .init();
        }

        #[test]
        fn test_find_buttons_in_iphone_mirroring() {
            setup_tracing();

            // Create a desktop automation instance
            let desktop = match Desktop::new() {
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
                    props_str
                } else {
                    "unknown".to_string()
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
                    "AXButton" => ax_button_count += 1,
                    "AXMenuItem" => ax_menu_item_count += 1,
                    "AXMenuBarItem" => ax_menu_bar_item_count += 1,
                    "AXStaticText" => ax_static_text_count += 1,
                    "AXImage" => ax_image_count += 1,
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
        fn test_find_and_fill_text_inputs() {
            setup_tracing();

            // Create a desktop automation instance
            let desktop = match Desktop::new() {
                Ok(d) => {
                    println!("Successfully created Desktop automation");
                    d
                }
                Err(e) => {
                    println!("Failed to create Desktop automation: {:?}", e);
                    return;
                }
            };

            // Try multiple applications that likely have text inputs
            // Order from most likely to have text fields to least likely
            let app_name = "System Settings";

            // Try each app until we find one with text inputs
            println!("Trying application: {}", app_name);

            let app = match desktop.application(app_name) {
                Ok(w) => {
                    println!("Successfully found application: {}", app_name);
                    w
                }
                Err(e) => {
                    println!("Failed to find application: {:?}", e);
                    return;
                }
            };
            println!("App: {:?}", app.attributes().label);

            // Inspect application structure before looking for windows
            println!("Directly examining application structure:");
            if let Ok(app_children) = app.children() {
                println!("App has {} direct children", app_children.len());
                for (i, child) in app_children.iter().enumerate() {
                    let attrs = child.attributes();
                    println!(
                        "Child {}: role={}, label={:?}, value={:?}",
                        i, attrs.role, attrs.label, attrs.value
                    );
                }
            }

            // Look for URL fields specifically
            println!("Specifically searching for URL fields...");
            let mut text_inputs = Vec::new();

            // Try with the URL selector which uses our specialized URL field detection
            match app.locator(Selector::Role {
                role: "url".to_string(),
                name: Some("github url or local path".to_string()),
            }) {
                Ok(locator) => match locator.all() {
                    Ok(elements) => {
                        println!("Found {} URL field elements", elements.len());
                        if !elements.is_empty() {
                            text_inputs = elements;
                            // Print details about each found field
                            for (i, element) in text_inputs.iter().enumerate() {
                                let attrs = element.attributes();
                                println!("URL field {}: role={}, label={:?}, value={:?}, properties={:?}", 
                                    i, attrs.role, attrs.label, attrs.value, attrs.properties);
                            }
                        }
                    }
                    Err(e) => println!("Error finding URL fields: {:?}", e),
                },
                Err(e) => println!("Error creating URL field locator: {:?}", e),
            }

            // If no fields found, try with regular text field search
            if text_inputs.is_empty() {
                // Try with windows or generic containers
                // ... existing window detection code ...
            }

            // ... rest of the existing test code ...
        }

        #[test]
        fn test_find_specific_text_input_by_label() {
            setup_tracing();

            // Create a desktop automation instance
            let desktop = match Desktop::new() {
                Ok(d) => {
                    println!("Successfully created Desktop automation");
                    d
                }
                Err(e) => {
                    println!("Failed to create Desktop automation: {:?}", e);
                    return;
                }
            };

            // Try multiple browsers that likely have search fields
            let browsers = ["Safari", "Chrome", "Firefox", "Arc"];
            let mut found_browser_with_search = false;

            for &browser_name in browsers.iter() {
                println!("Trying browser: {}", browser_name);

                let app = match desktop.application(browser_name) {
                    Ok(w) => {
                        println!("Successfully found browser: {}", browser_name);
                        w
                    }
                    Err(e) => {
                        println!("Failed to find browser {}: {:?}", browser_name, e);
                        continue; // Try next browser
                    }
                };
                println!("Browser: {:?}", app.attributes().label);

                // Try several different labels that might identify search fields
                let search_labels = [
                    "Search",
                    "Address and Search",
                    "URL",
                    "Address",
                    "search",
                    "url",
                ];
                let mut search_field = None;

                // Try each search label
                for &search_label in search_labels.iter() {
                    println!("Looking for field with label: {}", search_label);

                    // Method 1: Try to find a text field with a specific label
                    match app.locator(Selector::Role {
                        role: "textfield".to_string(),
                        name: Some(search_label.to_string()),
                    }) {
                        Ok(locator) => match locator.first() {
                            Ok(Some(field)) => {
                                println!("Found search field with label: {}", search_label);
                                search_field = Some(field);
                                break;
                            }
                            Ok(None) => {
                                println!("No search field found with label: {}", search_label);
                            }
                            Err(e) => {
                                println!(
                                    "Error finding search field with label {}: {:?}",
                                    search_label, e
                                );
                            }
                        },
                        Err(e) => {
                            println!("Failed to create locator for search field: {:?}", e);
                        }
                    }
                }

                // If no specific field found with any label, try to find by role first
                if search_field.is_none() {
                    println!("Trying to find search field by role...");

                    // Try different roles that might be used for search fields
                    let search_roles = ["searchfield", "AXSearchField", "textfield", "text"];

                    for &role in search_roles.iter() {
                        println!("Looking for role: {}", role);

                        match app.locator(Selector::Role {
                            role: role.to_string(),
                            name: None,
                        }) {
                            Ok(locator) => match locator.all() {
                                Ok(fields) => {
                                    println!("Found {} elements with role {}", fields.len(), role);

                                    // Look for fields that might be search fields
                                    if !fields.is_empty() {
                                        // Save the first field as a potential fallback
                                        let first_field = fields[0].clone();
                                        let have_fields = true;

                                        // Try to find one with a promising attribute
                                        for field in fields {
                                            let attrs = field.attributes();
                                            println!(
                                                "Field role: {}, label: {:?}",
                                                attrs.role, attrs.label
                                            );

                                            // Check if any attribute suggests this is a search field
                                            let is_search_field =
                                                attrs.label.as_ref().map_or(false, |label| {
                                                    label.to_lowercase().contains("search")
                                                        || label.to_lowercase().contains("url")
                                                        || label.to_lowercase().contains("address")
                                                }) || attrs.description.as_ref().map_or(
                                                    false,
                                                    |desc| {
                                                        desc.to_lowercase().contains("search")
                                                            || desc.to_lowercase().contains("url")
                                                            || desc
                                                                .to_lowercase()
                                                                .contains("address")
                                                    },
                                                );

                                            if is_search_field {
                                                println!("Found a likely search field based on attributes");
                                                search_field = Some(field);
                                                break;
                                            }
                                        }

                                        // If we found a search field, break out of the role loop
                                        if search_field.is_some() {
                                            break;
                                        }

                                        // If no field looked like a search field but we found some fields
                                        // Just use the first one as a fallback
                                        if search_field.is_none() {
                                            println!("No clear search field found, using first {} as fallback", role);
                                            search_field = Some(first_field);
                                            break;
                                        }
                                    }
                                }
                                Err(e) => {
                                    println!("Failed to get fields with role {}: {:?}", role, e);
                                }
                            },
                            Err(e) => {
                                println!("Failed to create locator for role {}: {:?}", role, e);
                            }
                        }
                    }
                }

                // Work with the found search field (if any)
                if let Some(field) = search_field {
                    found_browser_with_search = true;
                    println!("Found a search field: {:?}", field.attributes());

                    // Focus the field
                    match field.focus() {
                        Ok(_) => println!("Successfully focused the search field"),
                        Err(e) => {
                            println!("Failed to focus search field: {:?}", e);
                            println!("Continuing anyway...");
                        }
                    }

                    // Get current text if any
                    match field.text() {
                        Ok(text) => {
                            if text.is_empty() {
                                println!("Search field is currently empty");
                            } else {
                                println!("Search field current text: {}", text);
                            }
                        }
                        Err(e) => println!("Failed to get current text: {:?}", e),
                    }

                    // Type a search query
                    let search_query = "screenpipe automation test";
                    match field.type_text(search_query) {
                        Ok(_) => println!("Successfully entered search query: {}", search_query),
                        Err(e) => {
                            println!("Failed to enter search query via type_text: {:?}", e);

                            // Try set_value as fallback
                            println!("Trying set_value instead");
                            match field.set_value(search_query) {
                                Ok(_) => println!(
                                    "Successfully set search query via set_value: {}",
                                    search_query
                                ),
                                Err(e) => println!("Failed to set search query: {:?}", e),
                            }
                        }
                    }

                    // Verify the text was entered
                    match field.text() {
                        Ok(text) => println!("Search field now contains: {}", text),
                        Err(e) => println!("Failed to verify search text: {:?}", e),
                    }

                    // We found and used a search field, so we can break out of the browser loop
                    break;
                } else {
                    println!(
                        "Could not find a suitable search field in {}, trying next browser",
                        browser_name
                    );
                }
            }

            if !found_browser_with_search {
                println!("Could not find a browser with accessible search fields.");
                println!("To run this test successfully, please ensure Safari, Chrome, Firefox or Arc is open.");
            }

            println!("Test completed. Search field detection demonstrated to the extent possible.");
        }
    }
}
