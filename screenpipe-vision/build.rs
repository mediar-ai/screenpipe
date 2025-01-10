#[cfg(target_os = "macos")]
use std::{env, path::PathBuf, process::Command};

fn main() {
    #[cfg(target_os = "macos")]
    {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let bin_path = PathBuf::from(&manifest_dir).join("bin");

        // Create bin directory if it doesn't exist
        std::fs::create_dir_all(&bin_path).expect("failed to create bin directory");

        // Determine architecture-specific binary name
        let binary_name = if cfg!(target_arch = "aarch64") {
            "ui_monitor-aarch64-apple-darwin"
        } else {
            "ui_monitor-x86_64-apple-darwin"
        };

        let binary_path = bin_path.join(binary_name);

        println!("cargo:rerun-if-changed=src/ui_monitoring_macos.swift");

        let status = Command::new("swiftc")
            .args([
                "-O",
                "-whole-module-optimization",
                "-enforce-exclusivity=unchecked",
                "-num-threads",
                "8",
                "-target",
                if cfg!(target_arch = "aarch64") {
                    "arm64-apple-macos11.0"
                } else {
                    "x86_64-apple-macos11.0"
                },
                "-o",
                binary_path.to_str().unwrap(),
                "src/ui_monitoring_macos.swift",
                "-framework",
                "Cocoa",
                "-framework",
                "ApplicationServices",
                "-framework",
                "Foundation",
            ])
            .status()
            .expect("failed to compile Swift executable");

        if !status.success() {
            panic!("failed to compile ui_monitor executable");
        }

        let bin_path = PathBuf::from(&manifest_dir).join("bin");
        let new_path = bin_path.join("ui_monitor");
        std::fs::copy(&binary_path, &new_path).expect("failed to copy ui_monitor executable");
    }
}
