#[cfg(target_os = "windows")]
fn link_onnx() {
    println!("cargo:rustc-link-search=native=../screenpipe-app-tauri/src-tauri/onnxruntime-win-x64-gpu-1.19.2/lib");
}

fn main() {
    #[cfg(target_os = "windows")]
    {
        link_onnx();
    }
}
