use super::*;

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::{filter::LevelFilter, fmt, EnvFilter};

    #[cfg(target_os = "macos")]
    mod macos_tests {
        use super::*;

        fn setup_tracing() {
            // Initialize tracing with debug level for our module
            let filter =
                EnvFilter::from_default_env().add_directive("ui_automation=debug".parse().unwrap());

            let subscriber = fmt::Subscriber::builder()
                .with_env_filter(filter)
                .with_max_level(LevelFilter::DEBUG)
                .finish();

            // Don't fail if it's already been initialized in another test
            let _ = tracing::subscriber::set_global_default(subscriber);
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
            let app_names = ["Arc"];

            let mut found_app_with_text_fields = false;

            // Try each app until we find one with text inputs
            for &app_name in app_names.iter() {
                println!("Trying application: {}", app_name);

                let app = match desktop.application(app_name) {
                    Ok(w) => {
                        println!("Successfully found application: {}", app_name);
                        w
                    }
                    Err(e) => {
                        println!("Failed to find application: {:?}", e);
                        continue; // Try next app
                    }
                };
                println!("App: {:?}", app.attributes().label);

                let windows = app.locator("window").unwrap().all().unwrap_or_default();
                println!("Found {} windows", windows.len());

                let mut text_inputs = Vec::new();

                match app.locator(Selector::Role {
                    role: "input".to_string(),
                    name: None,
                }) {
                    Ok(locator) => match locator.all() {
                        Ok(inputs) => {
                            println!("Found {} elements with role '{}'", inputs.len(), "input");
                            if !inputs.is_empty() {
                                text_inputs = inputs;
                                break;
                            }
                        }
                        Err(e) => {
                            println!("Failed to get elements with role '{}': {:?}", "input", e);
                        }
                    },
                    Err(e) => {
                        println!("Failed to create locator for role '{}': {:?}", "input", e);
                    }
                }

                // If we found no text inputs after trying all roles, try a different approach - look for any element
                // that might have an editable value or accept text input
                if text_inputs.is_empty() {
                    println!(
                        "No text fields found by role, trying to find any editable element..."
                    );

                    // Get all UI elements
                    match app.locator(Selector::Role {
                        role: "group".to_string(), // A generic container role that should find many elements
                        name: None,
                    }) {
                        Ok(locator) => match locator.all() {
                            Ok(elements) => {
                                println!("Found {} elements to examine", elements.len());

                                // Try to find ones that have editable text content
                                for element in elements {
                                    let attrs = element.attributes();

                                    // Print element properties for debugging
                                    println!(
                                        "Element role: {}, label: {:?}",
                                        attrs.role, attrs.label
                                    );

                                    // If the element has a "value" attribute, it might be editable
                                    if attrs.value.is_some() {
                                        println!("Found an element with a value attribute, might be editable");
                                        text_inputs.push(element);
                                    }
                                }
                            }
                            Err(e) => {
                                println!("Failed to get elements for analysis: {:?}", e);
                            }
                        },
                        Err(e) => {
                            println!("Failed to create locator for analysis: {:?}", e);
                        }
                    }
                }

                // If we found text inputs, process them
                if !text_inputs.is_empty() {
                    found_app_with_text_fields = true;

                    println!(
                        "Found {} potential text inputs in {}",
                        text_inputs.len(),
                        app_name
                    );

                    // For each text input, try to focus and simulate typing
                    for (i, input) in text_inputs.iter().enumerate() {
                        println!("Text input {}: {:?}", i, input.attributes());

                        // Try to focus the element first
                        match input.focus() {
                            Ok(_) => println!("Successfully focused text input {}", i),
                            Err(e) => {
                                println!("Failed to focus text input {}: {:?}", i, e);
                                continue;
                            }
                        }

                        // Get current text (if any)
                        match input.text() {
                            Ok(text) => {
                                if text.is_empty() {
                                    println!("Text input {} is empty", i);
                                } else {
                                    println!("Text input {} current text: {}", i, text);
                                }
                            }
                            Err(e) => println!("Failed to get text: {:?}", e),
                        }

                        // Try typing text
                        let sample_text = "Hello from Screenpipe!";
                        match input.type_text(sample_text) {
                            Ok(_) => println!("Successfully filled text input {}", i),
                            Err(e) => {
                                println!("Failed to fill text input {}: {:?}", i, e);

                                // If type_text fails, try set_value instead
                                println!("Trying set_value instead");
                                match input.set_value(sample_text) {
                                    Ok(_) => println!("Successfully set value for input {}", i),
                                    Err(e) => {
                                        println!("Failed to set value for input {}: {:?}", i, e)
                                    }
                                }
                            }
                        }

                        // Verify the text was entered
                        match input.text() {
                            Ok(text) => {
                                println!("After typing, text input {} has text: {}", i, text)
                            }
                            Err(e) => println!("Failed to verify text after typing: {:?}", e),
                        }

                        // We've successfully tested text input, so we can break out of the loop
                        break;
                    }

                    // We found text inputs in this app, so we can stop trying other apps
                    break;
                } else {
                    println!(
                        "No text inputs found in {}, trying next application",
                        app_name
                    );
                }
            }

            // If we didn't find any text inputs in any app, the test has demonstrated what it could
            if !found_app_with_text_fields {
                println!("No suitable text input fields found in any of the tried applications.");
                println!("To run this test successfully, please ensure TextEdit, Notes, or Safari is running with a document open.");
            }

            println!(
                "Test completed. Text input capabilities demonstrated to the extent possible."
            );
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
