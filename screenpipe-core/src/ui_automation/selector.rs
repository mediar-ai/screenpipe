use std::collections::HashMap;

/// Represents ways to locate a UI element
pub enum Selector {
    /// Select by role and optional name
    Role { role: String, name: Option<String> },
    /// Select by accessibility ID
    Id(String),
    /// Select by name/label
    Name(String),
    /// Select by text content
    Text(String),
    /// Select using XPath-like query
    Path(String),
    /// Select by multiple attributes (key-value pairs)
    Attributes(HashMap<String, String>),
    /// Filter current elements by a predicate
    Filter(
        Box<Selector>,
        Box<dyn Fn(&UIElementAttributes) -> bool + Send + Sync>,
    ),
    /// Chain multiple selectors
    Chain(Vec<Selector>),
}

impl From<&str> for Selector {
    fn from(s: &str) -> Self {
        // Parse simple selector expressions like "button", "button:Submit"
        if s.contains(':') {
            let parts: Vec<&str> = s.splitn(2, ':').collect();
            Selector::Role {
                role: parts[0].to_string(),
                name: Some(parts[1].to_string()),
            }
        } else if s.starts_with('#') {
            Selector::Id(s[1..].to_string())
        } else if s.starts_with('/') {
            Selector::Path(s.to_string())
        } else {
            Selector::Name(s.to_string())
        }
    }
}

/// Engine for finding elements using selectors
pub(crate) trait SelectorEngine: Send + Sync {
    fn find_elements(
        &self,
        selector: &Selector,
        root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError>;
}
