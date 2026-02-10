//! UI Event types optimized for storage and AI consumption
//!
//! Events are stored as simple structs that serialize to compact JSON.
//! Based on bigbrother's event format with extensions for screenpipe integration.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A UI event with full context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiEvent {
    /// Unique event ID (assigned by database)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,

    /// UTC timestamp
    pub timestamp: DateTime<Utc>,

    /// Milliseconds since recording session start
    pub relative_ms: u64,

    /// Event type and data
    #[serde(flatten)]
    pub data: EventData,

    /// Application context
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_name: Option<String>,

    /// Window title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,

    /// Browser URL (for browser windows)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browser_url: Option<String>,

    /// Element context at event position
    #[serde(skip_serializing_if = "Option::is_none")]
    pub element: Option<ElementContext>,

    /// Associated screenshot frame ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_id: Option<i64>,
}

/// Event data - tagged union for different event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type")]
pub enum EventData {
    /// Mouse click
    #[serde(rename = "click")]
    Click {
        x: i32,
        y: i32,
        /// Button: 0=left, 1=right, 2=middle
        button: u8,
        /// Click count: 1=single, 2=double, 3=triple
        click_count: u8,
        /// Modifier keys packed: 1=shift, 2=ctrl, 4=opt, 8=cmd
        modifiers: u8,
    },

    /// Mouse move (throttled)
    #[serde(rename = "move")]
    Move { x: i32, y: i32 },

    /// Mouse scroll
    #[serde(rename = "scroll")]
    Scroll {
        x: i32,
        y: i32,
        delta_x: i16,
        delta_y: i16,
    },

    /// Key press (for shortcuts/special keys)
    #[serde(rename = "key")]
    Key {
        /// Platform-specific keycode
        key_code: u16,
        /// Modifier keys packed
        modifiers: u8,
    },

    /// Aggregated text input
    #[serde(rename = "text")]
    Text {
        /// The typed text
        content: String,
        /// Number of characters
        #[serde(skip_serializing_if = "Option::is_none")]
        char_count: Option<usize>,
    },

    /// Application activated
    #[serde(rename = "app_switch")]
    AppSwitch {
        /// Application name
        name: String,
        /// Process ID
        pid: i32,
    },

    /// Window focused
    #[serde(rename = "window_focus")]
    WindowFocus {
        /// Application name
        app: String,
        /// Window title
        #[serde(skip_serializing_if = "Option::is_none")]
        title: Option<String>,
    },

    /// Clipboard operation
    #[serde(rename = "clipboard")]
    Clipboard {
        /// Operation: 'c'=copy, 'x'=cut, 'v'=paste
        operation: char,
        /// Content preview (truncated)
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
    },
}

/// Element context from accessibility API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementContext {
    /// Accessibility role (e.g., "AXButton", "AXTextField")
    pub role: String,

    /// Element name/label
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Element value (for inputs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,

    /// Element description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Automation ID (Windows)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub automation_id: Option<String>,

    /// Bounding rectangle
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<ElementBounds>,
}

/// Element bounding rectangle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Modifier key flags
#[derive(Debug, Clone, Copy, Default)]
pub struct Modifiers(pub u8);

impl Modifiers {
    pub const SHIFT: u8 = 1 << 0;
    pub const CTRL: u8 = 1 << 1;
    pub const OPT: u8 = 1 << 2; // Alt on Windows/Linux
    pub const CMD: u8 = 1 << 3; // Win on Windows, Super on Linux
    pub const CAPS: u8 = 1 << 4;
    pub const FN: u8 = 1 << 5;

    pub fn new() -> Self {
        Self(0)
    }

    pub fn has_shift(&self) -> bool {
        self.0 & Self::SHIFT != 0
    }
    pub fn has_ctrl(&self) -> bool {
        self.0 & Self::CTRL != 0
    }
    pub fn has_opt(&self) -> bool {
        self.0 & Self::OPT != 0
    }
    pub fn has_cmd(&self) -> bool {
        self.0 & Self::CMD != 0
    }
    pub fn any_modifier(&self) -> bool {
        self.0 & (Self::CMD | Self::CTRL) != 0
    }

