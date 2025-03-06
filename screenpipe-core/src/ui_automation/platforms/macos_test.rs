#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    use super::super::super::{AutomationError, Desktop, Selector, UIElement};
    use crate::ui_automation::platforms::macos::MacOSEngine;
    use std::time::Duration;

    // This is an integration test that requires actual MacOS and accessibility permissions
    // It will be skipped when running tests in non-macOS environments
    #[test]
    fn test_macos_desktop_creation() {
        let result = Desktop::new();

        // This may fail if accessibility permissions are not granted
        // In that case, the test will print instructions on how to enable permissions
        if let Err(AutomationError::PermissionDenied(msg)) = &result {
            println!("Skipping macOS accessibility test: {}", msg);
            println!("To run this test, enable accessibility permissions for your test runner in System Preferences");
            return;
        }

        assert!(
            result.is_ok(),
            "Failed to create Desktop: {:?}",
            result.err()
        );
    }

    // Test to find the Finder application if running
    // This test will only run on macOS and requires accessibility permissions
    #[test]
    fn test_find_finder_app() {
        match Desktop::new() {
            Ok(desktop) => {
                match desktop.application("Finder") {
                    Ok(finder) => {
                        assert_eq!(finder.role(), "AXApplication");

                        // Test that we can get attributes from the finder app
                        let attrs = finder.attributes();
                        assert_eq!(attrs.role, "AXApplication");

                        // Try to find a window in the Finder
                        let windows = desktop
                            .locator(Selector::Role {
                                role: "AXWindow".to_string(),
                                name: None,
                            })
                            .within(finder)
                            .all();

                        println!("Found {} Finder windows", windows.unwrap_or_default().len());
                    }
                    Err(e) => {
                        // Finder might not be running
                        println!("Couldn't find Finder app: {:?}", e);
                    }
                }
            }
            Err(e) => {
                println!("Skipping macOS accessibility test: {:?}", e);
            }
        }
    }

    // Test finding UI elements by their role
    #[test]
    fn test_find_buttons() {
        if let Ok(desktop) = Desktop::new() {
            // Look for buttons in the UI
            let buttons = desktop.locator("AXButton").all();
            match buttons {
                Ok(btns) => {
                    println!("Found {} buttons on screen", btns.len());
                    for (i, btn) in btns.iter().take(5).enumerate() {
                        println!(
                            "Button {}: role={}, label={:?}",
                            i,
                            btn.role(),
                            btn.attributes().label
                        );
                    }
                }
                Err(e) => {
                    println!("Error finding buttons: {:?}", e);
                }
            }
        }
    }

    // Test basic UI navigation
    #[test]
    fn test_ui_navigation() {
        if let Ok(desktop) = Desktop::new() {
            let root = desktop.root();

            // Try to get children of the root element
            match root.children() {
                Ok(children) => {
                    println!("Root has {} children", children.len());
                    // Print info about the first few children
                    for (i, child) in children.iter().take(3).enumerate() {
                        println!("Child {}: role={}, id={:?}", i, child.role(), child.id());
                    }
                }
                Err(e) => {
                    println!("Error getting children: {:?}", e);
                }
            }
        }
    }

    // If accessibility is enabled, test focused element
    #[test]
    fn test_focused_element() {
        if let Ok(desktop) = Desktop::new() {
            match desktop.focused_element() {
                Ok(element) => {
                    println!(
                        "Focused element: role={}, label={:?}",
                        element.role(),
                        element.attributes().label
                    );
                }
                Err(e) => {
                    println!("No focused element found: {:?}", e);
                }
            }
        }
    }
}
