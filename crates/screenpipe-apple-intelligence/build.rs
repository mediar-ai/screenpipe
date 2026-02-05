use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Only build on macOS
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "macos" {
        println!("cargo:warning=screenpipe-apple-intelligence only builds on macOS, skipping Swift compilation");
        return;
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let swift_src = PathBuf::from("swift/bridge.swift");
    let lib_path = out_dir.join("libfoundation_models_bridge.a");

    // Get the macOS SDK path
    let sdk_output = Command::new("xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .output()
        .expect("failed to run xcrun --show-sdk-path");
    let sdk_path = String::from_utf8(sdk_output.stdout)
        .unwrap()
        .trim()
        .to_string();

    // Compile Swift to static library
    let status = Command::new("swiftc")
        .args([
            "-emit-library",
            "-static",
            "-module-name",
            "FoundationModelsBridge",
            "-sdk",
            &sdk_path,
            "-target",
            "arm64-apple-macos26.0",
            "-O",
            "-whole-module-optimization",
            "-o",
        ])
        .arg(&lib_path)
        .arg(&swift_src)
        .status()
        .expect("failed to run swiftc");

    if !status.success() {
        panic!("swiftc compilation failed");
    }

    println!("cargo:rerun-if-changed=swift/bridge.swift");
    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=foundation_models_bridge");

    // Link required system frameworks and Swift runtime
    println!("cargo:rustc-link-lib=framework=FoundationModels");
    println!("cargo:rustc-link-lib=framework=Foundation");

    // Swift runtime libraries
    let _swift_lib_dir_output = Command::new("xcrun")
        .args(["--toolchain", "default", "--find", "swift-stdlib-tool"])
        .output()
        .ok();

    // Link Swift standard library path
    let toolchain_output = Command::new("xcrun")
        .args(["--toolchain", "default", "--show-sdk-platform-path"])
        .output()
        .expect("failed to find toolchain");
    let platform_path = String::from_utf8(toolchain_output.stdout)
        .unwrap()
        .trim()
        .to_string();

    // Standard Swift runtime lib directories
    let swift_lib_paths = [
        format!("{}/Developer/usr/lib/swift/macosx", platform_path),
        "/usr/lib/swift".to_string(),
        format!("{}/usr/lib/swift", sdk_path),
        format!("{}/usr/lib/swift/macosx", sdk_path),
    ];

    for path in &swift_lib_paths {
        if std::path::Path::new(path).exists() {
            println!("cargo:rustc-link-search=native={}", path);
        }
    }

    // Also add Xcode's Swift runtime
    if let Ok(xcode_dev_output) = Command::new("xcode-select").arg("-p").output() {
        let xcode_dev = String::from_utf8(xcode_dev_output.stdout)
            .unwrap()
            .trim()
            .to_string();
        let xcode_swift = format!(
            "{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx",
            xcode_dev
        );
        if std::path::Path::new(&xcode_swift).exists() {
            println!("cargo:rustc-link-search=native={}", xcode_swift);
        }
        let xcode_swift_static = format!(
            "{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift_static/macosx",
            xcode_dev
        );
        if std::path::Path::new(&xcode_swift_static).exists() {
            println!("cargo:rustc-link-search=native={}", xcode_swift_static);
        }
    }

    // Add rpaths so Swift runtime dylibs can be found at runtime
    // Swift concurrency, observation, etc. live in /usr/lib/swift
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../lib/swift/macosx");

    // Also add the Xcode toolchain rpath as fallback
    if let Ok(xcode_dev_output) = Command::new("xcode-select").arg("-p").output() {
        let xcode_dev = String::from_utf8(xcode_dev_output.stdout)
            .unwrap()
            .trim()
            .to_string();
        let toolchain_rpath = format!(
            "{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx",
            xcode_dev
        );
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", toolchain_rpath);
    }
}
