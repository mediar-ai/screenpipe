fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AVFoundation");

        // Weak-link FoundationModels so the app launches on macOS < 26.
        // The Swift static library (from screenpipe-apple-intelligence) creates a strong
        // LC_LOAD_DYLIB reference to FoundationModels.framework. Passing -weak_framework
        // here in the *binary* crate's build.rs overrides it to LC_LOAD_WEAK_DYLIB,
        // so DYLD skips the framework instead of crashing when it doesn't exist.
        // Note: cargo:rustc-link-arg in a *library* crate's build.rs does NOT propagate
        // to the final binary — it must be set here.
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,FoundationModels");

        // Swift runtime rpaths — needed for apple-intelligence feature
        // (libswift_Concurrency.dylib etc. live in these directories)
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

        if let Ok(output) = std::process::Command::new("xcode-select")
            .arg("-p")
            .output()
        {
            let xcode_dev = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let toolchain_swift = format!(
                "{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx",
                xcode_dev
            );
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", toolchain_swift);
        }
    }

    tauri_build::build()
}
