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
        fn test_find_buttons_in_cursor_simple() {
            setup_tracing();

            println!("Starting test to find buttons in current app window");

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

            // First, get the frontmost application
            let windows = match desktop.locator("window:test.rs").all() {
                Ok(w) => w,
                Err(e) => {
                    println!("Failed to find window: {:?}", e);
                    return;
                }
            };

            for window in &windows {
                println!("Window: {:?}", window.attributes().label);
            }

            let main_window = &windows.first().unwrap();
            println!("Using window: {:?}", main_window.attributes().label);

            // Search for buttons within this window
            let buttons = main_window.locator("button").unwrap();
            println!("Found {} buttons", buttons.all().unwrap().len());

            for (i, button) in buttons.all().unwrap().iter().enumerate() {
                let attrs = button.attributes();
                println!(
                    "Button #{}: role={}, label={:?}, description={:?}",
                    i + 1,
                    attrs.role,
                    attrs.label,
                    attrs.description
                );
            }
        }

        #[test]
        fn test_find_buttons_in_current_window() {
            setup_tracing();

            println!("Starting test to find buttons in current app window");

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

            // First, get the frontmost application
            let apps = match desktop.applications() {
                Ok(apps) => {
                    if apps.is_empty() {
                        println!("No applications found");
                        return;
                    }
                    apps
                }
                Err(e) => {
                    println!("Failed to get applications: {:?}", e);
                    return;
                }
            };

            for app in &apps {
                println!("Application: {:?}", app.attributes().label);
            }

            let frontmost_app = apps
                .into_iter()
                .find(|app| app.attributes().label == Some("Cursor".to_string()));

            if let Some(app) = &frontmost_app {
                println!("Frontmost application: {:?}", app.attributes().label);
            }

            println!(
                "Frontmost app: {:?}",
                frontmost_app.clone().unwrap().attributes()
            );

            // Try to find the main window
            let windows = match frontmost_app.unwrap().locator("window") {
                Ok(w) => {
                    println!("Found {} windows", w.all().unwrap().len());

                    w
                }
                Err(e) => {
                    println!("Failed to find windows: {:?}", e);
                    return;
                }
            };

            // Use the first window as our search root
            let main_window = &windows.first().unwrap().unwrap();
            println!("Using window: {:?}", main_window.attributes().label);

            // Search for buttons within this window
            let buttons = main_window.locator("AXButton:Submit").unwrap();

            println!(
                "Found {} buttons in current window",
                buttons.all().unwrap().len()
            );

            // Print details of each button found
            for (i, button) in buttons.all().unwrap().iter().enumerate() {
                let attrs = button.attributes();
                println!(
                    "Button #{}: role={}, label={:?}, description={:?}",
                    i + 1,
                    attrs.role,
                    attrs.label,
                    attrs.description
                );
            }
        }
    }
}
