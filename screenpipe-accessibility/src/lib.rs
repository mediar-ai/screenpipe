//! screenpipe-accessibility: Cross-platform UI event capture for screenpipe
//!
//! This crate provides keyboard, mouse, and accessibility-based UI event capture
//! as a third modality for screenpipe, complementing vision (OCR) and audio.
//!
//! ## Features
//!
//! - **Mouse events**: Clicks, scrolls, movements (throttled)
//! - **Keyboard events**: Aggregated text input, hotkeys
//! - **App/Window tracking**: Application switches, window focus changes
//! - **Clipboard**: Copy/cut/paste operations
//! - **Element context**: Accessibility information for clicked elements
//!
//! ## Platform Support
//!
//! - **macOS**: Full support via CGEventTap and Accessibility APIs
//! - **Windows**: Full support via rdev and UI Automation
//! - **Linux**: Stub (planned via AT-SPI2 and XRecord)
//!
//! ## Privacy
//!
//! The crate includes built-in privacy controls:
//! - Password field detection and exclusion
//! - App/window exclusion patterns
//! - PII removal integration
//! - Configurable capture options
//!
//! ## Example
//!
//! ```rust,no_run
//! use screenpipe_accessibility::{UiRecorder, UiCaptureConfig};
//!
//! let config = UiCaptureConfig::new();
//! let recorder = UiRecorder::new(config);
//!
//! // Check permissions
//! let perms = recorder.check_permissions();
//! if !perms.all_granted() {
//!     recorder.request_permissions();
//! }
//!
//! // Start capturing
//! let handle = recorder.start().unwrap();
//!
//! // Process events
//! while let Some(event) = handle.recv_timeout(std::time::Duration::from_secs(1)) {
//!     println!("{:?}", event);
//! }
//!
//! handle.stop();
//! ```

pub mod config;
pub mod events;
pub mod platform;

// Re-exports
pub use config::UiCaptureConfig;
pub use events::{ElementBounds, ElementContext, EventData, EventType, Modifiers, UiEvent};
pub use platform::{PermissionStatus, RecordingHandle, UiRecorder};

/// Prelude for convenient imports
pub mod prelude {
    pub use crate::config::UiCaptureConfig;
    pub use crate::events::{ElementContext, EventData, EventType, UiEvent};
    pub use crate::platform::{PermissionStatus, RecordingHandle, UiRecorder};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = UiCaptureConfig::new();
        assert!(config.enabled);
        assert!(config.capture_clicks);
        assert!(!config.capture_keystrokes); // Off by default for privacy
    }

    #[test]
    fn test_event_creation() {
        use chrono::Utc;

        let event = UiEvent::click(Utc::now(), 100, 500, 300, 0, 1, 0);
        assert_eq!(event.event_type(), "click");

        let event = UiEvent::text(Utc::now(), 200, "hello".to_string());
        assert_eq!(event.event_type(), "text");
        assert_eq!(event.text_content(), Some("hello"));
    }
}
