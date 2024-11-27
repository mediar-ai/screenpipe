#[cfg(target_os = "macos")]
use std::{fs, process::Command};

fn main() {
    // Copies executables and hardcodes the dylibs
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "x86_64")]
        {
            fs::copy("../../target/x86_64-apple-darwin/release/screenpipe", "screenpipe-x86_64-apple-darwin")?;
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
            fs::copy("../../target/aarch64-apple-darwin/release/screenpipe", "screenpipe-aarch64-apple-darwin")?;
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