    #[cfg(target_os = "macos")]
    pub fn from_cg_flags(flags: u64) -> Self {
        let mut m = 0u8;
        if flags & 0x20000 != 0 {
            m |= Self::SHIFT;
        }
        if flags & 0x40000 != 0 {
            m |= Self::CTRL;
        }
        if flags & 0x80000 != 0 {
            m |= Self::OPT;
        }
        if flags & 0x100000 != 0 {
            m |= Self::CMD;
        }
        if flags & 0x10000 != 0 {
            m |= Self::CAPS;
        }
        if flags & 0x800000 != 0 {
            m |= Self::FN;
        }
        Self(m)
    }
}

impl UiEvent {
    /// Create a new click event
    pub fn click(
        timestamp: DateTime<Utc>,
        relative_ms: u64,
        x: i32,
        y: i32,
        button: u8,
        click_count: u8,
        modifiers: u8,
    ) -> Self {
        Self {
            id: None,
            timestamp,
            relative_ms,
            data: EventData::Click {
                x,
                y,
                button,
                click_count,
                modifiers,
            },
            app_name: None,
            window_title: None,
            browser_url: None,
            element: None,
            frame_id: None,
        }
    }

    /// Create a new text event
    pub fn text(timestamp: DateTime<Utc>, relative_ms: u64, content: String) -> Self {
        let char_count = Some(content.chars().count());
        Self {
            id: None,
            timestamp,
            relative_ms,
            data: EventData::Text {
                content,
                char_count,
            },
            app_name: None,
            window_title: None,
            browser_url: None,
            element: None,
            frame_id: None,
        }
    }

    /// Create an app switch event
    pub fn app_switch(timestamp: DateTime<Utc>, relative_ms: u64, name: String, pid: i32) -> Self {
        Self {
            id: None,
            timestamp,
            relative_ms,
            data: EventData::AppSwitch { name, pid },
            app_name: None,
            window_title: None,
            browser_url: None,
            element: None,
            frame_id: None,
        }
    }

    /// Get the event type as a string
    pub fn event_type(&self) -> &'static str {
        match &self.data {
            EventData::Click { .. } => "click",
            EventData::Move { .. } => "move",
            EventData::Scroll { .. } => "scroll",
            EventData::Key { .. } => "key",
            EventData::Text { .. } => "text",
            EventData::AppSwitch { .. } => "app_switch",
            EventData::WindowFocus { .. } => "window_focus",
            EventData::Clipboard { .. } => "clipboard",
        }
    }

    /// Get text content if this is a text event
    pub fn text_content(&self) -> Option<&str> {
        match &self.data {
            EventData::Text { content, .. } => Some(content),
            EventData::Clipboard {
                content: Some(c), ..
            } => Some(c),
            _ => None,
        }
    }

    /// Set element context
    pub fn with_element(mut self, element: ElementContext) -> Self {
        self.element = Some(element);
        self
    }

    /// Set app context
    pub fn with_app(mut self, app_name: String, window_title: Option<String>) -> Self {
        self.app_name = Some(app_name);
        self.window_title = window_title;
        self
    }

    /// Set frame ID
    pub fn with_frame(mut self, frame_id: i64) -> Self {
        self.frame_id = Some(frame_id);
        self
    }
}

/// Event type for database filtering
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    Click,
    Move,
    Scroll,
    Key,
    Text,
    AppSwitch,
    WindowFocus,
    Clipboard,
}

impl EventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventType::Click => "click",
            EventType::Move => "move",
            EventType::Scroll => "scroll",
            EventType::Key => "key",
            EventType::Text => "text",
            EventType::AppSwitch => "app_switch",
            EventType::WindowFocus => "window_focus",
            EventType::Clipboard => "clipboard",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "click" | "c" => Some(EventType::Click),
            "move" | "m" => Some(EventType::Move),
            "scroll" | "s" => Some(EventType::Scroll),
            "key" | "k" => Some(EventType::Key),
            "text" | "t" => Some(EventType::Text),
            "app_switch" | "app" | "a" => Some(EventType::AppSwitch),
            "window_focus" | "window" | "w" => Some(EventType::WindowFocus),
            "clipboard" | "paste" | "p" => Some(EventType::Clipboard),
            _ => None,
        }
    }
}

// ============================================================================
// Database Conversion (optional feature)
// ============================================================================

