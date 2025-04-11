use std::thread;
use std::time::Duration;

use anyhow::{Result}; // Use anyhow for better error handling

use screenpipe_core::operator::platforms;
use screenpipe_core::operator::{AutomationError, Selector}; // Import Element

// like a playground, just uncomment
fn main() -> Result<()> { // Use anyhow::Result
    // Initialize the automation engine
    // Use true, true if you need debug logs and accessibility mode
    let engine = platforms::create_engine(false, false)?;

    // --- Part 1: Focus on PDF Viewer (e.g., Acrobat) ---
    println!("focusing on pdf viewer...");
    // Note: Adjust "Acrobat" if the window title is different (e.g., "Adobe Acrobat Reader")
    // Using a partial match might be safer: Selector::NameContains("Acrobat".to_string())
    let app = engine.get_application_by_name("Acrobat").unwrap();
    app.focus()?;

    // app.scroll("down", 100.0)?;

    // return Ok(());

    let pharma_app = engine.get_application_by_name("pharma.com - v0 App").unwrap();
    pharma_app.focus()?;
    println!("pdf viewer focused.");
    thread::sleep(Duration::from_secs(1));

    println!("pharma application focused.");
    thread::sleep(Duration::from_secs(2)); // Wait for app to be ready

    // find all input fields
    let input_fields = pharma_app.locator(Selector::Role { role: "edit".to_string(), name: None }).unwrap().all().unwrap();
    // println!("input fields: {:?}", input_fields);

        // Define the data to be filled using AutomationId
        let text_fields = vec![
            ("patientName", "Johnathan Michael Sterling"),
            ("dob", "03/15/1968"),
            ("address", "123 Meadow Lane"),
            ("phone", "(555) 123-4567"),
            ("cityState", "Anytown, CA 90210"),
            ("email", "j.sterling@emailprovider.net"),
            ("physicianName", "Dr. Evelyn Reed"),
            ("npiNumber", "1234567890"),
            ("facilityName", "Anytown General Hospital"),
            ("officePhone", "(555) 987-6543"),
            ("facilityAddress", "456 Health Plaza, Anytown, CA 90211"),
            ("officeFax", "(555) 987-6544"),
            ("medication", "CardiaCare XR"),
            ("dosage", "100mg"),
            ("frequency", "Once Daily"),
            ("diagnosis", "I10 (Essential Hypertension)"),
            ("insuranceName", "Blue Shield United"),
            ("policyNumber", "MBR123456789"),
            ("groupNumber", "GRP789XYZ"),
            ("income", "$48,500"),
            ("householdMembers", "2"),
            // ("otherSpecify", "N/A"), // Uncomment if needed
            ("signature", "Johnathan M. Sterling"),
            ("signatureDate", "11/02/2023"),
            // ("relationship", ""), // Leave blank
        ];

        // Define the AutomationIds for radio buttons to click
        let radio_click_fields = vec![
            "insuranceYes",
            "medicareNo",
            "medicaidNo",
        ];

        // Define the AutomationIds for checkboxes to click
        let checkbox_click_fields = vec![
            "taxReturn",
            "payStubs",
            // Add other checkbox IDs here if needed, e.g., "socialSecurity", "other"
        ];

    // for each input field, set the value to "test"
    for input_field in input_fields {
        let attrs = input_field.attributes();
        let automation_id_raw = attrs.properties.get("AutomationId")
            .and_then(|opt| opt.as_ref())
            .and_then(|val| val.as_str())
            .unwrap_or("");

        // Extract the actual ID from the "STRING(...)" format
        let automation_id = if automation_id_raw.starts_with("STRING(") && automation_id_raw.ends_with(')') {
            &automation_id_raw[7..automation_id_raw.len() - 1] // Get the substring inside STRING(...)
        } else {
            automation_id_raw // Use the raw value if it doesn't match the format
        };

        println!("input field raw: {:?}, parsed: {:?}", automation_id_raw, automation_id); // Updated log

        let text_to_type = text_fields.iter().find(|(id, _)| {
            automation_id == *id // Now compares the parsed ID
        }).unwrap_or_else(|| {
            println!("no text field found for automation id: {:?}", automation_id); // Log parsed ID
            // Log the full properties map for context if not found
            println!("full properties for missing id: {:?}", attrs.properties);
            &("", "")
        }).1;
        if text_to_type.is_empty() { // Use is_empty() for clarity
            continue;
        }
        if let Err(e) = input_field.focus() {
            println!("error focusing on input field ({}): {:?}", automation_id, e);
        }
        if let Err(e) = input_field.hover() {
            println!("error hovering on input field ({}): {:?}", automation_id, e);
        }
        if let Err(e) = input_field.click() {
            println!("error clicking on input field ({}): {:?}", automation_id, e);
        }
        if let Err(e) = input_field.type_text(text_to_type) {
            println!("error typing text ('{}') into input field ({}): {:?}", text_to_type, automation_id, e);
        }
        println!("typed '{}' into input field id: {}", text_to_type, automation_id); // Updated log
        thread::sleep(Duration::from_millis(10));
    }


    // get all radio buttons and click the specified ones
    let radio_buttons = pharma_app.locator(Selector::Role { role: "radiobutton".to_string(), name: None }).unwrap().all().unwrap();
    for radio_button in radio_buttons {
        let attrs = radio_button.attributes();
        let automation_id_raw = attrs.properties.get("AutomationId")
            .and_then(|opt| opt.as_ref())
            .and_then(|val| val.as_str())
            .unwrap_or("");

        // Extract the actual ID from the "STRING(...)" format
        let automation_id = if automation_id_raw.starts_with("STRING(") && automation_id_raw.ends_with(')') {
            &automation_id_raw[7..automation_id_raw.len() - 1]
        } else {
            automation_id_raw
        };

        // Check if this radio button's ID is in the list of fields to click
        if radio_click_fields.contains(&automation_id) { // Use the new radio_click_fields vector
            println!("attempting to click radio button: {}", automation_id);
            if let Err(e) = radio_button.focus() {
                println!("error focusing on radio button ({}): {:?}", automation_id, e);
            }
            if let Err(e) = radio_button.hover() {
                println!("error hovering on radio button ({}): {:?}", automation_id, e);
            }
            if let Err(e) = radio_button.click() {
                println!("error clicking radio button ({}): {:?}", automation_id, e);
            } else {
                println!("clicked radio button: {}", automation_id);
            }
            thread::sleep(Duration::from_millis(50)); // Small delay after clicking
        } else {
             // Optional: Log radio buttons that are found but not in the click_fields list
             // println!("skipping radio button (not in click_fields): {}", automation_id);
        }
    }

    // get all checkboxes and click the specified ones
    let checkboxes = pharma_app.locator(Selector::Role { role: "checkbox".to_string(), name: None }).unwrap().all().unwrap();
    for checkbox in checkboxes {
        let attrs = checkbox.attributes();
        let automation_id_raw = attrs.properties.get("AutomationId")
            .and_then(|opt| opt.as_ref())
            .and_then(|val| val.as_str())
            .unwrap_or("");

        // Extract the actual ID from the "STRING(...)" format
        let automation_id = if automation_id_raw.starts_with("STRING(") && automation_id_raw.ends_with(')') {
            &automation_id_raw[7..automation_id_raw.len() - 1]
        } else {
            automation_id_raw
        };

        println!("checkbox automation id: {}", automation_id);
        // Check if this checkbox's ID is in the list of fields to click
        if checkbox_click_fields.contains(&automation_id) { // Use the new checkbox_click_fields vector
            println!("attempting to click checkbox: {}", automation_id);
            if let Err(e) = checkbox.focus() {
                println!("error focusing on checkbox ({}): {:?}", automation_id, e);
            }
            if let Err(e) = checkbox.hover() {
                println!("error hovering on checkbox ({}): {:?}", automation_id, e);
            }
            // Note: Checkboxes might toggle. Clicking them ensures they are checked if unchecked,
            // or potentially unchecks them if already checked. Adjust logic if specific state is needed.
            if let Err(e) = checkbox.click() {
                println!("error clicking checkbox ({}): {:?}", automation_id, e);
            } else {
                println!("clicked checkbox: {}", automation_id);
            }
            thread::sleep(Duration::from_millis(50)); // Small delay after clicking
        } else {
             // Optional: Log checkboxes found but not in the click list
             // println!("skipping checkbox (not in click_fields): {}", automation_id);
        }
    }


    Ok(()) // Use Ok(()) for anyhow::Result
}
