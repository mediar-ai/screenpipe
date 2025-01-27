use tauri_plugin_shell::{ShellExt, process::CommandChild};
use tauri::RunEvent;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

struct ChildCommands(Option<CommandChild>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Build the Tauri application
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet]);
    let app = builder
        .build(tauri::generate_context!()).unwrap();

    // Start the actual Tauri app
    let mut child_commands = ChildCommands(None);
    app
    .run(move |app_handle, event| match event {
        RunEvent::Ready => {
            // Start screenpipe server
            let (_, screenpipe_child) = app_handle.
            shell()
            .sidecar("screenpipe")
            .unwrap()
            .spawn()
            .expect("Failed to start screenpipe");

            child_commands.0 = Some(screenpipe_child);
        }
        RunEvent::ExitRequested { code: _, api: _, .. } => {
            // Kill screenpipe server.
            // Tauri is supposed to do this with sidecars but with Screenpipe
            // it doesn't seem to be working
            if let Some(child) = child_commands.0.take() {
                child.kill().expect("Failed to close subprocesses");
            }
        }
        _ => {}
    });
}