use super::element::UIElementImpl;
use super::*;
use crate::ui_automation::platforms::AccessibilityEngine;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

// Mock implementation of the AccessibilityEngine trait for testing
struct MockEngine {
    // Simulate some internal state
    root_element: UIElement,
    focused_element: Option<UIElement>,
    elements_by_id: BTreeMap<String, UIElement>,
    applications: Vec<UIElement>,
    found_elements: Vec<UIElement>,
}

// Implementation of the MockUIElementImpl to create test elements
#[derive(Debug, Clone)]
struct MockUIElementImpl {
    id: Option<String>,
    role: String,
    label: Option<String>,
    value: Option<String>,
    description: Option<String>,
    properties: HashMap<String, String>,
    children: Vec<UIElement>,
    parent: Option<Box<UIElement>>,
    object_id: usize,
}

static NEXT_OBJECT_ID: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);

impl MockUIElementImpl {
    fn new(role: &str) -> Self {
        Self {
            id: None,
            role: role.to_string(),
            label: None,
            value: None,
            description: None,
            properties: HashMap::new(),
            children: Vec::new(),
            parent: None,
            object_id: NEXT_OBJECT_ID.fetch_add(1, std::sync::atomic::Ordering::SeqCst),
        }
    }

    fn with_id(mut self, id: &str) -> Self {
        self.id = Some(id.to_string());
        self
    }

    fn with_label(mut self, label: &str) -> Self {
        self.label = Some(label.to_string());
        self
    }

    fn with_value(mut self, value: &str) -> Self {
        self.value = Some(value.to_string());
        self
    }

    fn with_description(mut self, description: &str) -> Self {
        self.description = Some(description.to_string());
        self
    }

    fn with_property(mut self, key: &str, value: &str) -> Self {
        self.properties.insert(key.to_string(), value.to_string());
        self
    }

    fn with_children(mut self, children: Vec<UIElement>) -> Self {
        // Set this element as the parent of all children
        for child in &children {
            if let Some(mock_impl) = child.as_any().downcast_ref::<MockUIElementImpl>() {
                // We can't modify the child directly here due to borrowing rules,
                // so this would need to be handled differently in a real implementation
            }
        }
        self.children = children;
        self
    }
}

impl UIElementImpl for MockUIElementImpl {
    fn object_id(&self) -> usize {
        self.object_id
    }

    fn id(&self) -> Option<String> {
        self.id.clone()
    }

    fn role(&self) -> String {
        self.role.clone()
    }

    fn attributes(&self) -> UIElementAttributes {
        UIElementAttributes {
            role: self.role.clone(),
            label: self.label.clone(),
            value: self.value.clone(),
            description: self.description.clone(),
            properties: self.properties.clone(),
        }
    }

    fn children(&self) -> Result<Vec<UIElement>, AutomationError> {
        Ok(self.children.clone())
    }

    fn parent(&self) -> Result<Option<UIElement>, AutomationError> {
        Ok(self.parent.as_ref().map(|p| (**p).clone()))
    }

    fn bounds(&self) -> Result<(f64, f64, f64, f64), AutomationError> {
        // Mock implementation returns a default rectangle
        Ok((0.0, 0.0, 100.0, 100.0))
    }

    fn click(&self) -> Result<(), AutomationError> {
        // Mock implementation does nothing
        Ok(())
    }

    fn double_click(&self) -> Result<(), AutomationError> {
        Ok(())
    }

    fn right_click(&self) -> Result<(), AutomationError> {
        Ok(())
    }

    fn hover(&self) -> Result<(), AutomationError> {
        Ok(())
    }

    fn focus(&self) -> Result<(), AutomationError> {
        Ok(())
    }

    fn type_text(&self, _text: &str) -> Result<(), AutomationError> {
        Ok(())
    }

    fn press_key(&self, _key: &str) -> Result<(), AutomationError> {
        Ok(())
    }

