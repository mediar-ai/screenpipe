use reqwest::Error;
use anyhow::{Result, anyhow};
use tracing::{debug, error};
use reqwest::blocking::Client;
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

    fn validate_url(url: &str) -> Result<bool, Error> {
        let client = Client::new();
        let response = client.get(url).send();
        match response {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
    
    fn get_active_url_from_window(pid: i32) -> Result<Option<String>> {
        let automation = UIAutomation::new().unwrap();
        let root_ele = automation.get_root_element().unwrap();
        let condition = automation.create_property_condition(
            ProcessId, 
            Variant::from(pid as i32),
            None
        ).unwrap();

        match root_ele.find_first(TreeScope::Subtree, &condition) {
            Ok(ele) => {
                let control_condition = automation.create_property_condition(
                    UIProperty::ControlType,
                    Variant::from(ControlType::Edit as i32),
                    None,
                ).unwrap();

                if let Ok(address_bar) = ele.find_first(TreeScope::Subtree, &control_condition){
                    debug!("address bar: {:?}", address_bar);
                    if let Ok(value) = address_bar.get_property_value(UIProperty::ValueValue) {
                        if let Ok(url) = value.get_string() {
                            if !url.is_empty() {
                                debug!("found url: {}", url);
                                if !url.starts_with("http://") && !url.starts_with("https://") {
                                    let full_url = format!("https://{}", url);
                                    debug!("reconstructed url: {}", full_url);
                                    if Self::validate_url(&full_url).unwrap_or(false) {
                                        debug!("validated url: {}", full_url);
                                        return Ok(Some(full_url));
                                    } else {
                                        debug!("invalid url, might be some search text: {}", url);
                                    }
                                } else {
                                    if Self::validate_url(&url).unwrap_or(false) {
                                        debug!("validated url: {}", url);
                                        return Ok(Some(url));
                                    } else {
                                        debug!("invalid url, might be some search text: {}", url);
                                    }
                                    return Ok(Some(url));
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("failed to find edit bar: {}", e);
                return Err(anyhow!("failed to find edit bar: {}", e));
            }
        }
        Ok(None)
    }
}

impl BrowserUrlDetector for WindowsUrlDetector {
    fn get_active_url(&self, _app_name: &str, process_id: i32, _window_title: &str) -> Result<Option<String>> {
         return Self::get_active_url_from_window(process_id);
    }
}

