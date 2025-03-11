use crate::operator::platforms::AccessibilityEngine;
use crate::operator::{AutomationError, Selector, UIElement};
use std::sync::Arc;
use std::time::Duration;

/// A high-level API for finding and interacting with UI elements
pub struct Locator {
    engine: Arc<dyn AccessibilityEngine>,
    selector: Selector,
    timeout: Duration,
    root: Option<UIElement>,
}

impl Locator {
    /// Create a new locator with the given selector
    pub(crate) fn new(engine: Arc<dyn AccessibilityEngine>, selector: Selector) -> Self {
        Self {
            engine,
            selector,
            timeout: Duration::from_secs(30),
            root: None,
        }
    }

    /// Set timeout for waiting operations
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Set the root element for this locator
    pub fn within(mut self, element: UIElement) -> Self {
        self.root = Some(element);
        self
    }

    /// Get the first element matching this locator
    pub fn first(&self) -> Result<Option<UIElement>, AutomationError> {
        let element = self
            .engine
            .find_element(&self.selector, self.root.as_ref())?;
        Ok(Some(element))
    }

    /// Get all elements matching this locator
    pub fn all(&self) -> Result<Vec<UIElement>, AutomationError> {
        // Check if we can use platform-specific find_elements method
        if let Ok(elements) = self
            .engine
            .find_elements(&self.selector, self.root.as_ref())
        {
            return Ok(elements);
        }

        // Fallback implementation - get the first element, then get its siblings
        // Note: This is a naive implementation and might not work correctly in all cases
        match self.first()? {
            Some(first) => {
                let result = vec![first];
                // In a proper implementation, we would need to search for siblings
                // or implement a custom ElementCollector that gathers all matches
                Ok(result)
            }
            None => Ok(vec![]),
        }
    }

    /// Wait for an element to be available
    pub async fn wait(&self) -> Result<UIElement, AutomationError> {
        let start = std::time::Instant::now();

        while start.elapsed() < self.timeout {
            if let Some(element) = self.first()? {
                return Ok(element);
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        Err(AutomationError::Timeout(format!(
            "Timed out waiting for selector: {:?}",
            self.selector
        )))
    }

    /// Get a nested locator
    pub fn locator(&self, selector: impl Into<Selector>) -> Locator {
        let selector = selector.into();
        Locator {
            engine: self.engine.clone(),
            selector: Selector::Chain(vec![self.selector.clone(), selector]),
            timeout: self.timeout,
            root: self.root.clone(),
        }
    }

    // Convenience methods for common actions

    /// Click on the first matching element
    pub async fn click(&self) -> Result<(), AutomationError> {
        self.wait().await?.click()
    }

    /// Type text into the first matching element
    pub async fn type_text(&self, text: &str) -> Result<(), AutomationError> {
        self.wait().await?.type_text(text)
    }

    /// Press a key on the first matching element
    pub async fn press_key(&self, key: &str) -> Result<(), AutomationError> {
        self.wait().await?.press_key(key)
    }

    /// Get text from the first matching element
    pub async fn text(&self, max_depth: usize) -> Result<String, AutomationError> {
        self.wait().await?.text(max_depth)
    }
}