#[cfg(feature = "db")]
impl UiEvent {
    /// Convert to database insert format
    pub fn to_db_insert(&self, session_id: Option<String>) -> screenpipe_db::InsertUiEvent {
        use screenpipe_db::{InsertUiEvent, UiEventType};

        let (
            event_type,
            x,
            y,
            delta_x,
            delta_y,
            button,
            click_count,
            key_code,
            modifiers,
            text_content,
            app_pid,
        ) = match &self.data {
            EventData::Click {
                x,
                y,
                button,
                click_count,
                modifiers,
            } => (
                UiEventType::Click,
                Some(*x),
                Some(*y),
                None,
                None,
                Some(*button),
                Some(*click_count),
                None,
                Some(*modifiers),
                None,
                None,
            ),
            EventData::Move { x, y } => (
                UiEventType::Move,
                Some(*x),
                Some(*y),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ),
            EventData::Scroll {
                x,
                y,
                delta_x,
                delta_y,
            } => (
                UiEventType::Scroll,
                Some(*x),
                Some(*y),
                Some(*delta_x),
                Some(*delta_y),
                None,
                None,
                None,
                None,
                None,
                None,
            ),
            EventData::Key {
                key_code,
                modifiers,
            } => (
                UiEventType::Key,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(*key_code),
                Some(*modifiers),
                None,
                None,
            ),
            EventData::Text { content, .. } => (
                UiEventType::Text,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(content.clone()),
                None,
            ),
            EventData::AppSwitch { name, pid } => (
                UiEventType::AppSwitch,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(name.clone()), // Store app name in text_content
                Some(*pid),
            ),
            EventData::WindowFocus { app, title } => (
                UiEventType::WindowFocus,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                title.clone().or_else(|| Some(app.clone())), // Use title, fallback to app name
                None,
            ),
            EventData::Clipboard { operation, content } => (
                UiEventType::Clipboard,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(*operation as u8),
                content.clone(),
                None,
            ),
        };

        let (
            element_role,
            element_name,
            element_value,
            element_description,
            element_automation_id,
            element_bounds,
        ) = if let Some(ref elem) = self.element {
            (
                Some(elem.role.clone()),
                elem.name.clone(),
                elem.value.clone(),
                elem.description.clone(),
                elem.automation_id.clone(),
                elem.bounds.as_ref().map(|b| {
                    serde_json::json!({
                        "x": b.x,
                        "y": b.y,
                        "width": b.width,
                        "height": b.height
                    })
                    .to_string()
                }),
            )
        } else {
            (None, None, None, None, None, None)
        };

        // Extract app_name and window_title from EventData for certain event types
        let (final_app_name, final_window_title) = match &self.data {
            EventData::AppSwitch { name, .. } => (Some(name.clone()), self.window_title.clone()),
            EventData::WindowFocus { app, title } => (Some(app.clone()), title.clone()),
            _ => (self.app_name.clone(), self.window_title.clone()),
        };

        InsertUiEvent {
            timestamp: self.timestamp,
            session_id,
            relative_ms: self.relative_ms as i64,
            event_type,
            x,
            y,
            delta_x,
            delta_y,
            button,
            click_count,
            key_code,
            modifiers,
            text_content,
            app_name: final_app_name,
            app_pid,
            window_title: final_window_title,
            browser_url: self.browser_url.clone(),
            element_role,
            element_name,
            element_value,
            element_description,
            element_automation_id,
            element_bounds,
            frame_id: self.frame_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_serialization() {
        let event = UiEvent::click(Utc::now(), 100, 500, 300, 0, 1, 0);

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"event_type\":\"click\""));
        assert!(json.contains("\"x\":500"));
    }

    #[test]
    fn test_modifiers() {
        let mods = Modifiers(Modifiers::SHIFT | Modifiers::CMD);
        assert!(mods.has_shift());
        assert!(mods.has_cmd());
        assert!(!mods.has_ctrl());
        assert!(mods.any_modifier());
    }

    #[test]
    fn test_event_type_parsing() {
        assert_eq!(EventType::from_str("click"), Some(EventType::Click));
        assert_eq!(EventType::from_str("c"), Some(EventType::Click));
        assert_eq!(EventType::from_str("text"), Some(EventType::Text));
        assert_eq!(EventType::from_str("invalid"), None);
    }
}
