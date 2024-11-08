#[cfg(target_os = "macos")]
use std::{env, process::Command, path::PathBuf};

fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=dylib=screenpipe");

        // Get the package root directory
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let lib_path = PathBuf::from(&manifest_dir).join("lib");
        let bin_path = PathBuf::from(&manifest_dir).join("bin");

        // Add the library search path
        println!("cargo:rustc-link-search=native={}", lib_path.display());

        // Compile Swift UI monitoring executable
        println!("cargo:rerun-if-changed=src/ui_monitoring_macos.swift");
        
        let status = Command::new("swiftc")
            .args(&[
                "-o", bin_path.join("ui_monitor").to_str().unwrap(),
                "src/ui_monitoring_macos.swift",
            ])
            .status()
            .expect("failed to compile swift executable");
            
        if !status.success() {
            panic!("failed to compile ui monitoring executable");
        }
    }
}
