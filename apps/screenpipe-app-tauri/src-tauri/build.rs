fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AVFoundation");

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