    fn get_text(&self) -> Result<String, AutomationError> {
        Ok(self.value.clone().unwrap_or_default())
    }

    fn set_value(&self, _value: &str) -> Result<(), AutomationError> {
        Ok(())
    }

    fn is_enabled(&self) -> Result<bool, AutomationError> {
        Ok(true)
    }

    fn is_visible(&self) -> Result<bool, AutomationError> {
        Ok(true)
    }

    fn is_focused(&self) -> Result<bool, AutomationError> {
        Ok(false)
    }

    fn perform_action(&self, _action: &str) -> Result<(), AutomationError> {
        Ok(())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn clone_box(&self) -> Box<dyn UIElementImpl> {
        Box::new(self.clone())
    }
}

impl MockEngine {
    fn new() -> Self {
        // Create a mock desktop hierarchy
        let root = UIElement::new(Box::new(
            MockUIElementImpl::new("AXDesktop").with_id("desktop"),
        ));

        // Create sample applications
        let safari_app = UIElement::new(Box::new(
            MockUIElementImpl::new("AXApplication")
                .with_id("safari")
                .with_label("Safari"),
        ));

        let finder_app = UIElement::new(Box::new(
            MockUIElementImpl::new("AXApplication")
                .with_id("finder")
                .with_label("Finder"),
        ));

        // Create sample UI elements
        let button = UIElement::new(Box::new(
            MockUIElementImpl::new("AXButton")
                .with_id("submit-button")
                .with_label("Submit"),
        ));

        let text_field = UIElement::new(Box::new(
            MockUIElementImpl::new("AXTextField")
                .with_id("search-field")
                .with_label("Search")
                .with_value(""),
        ));

        // Build the element storage
        let mut elements_by_id = BTreeMap::new();
        elements_by_id.insert("desktop".to_string(), root.clone());
        elements_by_id.insert("safari".to_string(), safari_app.clone());
        elements_by_id.insert("finder".to_string(), finder_app.clone());
        elements_by_id.insert("submit-button".to_string(), button.clone());
        elements_by_id.insert("search-field".to_string(), text_field.clone());

        let applications = vec![safari_app, finder_app];
        let found_elements = vec![button, text_field];

        Self {
            root_element: root,
            focused_element: None,
            elements_by_id,
            applications,
            found_elements,
        }
    }

    // Helper to set the focused element for testing
    fn set_focused_element(&mut self, id: &str) {
        self.focused_element = self.elements_by_id.get(id).cloned();
    }
}

impl AccessibilityEngine for MockEngine {
    fn get_root_element(&self) -> UIElement {
        self.root_element.clone()
    }

    fn get_element_by_id(&self, id: &str) -> Result<UIElement, AutomationError> {
        self.elements_by_id.get(id).cloned().ok_or_else(|| {
            AutomationError::ElementNotFound(format!("Element with ID '{}' not found", id))
        })
    }

    fn get_focused_element(&self) -> Result<UIElement, AutomationError> {
        self.focused_element
            .clone()
            .ok_or_else(|| AutomationError::ElementNotFound("No element is focused".to_string()))
    }

    fn get_applications(&self) -> Result<Vec<UIElement>, AutomationError> {
        Ok(self.applications.clone())
    }

    fn get_application_by_name(&self, name: &str) -> Result<UIElement, AutomationError> {
        self.applications
            .iter()
            .find(|app| {
                if let Some(label) = app.attributes().label {
                    label == name
                } else {
                    false
                }
            })
            .cloned()
            .ok_or_else(|| {
                AutomationError::ElementNotFound(format!("Application '{}' not found", name))
            })
    }

