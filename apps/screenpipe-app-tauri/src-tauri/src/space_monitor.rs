//! macOS Space change monitor
//!
//! Listens for NSWorkspaceActiveSpaceDidChangeNotification to detect when
//! the user switches Spaces (virtual desktops) and hides the overlay.

use crate::commands::hide_main_window;
use tauri::AppHandle;
use tracing::{debug, error};

/// Sets up a listener for macOS Space changes.
/// When the active Space changes, hides the main overlay window.
pub fn setup_space_listener(app: AppHandle) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::Once;

    static INIT: Once = Once::new();

    INIT.call_once(|| {
        debug!("Setting up macOS Space change listener");

        // Clone app handle for use in the block
        let app_for_block = app.clone();

        // Wrap in catch_unwind to prevent panics from crashing the app
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            unsafe {
                let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
                let notification_center: id = msg_send![workspace, notificationCenter];

                // NSWorkspaceActiveSpaceDidChangeNotification
                let notification_name =
                    NSString::alloc(nil).init_str("NSWorkspaceActiveSpaceDidChangeNotification");

                // Create the block that will be called when space changes
                let block = block::ConcreteBlock::new(move |_notification: id| {
                    debug!("macOS Space changed, hiding overlay");
                    hide_main_window(&app_for_block);
                });
                let block = block.copy();

                // Add observer for the notification
                let _: id = msg_send![
                    notification_center,
                    addObserverForName: notification_name
                    object: workspace
                    queue: nil
                    usingBlock: &*block
                ];

                debug!("macOS Space change listener registered successfully");
            }
        }));

        if let Err(e) = result {
            error!("Failed to setup space listener: {:?}", e);
        }
    });
}
