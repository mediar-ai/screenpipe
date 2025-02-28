use anyhow::{Ok, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use windows::{
    core::*, Win32::Foundation::HWND, Win32::System::Com::*, Win32::UI::Accessibility::*,
    Win32::UI::WindowsAndMessaging::*,
};

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    app_name: String,
    window_name: String,
    elements: Vec<ElementAttributes>,
    text_output: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ElementAttributes {
    name: String,
    control_type: i32,
    children: Vec<Self>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UIFrame {
    windows: isize, // Store HWND as an integer
    app_name: String,
    text_output: String,
    initial_traversal_time: u64,
}

fn get_foreground_windows() -> Result<HWND> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            Err(anyhow::Error::msg("Failed to get foreground window"))
        } else {
            Ok(hwnd)
        }
    }
}

fn get_ui_automation() -> Result<IUIAutomation> {
    unsafe {
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
        Ok(automation)
    }
}

fn tranverse_and_store_ui_elements(
    automation: &IUIAutomation,
    element: &IUIAutomationElement,
) -> Result<ElementAttributes> {
    unsafe {
        let name = element.CurrentName()?.to_string();
        let control_type = element.CurrentControlType()?;

        let condition = automation.CreateTrueCondition()?;
        let children = element.FindAll(TreeScope_Subtree, &condition)?;

        let mut child_elements = Vec::new();
        let count = children.Length()?;
        for i in 0..count {
            if let Ok(child) = children.GetElement(i) {
                if let OK(child_attr) = tranverse_and_store_ui_elements(automation, &child) {
                    child_elements.push(child_attr);
                }
            }
        }
        Ok(ElementAttributes {
            name,
            control_type: control_type.0,
            children: child_elements,
        })
    }
}

fn save_to_database(window_state: &WindowState) -> Result<()> {
    let conn = Connection::open("ui_monitor.db")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ui_elements (
            id INTEGER PRIMARY KEY,
            app_name TEXT,
            window_name TEXT,
            elements TEXT,
            text_output TEXT
        )",
        [],
    )?;

    let json_elements = serde_json::to_string(&window_state.elements)?;
    conn.execute(
        "INSERT INTO ui_elements (app_name, window_name, elements, text_output) VALUES (?1, ?2, ?3, ?4)",
        params![window_state.app_name, window_state.window_name, json_elements, window_state.text_output],
    )?;

    Ok(())
}

fn build_text_output(element: &[ElementAttributes]) -> String {
    let mut output = String::new();
    for elem in element {
        output.push_str(&format!("{} [{}]\n", elem.name, elem.control_type));
        output.push_str(&build_text_output(&elem.children));
    }
    output
}

fn measure_global_element_value_size(windows_state: &HashMap<HWND, WindowState>) -> usize {
    windows_state.iter().map(|(_, ws)| ws.elements.len().sum())
}

pub async fn run_ui() -> Result<()> {
    Ok(())
}
