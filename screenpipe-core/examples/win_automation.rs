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
    let element = engine.get_application_by_name("firefox")?;
    println!("app element: {:?}", element);
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

    // get some texts from application root 
    // (heavy computational task keep depth low)
    let text = element.text(10)?;
    println!("element text: {:?}", text);


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
