#[cfg(target_os = "windows")]
fn link_onnx() {
    println!("cargo:rustc-link-search=native=../../apps/screenpipe-app-tauri/src-tauri/onnxruntime-win-x64-gpu-1.19.2/lib");
}

fn main() {
    #[cfg(target_os = "windows")]
    {
        link_onnx();
    }

    #[cfg(target_os = "macos")]
    {
        // Weak-link FoundationModels so the CLI launches on macOS < 26.
        // See apps/screenpipe-app-tauri/src-tauri/build.rs for detailed explanation.
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,FoundationModels");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
}