    fn find_elements(
        &self,
        selector: &Selector,
        _root: Option<&UIElement>,
    ) -> Result<Vec<UIElement>, AutomationError> {
        // Simple mock implementation that returns predefined elements based on selector
        match selector {
            Selector::Id(id) => {
                if let Some(element) = self.elements_by_id.get(id) {
                    Ok(vec![element.clone()])
                } else {
                    Ok(vec![])
                }
            }
            Selector::Role { role, name } => {
                let matching = self
                    .found_elements
                    .iter()
                    .filter(|el| {
                        let attrs = el.attributes();
                        attrs.role == *role
                            && name
                                .as_ref()
                                .map_or(true, |n| attrs.label.as_ref().map_or(false, |l| l == n))
                    })
                    .cloned()
                    .collect();
                Ok(matching)
            }
            Selector::Name(name) => {
                let matching = self
                    .found_elements
                    .iter()
                    .filter(|el| el.attributes().label.as_ref().map_or(false, |l| l == name))
                    .cloned()
                    .collect();
                Ok(matching)
            }
            // For simplicity, other selectors just return all elements
            _ => Ok(self.found_elements.clone()),
        }
    }
}

// Helper function to create a Desktop with a mock engine for testing
fn create_mock_desktop() -> Desktop {
    let engine = Arc::new(MockEngine::new());
    Desktop { engine }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_desktop_new() {
        // This test would normally test the actual Desktop::new() function,
        // but since it depends on platform-specific accessibility APIs,
        // we'll use our mock implementation instead
        let desktop = create_mock_desktop();

        // Basic verification that the desktop was created
        assert!(desktop.engine.get_root_element().id().unwrap() == "desktop");
    }

    #[test]
    fn test_desktop_root() {
        let desktop = create_mock_desktop();
        let root = desktop.root();

        assert_eq!(root.id().unwrap(), "desktop");
        assert_eq!(root.role(), "AXDesktop");
    }

    #[test]
    fn test_desktop_element_by_id() {
        let desktop = create_mock_desktop();

        // Test finding existing element
        let button = desktop.element_by_id("submit-button").unwrap();
        assert_eq!(button.id().unwrap(), "submit-button");
        assert_eq!(button.role(), "AXButton");

        // Test trying to find non-existent element
        let result = desktop.element_by_id("non-existent");
        assert!(result.is_err());
        if let Err(AutomationError::ElementNotFound(msg)) = result {
            assert!(msg.contains("non-existent"));
        } else {
            panic!("Expected ElementNotFound error");
        }
    }

    #[test]
    fn test_desktop_focused_element() {
        // This requires modifying the mock engine to set a focused element
        let mut engine = MockEngine::new();
        engine.set_focused_element("search-field");
        let desktop = Desktop {
            engine: Arc::new(engine),
        };

        let focused = desktop.focused_element().unwrap();
        assert_eq!(focused.id().unwrap(), "search-field");
        assert_eq!(focused.role(), "AXTextField");
    }

    #[test]
    fn test_desktop_applications() {
        let desktop = create_mock_desktop();
        let apps = desktop.applications().unwrap();

        assert_eq!(apps.len(), 2);
        assert!(apps.iter().any(|app| app.id().unwrap() == "safari"));
        assert!(apps.iter().any(|app| app.id().unwrap() == "finder"));
    }

    #[test]
    fn test_desktop_application() {
        let desktop = create_mock_desktop();

        // Test finding existing application
        let finder = desktop.application("Finder").unwrap();
        assert_eq!(finder.id().unwrap(), "finder");

        // Test trying to find non-existent application
        let result = desktop.application("Chrome");
        assert!(result.is_err());
    }

    #[test]
    fn test_desktop_locator() {
        let desktop = create_mock_desktop();

        // Create a locator for a button
        let locator = desktop.locator("AXButton:Submit");

        // Test finding elements with the locator
        let elements = locator.all().unwrap();
        assert_eq!(elements.len(), 1);
        assert_eq!(elements[0].id().unwrap(), "submit-button");

        // Test first() method
        let element = locator.first().unwrap().unwrap();
        assert_eq!(element.id().unwrap(), "submit-button");
    }
}

// Add tests for UI actions
#[cfg(test)]
mod ui_action_tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_element_click() {
        let desktop = create_mock_desktop();
        let button = desktop.element_by_id("submit-button").unwrap();

