use std::time::Instant;
use tracing::{debug, info, Level};
use tracing_subscriber::FmtSubscriber;

use screenpipe_core::operator::platforms::macos::MacOSEngine;
use screenpipe_core::operator::platforms::AccessibilityEngine;
use screenpipe_core::operator::Selector;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging with DEBUG level to see all logs
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::DEBUG)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    debug!("debug logging enabled");
    info!("looking for messages app...");
    
    // Create accessibility engine with activate_app set to true
    // This helps refresh the accessibility tree and ensures app focus
    let engine = MacOSEngine::new(true, true)?;
    
    // Get Messages application
    let messages_app = match engine.get_application_by_name("Messages") {
        Ok(app) => {
            info!("found messages app!");
            app
        }
        Err(e) => {
            info!("error finding messages app: {:?} - is it running?", e);
            return Ok(());
        }
    };

    info!("getting all elements from messages app...");
    let start = Instant::now();

    // Get all elements
    let all_elements = engine.find_elements(&Selector::Text(String::from("")), Some(&messages_app))?;
    
    info!("found {} total elements in messages app in {:?}", all_elements.len(), start.elapsed());
    
    // Define sets of definitely and sometimes interactable roles
    let definitely_interactable = [
        "AXButton", "AXMenuItem", "AXMenuBarItem", "AXCheckBox", "AXPopUpButton",
        "AXTextField", "AXTextArea", "AXComboBox", "AXLink", "AXScrollBar",
    ];
    
    let sometimes_interactable = [
        "AXImage", "AXCell", "AXSplitter", "AXRow", "AXStatusItem",
    ];
    
    // Filter for interactable elements with text
    let interactable_elements: Vec<_> = all_elements.iter()
        .enumerate()
        .filter(|(_, element)| {
            let role = element.role();
            let text = element.text(10).unwrap_or_default();
            
            // Check if it has text
            let has_text = !text.is_empty();
            
            // Check if it's interactable
            let is_interactable = definitely_interactable.contains(&role.as_str()) ||
                                 sometimes_interactable.contains(&role.as_str());
            
            has_text && is_interactable
        })
        .collect();
    
    info!("found {} interactable elements with text", interactable_elements.len());
    
    // Log the first 10 interactable elements
    for (i, (original_index, element)) in interactable_elements.iter().take(10).enumerate() {
        let role = element.role();
        let text = element.text(10).unwrap_or_default();
        
        // Truncate text if it's too long for logging
        let text_preview = if text.len() > 50 {
            format!("{}...", &text[..47])
        } else {
            text
        };
        
        info!("[{}] index={}, role={}, text={}", i, original_index, role, text_preview);
    }
    
    // Look for text input field specifically with "Message" text
    info!("looking for text field with 'Message' text...");
    let message_text_field = interactable_elements.iter()
        .find(|(_, element)| {
            let role = element.role();
            let text = element.text(10).unwrap_or_default();
            
            // Check if it's a text field/area containing "Message"
            (role == "textfield" || role == "textarea" || role == "AXTextField" || role == "AXTextArea") 
                && text.contains("Message")
        });
    
    if let Some((original_index, element)) = message_text_field {
        info!("found message text field at original index: {}", original_index);
        
        // Type "hello world" with smile emoji
        info!("typing message into text field...");
        match element.type_text("hello world 😊") {
            Ok(_) => info!("successfully typed message"),
            Err(e) => info!("failed to type message: {:?}", e),
        }
        
        // Brief pause to see the text
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        // Press return key to send the message
        info!("pressing return key to send message...");
        match element.press_key("return") {
            Ok(_) => info!("successfully pressed return key"),
            Err(e) => info!("failed to press return key: {:?}", e),
        }
    } else {
        info!("no message text field found. trying another approach...");
        
        // Try using selector to find message text field directly
        info!("searching for message text field using selector...");
        match engine.find_element(&Selector::Text(String::from("Message")), Some(&messages_app)) {
            Ok(element) => {
                info!("found message text field using selector");
                info!("typing message into text field...");
                match element.type_text("hello world 😊") {
                    Ok(_) => info!("successfully typed message"),
                    Err(e) => info!("failed to type message: {:?}", e),
                }
                
                std::thread::sleep(std::time::Duration::from_millis(500));
                
                info!("pressing return key to send message...");
                match element.press_key("return") {
                    Ok(_) => info!("successfully pressed return key"),
                    Err(e) => info!("failed to press return key: {:?}", e),
                }
            },
            Err(e) => {
                info!("failed to find message text field using selector: {:?}", e);
                
                // Fall back to original behavior if needed
                // Check if we have enough elements to access index 60 (original functionality)
                let target_index = 63;
                if interactable_elements.len() > target_index {
                    let (original_index, element) = &interactable_elements[target_index];
                    info!("pressing Return key on element at index {} (original index: {})", target_index, original_index);
                    
                    // Try to press Return key on the element
                    match element.press_key("return") {
                        Ok(_) => info!("successfully pressed Return key on element"),
                        Err(e) => info!("failed to press Return key: {:?}", e),
                    }
                } else {
                    info!("not enough elements to access index {}, only have {}", target_index, interactable_elements.len());
                }
            }
        }
    }
    
    info!("test completed successfully");
    Ok(())
}