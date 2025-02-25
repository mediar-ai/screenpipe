use anyhow::Result;
use tracing::debug;
use uiautomation::variants::Variant;
use uiautomation::types::UIProperty::ProcessId;
use uiautomation::{UIAutomation, controls::ControlType};
use uiautomation::types::{UIProperty, TreeScope};

use super::BrowserUrlDetector;

pub struct WindowsUrlDetector;

impl WindowsUrlDetector {
    pub fn new() -> Self {
        Self
    }

    fn get_active_url_from_window(pid: i32) -> Result<Option<String>> {
        let automation = UIAutomation::new().unwrap();
        let root_ele = automation.get_root_element().unwrap();
        let condition = automation.create_property_condition(
            ProcessId, 
            Variant::from(pid as i32),
            None
        ).unwrap();

        let element = root_ele.find_first(TreeScope::Subtree, &condition).unwrap();

        let control_condition = automation.create_property_condition(
            UIProperty::ControlType,
            Variant::from(ControlType::Edit as i32),
            None,
        ).unwrap();

        if let Ok(address_bar) = element.find_first(TreeScope::Subtree, &control_condition){
            debug!("address_bar: {:?}", address_bar);
            if let Ok(value) = address_bar.get_property_value(UIProperty::ValueValue) {
                if let Ok(url) = value.get_string() {
                    if !url.is_empty() {
                        if url.starts_with("http://") 
                            || url.starts_with("https://")
                            || url.starts_with("ws://") {
                            debug!("found url: {}", url);
                            return Ok(Some(url));
                        }
                    }
                }
            }
        }
        Ok(None)
    }
}

impl BrowserUrlDetector for WindowsUrlDetector {
    fn get_active_url(&self, _app_name: &str, process_id: i32) -> Result<Option<String>> {
         return Self::get_active_url_from_window(process_id);
    }
}

