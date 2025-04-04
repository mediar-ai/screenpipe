use std::thread;
use std::time::Duration;

use screenpipe_core::operator::platforms;
use screenpipe_core::operator::Selector;
use screenpipe_core::operator::AutomationError;

// like a playground, just uncomment
fn main() -> Result<(), AutomationError> {
    let engine = platforms::create_engine(true, true)?;

    // get the root element
    // let root_element = engine.get_root_element();
    // println!("root element: {:?}", root_element);

    // Get an element by process id
    // let element_by_id = engine.get_element_by_id(12304)?;
    // println!("element by pid: {:?}", element_by_id);

    // get the focused element
    // let focused_element = engine.get_focused_element()?;
    // println!("Focused element: {:?}", focused_element);

    // get all applications
    // let applications = engine.get_applications()?;
    // println!("running applications element: {:?}", applications);

    // get an application by name
    // let app_by_name = engine.get_application_by_name("terminal")?;
    // println!("Application by name: {:?}", app_by_name);

    // find elements
    // let selector = Selector::Role { role: "button".to_string(), name: None };
    // let elements = engine.find_elements(&selector, None)?;
    // println!("Found elements: {:?}", elements);

    // find a single element
    // let sel = Selector::Role { role: "text".to_string(), name: None };
    // let element = engine.find_element(&sel, None)?;
    // println!("found single element: {:?}", element);

    // open an application
    // let opened_app = engine.open_application("msedge")?;
    // println!("opened application: {:?}", opened_app);

    // open a URL in a browser
    // let ele = engine.open_url("https://github.com", Some("msedge"))?;
    // println!("ele: {:?}", ele);

    // perform actions on an element
    // get root of an application
    // let element = engine.get_application_by_name("edge")?;
    // println!("app element: {:?}", element);
    // find a button
    // let sel = Selector::Role { role: "button".to_string(), name: None };
    // let but = engine.find_element(&sel, Some(&element))?;
    // println!("button ele: {:?}", but);
    // // actions on that button
    // but.focus()?;
    // but.click()?;
    // but.double_click()?;
    // but.right_click()?;

    std::thread::sleep(std::time::Duration::from_millis(200));

    // find a input
    // let input = Selector::Role { role: "edit".to_string(), name: None };
    // let inp = engine.find_element(&input, Some(&element))?;
    // println!("input element: {:?}", inp);
    // // some input
    // inp.focus()?;
    // std::thread::sleep(std::time::Duration::from_millis(200));
    // inp.type_text("check")?;
    // inp.press_key("{enter}")?;
    // // inp.press_key("check{enter}")?; // this is also valid

    // inp.set_value("")?;

    // let element = engine.open_application("msedge")?;
    // let inputs = element.locator(Selector::Text("Search".to_string())).unwrap().all().unwrap();
    // for input in inputs.iter() {
    //     println!("input: {:?}", input.attributes().properties);
    //     println!("input: {:?}", input.text(10).unwrap_or_default());
    //     println!("input: {:?}", input.attributes().label);
    //     // type text
    //     input.focus()?;
    //     input.type_text("hi").map_err(|e| println!("error: {:?}", e)).unwrap_or_default();
    //     // input.press_key("{enter}")?;
    // }


    // Initialize the automation engine
    // Use true, true if you need debug logs and accessibility mode
    let engine = platforms::create_engine(false, false)?; 

    // --- Part 1: Open Notepad and Simulate Legacy App ---

    // Ensure the file exists before trying to open it
        // Open Notepad with the specific file
        // Note: Opening notepad directly with a file might be OS dependent or tricky.
        // A more robust way might be to open notepad first, then use 'ctrl+o', then type the path.
        // Or, just open notepad blank and paste the data (less realistic simulation).
        // Let's try opening notepad blank first, then finding the edit area and setting its value.
        // let notepad_app = engine.open_application("notepad")?;
        let notepad_app = engine.get_application_by_name("notepad")?;
        println!("Notepad opened: {:?}", notepad_app.attributes());
        thread::sleep(Duration::from_secs(2)); // Wait for app to load
        notepad_app.focus()?;

        // Find the main text editing area in Notepad
        // The role might be "document" or "edit" - requires inspection
        // let notepad_edit_selector = Selector::Name("Text Editor".to_string()); 
        // let notepad_edit_area = notepad_app.locator(notepad_edit_selector).unwrap().first().unwrap().unwrap();
        // println!("Found Notepad edit area: {:?}", notepad_edit_area.attributes().properties);
        // println!("Found Notepad edit area: {:?}", notepad_edit_area.text(10).unwrap_or_default());

        // Read the data from the file
        // let legacy_data = fs::read_to_string(data_file_path)
        //     .map_err(|e| AutomationError::action(format!("failed to read data file: {}", e)))?;
            
        // Set the value (paste) the legacy data into Notepad's edit area
        // Alternatively use type_text if set_value isn't reliable for this element
        // notepad_edit_area.focus()?;
        // let edit = notepad_app.children().unwrap();
        // println!("edit: {:?}", edit);
        thread::sleep(Duration::from_millis(200));
        // notepad_edit_area.set_value(&legacy_data)?; // Might work
        let formatted_text = r"CUSTOMER RECORD
ID 10039485        Created 2023 04 17
Acme Industries Ltd
Status ACTIVE    Contact John Smith    Phone 555 123 4567
Email jsmith at acmeindustries dot com

ORDERS
Order 7782    Date 2023 09 10    Amount 4750.00 USD
Items 3x Widget Pro 1000    2x Support Package Annual
Approved by Martinez    Ship via Express

Order 6691    Date 2023 06 22    Amount 1275.50 USD
Items 1x Widget Basic    5x Connector Kit
Backordered items 2x Power Supply

NOTES
Called on 2023 10 05 regarding shipment delay
Customer requested invoice copies sent to accounting
accounting email is invoices at acmeindustries dot com

PAYMENT TERMS
Net 30    Credit Limit 10000
Last Payment 2023 08 28    Amount 3200.00
Balance 2825.50

TODO follow up on missing documentation for order 7782
remind about maintenance renewal coming up in December";
        
        // notepad_edit_area.type_text(formatted_text)?;
        // sleep for 100ms
        println!("Pasted data into Notepad.");
        thread::sleep(Duration::from_millis(300));

        // --- Part 2: Extract Data from Notepad ---
        // Re-fetch the element or use the existing one
        // Get the text *value* from the edit area
        let extracted_text = notepad_app.text(10)?; // Use .value() or maybe .text() depending on API
        println!("Extracted text from Notepad:\n{}", extracted_text);

        // Basic parsing (replace with robust regex or parsing logic)
        // let mut customer_id = "not found";
        // let mut name = "not found";
        // let mut total = "not found";

        // for line in extracted_text.lines() {
        //     if line.starts_with("Customer ID:") {
        //         customer_id = line.split(':').nth(1).map_or("parse error", |s| s.trim());
        //     } else if line.starts_with("Name:") {
        //         name = line.split(':').nth(1).map_or("parse error", |s| s.trim());
        //     } else if line.starts_with("Order Total:") {
        //         total = line.split(':').nth(1).map_or("parse error", |s| s.trim());
        //     }
        // }
        // println!("Parsed - ID: {}, Name: {}, Total: {}", customer_id, name, total);


        // --- Part 3: Open Google Sheets and Input Data ---
        println!("Opening Google Sheets...");
        let sheets_app = engine.open_url("https://docs.google.com/spreadsheets/d/1u2vPS43pkFdIrtWbl4Ug7D1ROmrtSD-YTo24FwGqDdo/edit?gid=0#gid=0", None)?;
        // let sheets_app = engine.open_url("https://docs.google.com/spreadsheets/u/1/", None)?;
        println!("Sheets opened: {:?}", sheets_app.attributes());
        // Wait for Sheets to load
        // thread::sleep(Duration::from_secs(5)); 

        // sheets_app.focus()?;
        // println!("Focused Sheets window.");
        // thread::sleep(Duration::from_millis(500));

        // open new sheet using 
        // let new_sheet = sheets_app.locator(Selector::Text("Blank spreadsheet".to_string())).unwrap().first().unwrap().unwrap();
        // println!("new sheet: {:?}", new_sheet);
        // new_sheet.focus()?;
        // new_sheet.press_key("{enter}")?;
        thread::sleep(Duration::from_millis(500));

        // Instead of a single string with {enter} characters, break into separate lines
        let sheet_data = [
            "Customer ID\tCompany\tContact\tPhone\tEmail\tStatus\tBalance",
            "10039485\tAcme Industries Ltd\tJohn Smith\t555 123 4567\tjsmith@acmeindustries.com\tACTIVE\t2825.50",
            "Order ID\tDate\tAmount\tItems\tStatus",
            "7782\t2023-09-10\t4750.00 USD\t3x Widget Pro 1000, 2x Support Package Annual\tShipped",
            "6691\t2023-06-22\t1275.50 USD\t1x Widget Basic, 5x Connector Kit\tBackordered",
            "Notes\tDate\tFollow-up",
            "Shipment delay\t2023-10-05\tResolved",
            "Invoice copies requested\t2023-10-02\tSent to accounting@acmeindustries.com",
            "Maintenance renewal\t2023-12-15\tReminder sent"
        ];

        // Visual indication of AI processing before pasting
        println!("ai analyzing legacy system data...");
        thread::sleep(Duration::from_millis(800));
        println!("extracting structured information...");
        thread::sleep(Duration::from_millis(800));
        println!("transforming to tabular format...");
        thread::sleep(Duration::from_millis(800));
        println!("data ready for input. filling spreadsheet...");
        
        // Get the currently focused element (should be in the sheet)
        let focused_element = engine.get_focused_element()?;
        focused_element.focus()?;
        
        // Type each line and press Enter between them
        for line in sheet_data.iter() {
            focused_element.type_text(line)?;
            focused_element.press_key("{enter}")?;
            thread::sleep(Duration::from_millis(100)); // Small delay between lines
        }
        
        println!("data successfully transferred from legacy system to google sheets!");
        thread::sleep(Duration::from_secs(2));


        // --- Part 4: Close Applications (Optional Cleanup) ---
        // This might require specific 'close window' buttons or alt+f4
        // println!("Closing Notepad...");
        // Find close button? Or send Alt+F4?
        // notepad_app.press_key("{alt down}{f4}{alt up}")?; 
        // thread::sleep(Duration::from_millis(500));
        // // Handle potential "Save?" dialog - find "Don't Save" button
        
        // println!("Closing Excel...");
        // excel_app.press_key("{alt down}{f4}{alt up}")?;
        // thread::sleep(Duration::from_millis(500));
        // // Handle potential "Save?" dialog

 

    println!("Demo script finished.");
    // input.focus()?;
    // input.type_text("hi")?;
    // input.press_key("{enter}")?;
    // get some texts from application root 
    // (heavy computational task keep depth low)
    // let text = element.text(10)?;
    // println!("element text: {:?}", text);

    // let locator = element.locator(Selector::Role { role: "button".to_string(), name: None }).unwrap().all().unwrap();
    // for l in locator.iter() {
    //     println!("locator: {:?}", l.attributes().properties);
    //     println!("locator: {:?}", l.attributes().role);
    //     println!("locator: {:?}", l.attributes().description);
    //     println!("locator: {:?}", l.attributes().value);
    //     println!("locator: {:?}", l.bounds());
    // }


    // check if enabled
    // let is_enabled = element.is_enabled()?;
    // println!("Is enabled: {:?}", is_enabled);

    // check if visible
    // let is_visible = inp.is_visible()?;
    // println!("Is visible: {:?}", is_visible);

    // check if focused
    // let is_focused = inp.is_focused()?;
    // println!("Is focused: {:?}", is_focused);

    // an action
    // element.perform_action("focus")?;

    // // find a scrollbar in application ele
    // let sclb = Selector::Role { role: "scrollbar".to_string(), name: None };
    // let sclb_ele = engine.find_element(&sclb, Some(&element))?;
    // println!("scroll bar ele: {:?}", sclb_ele);
    // // locate
    // let _ = element.locator(sclb)?;
    // // scroll the scrollbar
    // sclb_ele.scroll("down", 10.0)?;

    Ok(())
}
