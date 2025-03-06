use once_cell::sync::Lazy;
use std::collections::BTreeMap;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Mutex,
};

use super::{AutomationError, UIElement, UIElementAttributes};

/// A filter predicate for UI elements
pub struct FilterPredicate {
    parent: Box<Selector>,
    predicate: Box<dyn Fn(&UIElementAttributes) -> bool + Send + Sync>,
}

// Global registry of filter predicates
static FILTER_REGISTRY: Lazy<Mutex<BTreeMap<usize, FilterPredicate>>> =
    Lazy::new(|| Mutex::new(BTreeMap::new()));
static NEXT_FILTER_ID: AtomicUsize = AtomicUsize::new(1);

impl FilterPredicate {
    pub fn new(
        parent: Selector,
        predicate: Box<dyn Fn(&UIElementAttributes) -> bool + Send + Sync>,
    ) -> Self {
        Self {
            parent: Box::new(parent),
            predicate,
        }
    }

    pub fn parent(&self) -> &Selector {
        &self.parent
    }

    pub fn matches(&self, attrs: &UIElementAttributes) -> bool {
        (self.predicate)(attrs)
    }

    // Register a new filter predicate and return its ID
    pub fn register(
        parent: Selector,
        predicate: Box<dyn Fn(&UIElementAttributes) -> bool + Send + Sync>,
    ) -> usize {
        let id = NEXT_FILTER_ID.fetch_add(1, Ordering::SeqCst);
        let filter = FilterPredicate::new(parent, predicate);
        FILTER_REGISTRY.lock().unwrap().insert(id, filter);
        id
    }

    // Get a filter predicate by ID
    pub fn get(id: usize) -> Option<FilterPredicate> {
        // Instead of trying to clone the predicate, we'll just return a reference to it
        FILTER_REGISTRY.lock().unwrap().get(&id).map(|f| {
            // Create a new one with same parent, but with an identity function
            // that delegates to the original in the registry
            let id_copy = id;
            FilterPredicate {
                parent: f.parent.clone(),
                predicate: Box::new(move |attrs| {
                    // Look up the predicate each time
                    if let Some(registry_lock) = FILTER_REGISTRY.lock().ok() {
                        if let Some(original) = registry_lock.get(&id_copy) {
                            return (original.predicate)(attrs);
                        }
                    }
                    false
                }),
            }
        })
    }
}

/// Represents ways to locate a UI element
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
    Attributes(BTreeMap<String, String>),
    /// Filter current elements by a predicate
    Filter(usize), // Uses an ID to reference a filter predicate stored separately
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
