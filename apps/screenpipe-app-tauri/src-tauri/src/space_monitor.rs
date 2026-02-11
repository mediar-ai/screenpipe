//! macOS Space change monitor
//!
//! Listens for NSWorkspaceActiveSpaceDidChangeNotification to detect when
//! the user switches Spaces (virtual desktops) and hides the overlay.
//!
//! The suppress mechanism prevents a race condition: when we call
//! `activateIgnoringOtherApps` to show a panel on a fullscreen Space,
//! macOS fires a Space change notification. Without suppression, the
//! space monitor would immediately hide the window we just showed.

use crate::commands::hide_main_window;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::AppHandle;
use tracing::{debug, error};

/// Timestamp (ms since UNIX epoch) until which Space change notifications
/// should be ignored. Set by `suppress_space_monitor()` before activating.
static SUPPRESS_UNTIL: AtomicU64 = AtomicU64::new(0);

/// Call before `activateIgnoringOtherApps` to prevent the space monitor
/// from hiding the overlay during the activation-triggered Space change.
/// Suppresses for `duration_ms` milliseconds (default 500ms is plenty).
#[allow(dead_code)]
pub fn suppress_space_monitor(duration_ms: u64) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    SUPPRESS_UNTIL.store(now + duration_ms, Ordering::Relaxed);
    debug!("space monitor suppressed for {}ms", duration_ms);
}

fn is_suppressed() -> bool {
    let until = SUPPRESS_UNTIL.load(Ordering::Relaxed);
    if until == 0 {
        return false;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    now < until
}

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
                    // Ignore Space changes triggered by our own activateIgnoringOtherApps
                    if is_suppressed() {
                        debug!("macOS Space changed, but suppressed (self-activation)");
                        return;
                    }
                    debug!("macOS Space changed, hiding overlay");
                    // Do NOT restore_frontmost_app here — the user intentionally
                    // switched Spaces, so re-activating the previous app would
                    // pull them back. Just clear the saved app and hide.
                    crate::window_api::clear_frontmost_app();
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
