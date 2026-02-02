fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AVFoundation");

        // Build the XPC service for screen capture (fixes macOS 26 TCC permission issue)
        build_xpc_service();
    }
    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn build_xpc_service() {
    use std::env;
    use std::path::PathBuf;
    use std::process::Command;

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let xpc_dir = manifest_dir.join("XPCServices");
    let build_script = xpc_dir.join("build-xpc-service.sh");

    // Only build if the script exists
    if !build_script.exists() {
        println!("cargo:warning=XPC service build script not found, skipping XPC build");
        return;
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let xpc_build_dir = out_dir.join("xpc-services");

    // Get bundle ID from environment or use default
    let bundle_id = env::var("TAURI_BUNDLE_IDENTIFIER")
        .unwrap_or_else(|_| "screenpi.pe".to_string());
    let xpc_bundle_id = format!("{}.ScreenCaptureService", bundle_id);

    // Get signing identity if available
    let signing_identity = env::var("APPLE_SIGNING_IDENTITY").unwrap_or_default();

    println!("cargo:rerun-if-changed={}", xpc_dir.join("ScreenCaptureService").display());
    println!("cargo:rerun-if-changed={}", build_script.display());

    // Run the build script
    let status = Command::new("bash")
        .arg(&build_script)
        .arg(&xpc_build_dir)
        .arg(&xpc_bundle_id)
        .arg(&signing_identity)
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=XPC service built successfully");
            // Set environment variable for Tauri bundler to find the XPC service
            println!("cargo:rustc-env=XPC_SERVICE_PATH={}", xpc_build_dir.join("ScreenCaptureService.xpc").display());
        }
        Ok(s) => {
            println!("cargo:warning=XPC service build failed with exit code: {:?}", s.code());
        }
        Err(e) => {
            println!("cargo:warning=Failed to run XPC service build script: {}", e);
        }
    }
}
