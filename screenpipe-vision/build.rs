#[cfg(target_os = "macos")]
use std::{env, process::Command, path::PathBuf};

#[cfg(target_os = "macos")]
fn compile_swift_library() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let lib_path = PathBuf::from(&manifest_dir).join("lib");
    
    // Create lib directory if it doesn't exist
    std::fs::create_dir_all(&lib_path).expect("failed to create lib directory");

    // Compile for both architectures
    let status = Command::new("swiftc")
        .args(&[
            "-emit-library",
            "-target", if cfg!(target_arch = "aarch64") { 
                "arm64-apple-macosx11.0" 
            } else { 
                "x86_64-apple-macosx11.0" 
            },
            "-o", lib_path.join(if cfg!(target_arch = "aarch64") {
                "libscreenpipe_arm64.dylib"
            } else {
                "libscreenpipe_x86_64.dylib"
            }).to_str().unwrap(),
            "src/ocr.swift",
            "-framework", "Metal",
            "-framework", "MetalPerformanceShaders",
            "-framework", "Vision",
            "-framework", "CoreImage",
        ])
        .status()
        .expect("failed to compile Swift library");

    if !status.success() {
        panic!("failed to compile Swift library");
    }

    // Tell cargo to link the library
    println!("cargo:rustc-link-search=native={}", lib_path.display());
    println!("cargo:rustc-link-lib=dylib=screenpipe");
}

fn main() {
    #[cfg(target_os = "macos")]
    {
        compile_swift_library();
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
            .args(&[
                "-O",
                "-whole-module-optimization",
                "-enforce-exclusivity=unchecked",
                "-num-threads", "8",
                "-target", if cfg!(target_arch = "aarch64") { 
                    "arm64-apple-macos11.0" 
                } else { 
                    "x86_64-apple-macos11.0" 
                },
                "-o", binary_path.to_str().unwrap(),
                "src/ui_monitoring_macos.swift",
                "-framework", "Cocoa",
                "-framework", "ApplicationServices",
                "-framework", "Foundation",
            ])
            .status()
            .expect("failed to compile Swift executable");
            
        if !status.success() {
            panic!("failed to compile ui_monitor executable");
        }
    }
}
