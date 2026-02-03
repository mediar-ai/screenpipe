fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AVFoundation");

        // whisper.cpp ggml uses std::filesystem::path which requires macOS 10.15+
        // Set deployment target if not already set (CI sets its own values)
        if std::env::var("MACOSX_DEPLOYMENT_TARGET").is_err() {
            println!("cargo:rustc-env=MACOSX_DEPLOYMENT_TARGET=10.15");
            std::env::set_var("MACOSX_DEPLOYMENT_TARGET", "10.15");
        }
        if std::env::var("CMAKE_OSX_DEPLOYMENT_TARGET").is_err() {
            std::env::set_var("CMAKE_OSX_DEPLOYMENT_TARGET", "10.15");
        }
    }
    tauri_build::build()
}
