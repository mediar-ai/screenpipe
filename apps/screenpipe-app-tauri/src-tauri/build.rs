fn main() {
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=framework=AVFoundation");
    tauri_build::build()
}
