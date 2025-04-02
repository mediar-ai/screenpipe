use screenpipe_core::operator::platforms;
use screenpipe_core::operator::Selector;
use screenpipe_core::operator::AutomationError;

// like a playground, just uncomment
fn main() -> Result<(), AutomationError> {
    let engine = platforms::create_engine(true, true)?;

    // get the root element
    let root_element = engine.get_root_element();
    println!("root element: {:?}", root_element);
    //
    // // Get an element by process id
    // let element_by_id = engine.get_element_by_id(12304)?;
    // println!("Element by ID: {:?}", element_by_id);
    //
    // // get the focused element
    // let focused_element = engine.get_focused_element()?;
    // println!("Focused element: {:?}", focused_element);

    // get all applications
    // let applications = engine.get_applications()?;
    // println!("running applications element: {:?}", applications);

    // Get an application by name
    let app_by_name = engine.get_application_by_name("terminal")?;
    println!("Application by name: {:?}", app_by_name);
    //
    // // find elements
    // let selector = Selector::Role { role: "button".to_string(), name: None };
    // let elements = engine.find_elements(&selector, None)?;
    // println!("Found elements: {:?}", elements);

    // find a single element
    // let sel = Selector::Role { role: "text".to_string(), name: None };
    // let element = engine.find_element(&sel, None)?;
    // println!("Found element: {:?}", element);
    //
    // // open an application
    // let opened_app = engine.open_application("msedge")?;
    // println!("opened application: {:?}", opened_app);

    // // open a URL in a browser
    // let ele = engine.open_url("https://github.com", Some("msedge"))?;
    // println!("ele: {:?}", ele);
    //
    // // perform actions on an element
    // let element = engine.get_application_by_name("msedge")?;
    // element.click()?;
    // element.double_click()?;
    // element.right_click()?;
    // element.hover()?;
    // element.focus()?;
    // element.type_text("check")?;
    // element.press_key("Enter")?;
    // let text = element.text(10)?;
    // println!("Element text: {:?}", text);
    // element.set_value("val check")?;
    // let is_enabled = element.is_enabled()?;
    // println!("Is enabled: {:?}", is_enabled);
    // let is_visible = element.is_visible()?;
    // println!("Is visible: {:?}", is_visible);
    // let is_focused = element.is_focused()?;
    // println!("Is focused: {:?}", is_focused);
    // element.perform_action("custom_action")?;
    // let _ = element.locator(selector)?;
    // element.scroll("down", 10.0)?;

    Ok(())
}