        // Test that click doesn't fail
        assert!(button.click().is_ok());
    }

    #[test]
    fn test_element_focus_and_type() {
        let desktop = create_mock_desktop();
        let text_field = desktop.element_by_id("search-field").unwrap();

        // Test focus
        assert!(text_field.focus().is_ok());

        // Test typing
        assert!(text_field.type_text("Hello, world!").is_ok());
    }

    #[test]
    fn test_element_properties() {
        let desktop = create_mock_desktop();
        let text_field = desktop.element_by_id("search-field").unwrap();

        // Test property access
        assert_eq!(text_field.role(), "AXTextField");
        assert_eq!(text_field.attributes().label.unwrap(), "Search");

        // Test is_enabled
        assert!(text_field.is_enabled().unwrap());

        // Test is_visible
        assert!(text_field.is_visible().unwrap());
    }

    // Test the locator wait functionality
    // This requires mocking the async functionality
    #[tokio::test]
    async fn test_locator_wait() {
        let desktop = create_mock_desktop();
        let locator = desktop
            .locator("AXButton:Submit")
            .timeout(Duration::from_millis(100));

        // Test waiting for an element
        let element = locator.wait().await;
        assert!(element.is_ok());
        assert_eq!(element.unwrap().id().unwrap(), "submit-button");
    }

    // Test locator-based actions
    #[tokio::test]
    async fn test_locator_actions() {
        let desktop = create_mock_desktop();
        let button_locator = desktop.locator("AXButton:Submit");

        // Test click via locator
        assert!(button_locator.click().await.is_ok());

        let text_field_locator = desktop.locator("AXTextField:Search");

        // Test typing via locator
        assert!(text_field_locator
            .type_text("Hello from locator")
            .await
            .is_ok());

        // Test getting text via locator
        let text = text_field_locator.text().await;
        assert!(text.is_ok());
    }
}

// Add tests for chained selectors and complex queries
#[cfg(test)]
mod selector_tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn test_selector_from_string() {
        // Test basic string conversion to selectors
        let role_selector: Selector = "button".into();
        assert!(matches!(role_selector, Selector::Name(_)));

        let role_name_selector: Selector = "button:Submit".into();
        if let Selector::Role { role, name } = role_name_selector {
            assert_eq!(role, "button");
            assert_eq!(name, Some("Submit".to_string()));
        } else {
            panic!("Expected Role selector");
        }

        let id_selector: Selector = "#submit-button".into();
        if let Selector::Id(id) = id_selector {
            assert_eq!(id, "submit-button");
        } else {
            panic!("Expected Id selector");
        }

        let path_selector: Selector = "/AXApplication/AXWindow/AXButton".into();
        if let Selector::Path(path) = path_selector {
            assert_eq!(path, "/AXApplication/AXWindow/AXButton");
        } else {
            panic!("Expected Path selector");
        }
    }

    #[test]
    fn test_complex_selectors() {
        let desktop = create_mock_desktop();

        // Test attribute selectors
        let mut attrs = BTreeMap::new();
        attrs.insert("role".to_string(), "AXButton".to_string());
        attrs.insert("label".to_string(), "Submit".to_string());

        let attr_selector = Selector::Attributes(attrs);
        let elements = desktop.locator(attr_selector).all().unwrap();

        // Should find our submit button
        assert_eq!(elements.len(), 1);
        assert_eq!(elements[0].id().unwrap(), "submit-button");

        // Test chained selectors
        let chained = Selector::Chain(vec![
            Selector::Role {
                role: "AXApplication".to_string(),
                name: Some("Safari".to_string()),
            },
            Selector::Role {
                role: "AXButton".to_string(),
                name: None,
            },
        ]);

        let safari_buttons = desktop.locator(chained).all();
        assert!(safari_buttons.is_ok());
    }
}
