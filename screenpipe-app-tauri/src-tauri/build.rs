#[cfg(target_os = "macos")]
use std::{fs, process::Command};

fn main() {
    // Copies executables and hardcodes the dylibs
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "x86_64")]
        {
            fs::copy("../../target/x86_64-apple-darwin/release/screenpipe", "screenpipe-x86_64-apple-darwin").unwrap();
            Command::new("install_name_tool")
                .args(["-change", "../../screenpipe-vision/lib/libscreenpipe_x86_64.dylib",
                       "@executable_path/../Frameworks/libscreenpipe_x86_64.dylib", "./screenpipe-x86_64-apple-darwin"])
                .status()
                .expect("failed to execute process");
            Command::new("install_name_tool")
                .args(["-change", "../../screenpipe-vision/lib/libscreenpipe.dylib",
                       "@executable_path/../Frameworks/libscreenpipe.dylib", "./screenpipe-x86_64-apple-darwin"])
                .status()
                .expect("failed to execute process");
        }
        #[cfg(target_arch = "aarch64")]
        {
            let primary_path = "../../target/aarch64-apple-darwin/release/screenpipe";
            let fallback_path = "../../target/release/screenpipe";
            
            let source_path = if fs::metadata(primary_path).is_ok() {
                primary_path
            } else {
                fallback_path
            };

            fs::copy(source_path, "screenpipe-aarch64-apple-darwin")
                .expect("failed to copy screenpipe binary");
            
            Command::new("install_name_tool")
                .args(["-change", "../../screenpipe-vision/lib/libscreenpipe_arm64.dylib",
                       "@executable_path/../Frameworks/libscreenpipe_arm64.dylib", "./screenpipe-aarch64-apple-darwin"])
                .status()
                .expect("failed to execute process");
            Command::new("install_name_tool")
                .args(["-change", "../../screenpipe-vision/lib/libscreenpipe.dylib",
                       "@executable_path/../Frameworks/libscreenpipe.dylib", "./screenpipe-aarch64-apple-darwin"])
                .status()
                .expect("failed to execute process");
        }
    }
    tauri_build::build()
}
