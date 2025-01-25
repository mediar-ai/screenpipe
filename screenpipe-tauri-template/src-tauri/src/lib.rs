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
    let shell = app_handle.shell();
    let output = tauri::async_runtime::block_on(async move {
        shell
            .command("screenpipe")
            .output()
            .await
            .unwrap()
    });
    if output.status.success() {
        println!("Result: {:?}", String::from_utf8(output.stdout));
    } else {
        println!("Exit with code: {}", output.status.code().unwrap());
    }
    // Download latest ffmpeg version
    ffmpeg_sidecar::download::auto_download().unwrap();

    // Start the actual Tauri app
    app
    .run(|_, _| {});
}