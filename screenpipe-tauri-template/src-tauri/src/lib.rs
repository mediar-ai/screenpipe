use tauri_plugin_shell::ShellExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet]);
    let app = builder
        .build(tauri::generate_context!()).unwrap();
    let app_handle = app.handle();

    // Start screenpipe server
    app_handle.
    shell()
    .sidecar("screenpipe")
    .unwrap()
    .spawn()
    .expect("Failed to start screenpipe");

    // Download latest ffmpeg version
    ffmpeg_sidecar::download::auto_download().unwrap();

    // Start the actual Tauri app
    app
    .run(|_, _| {});
}