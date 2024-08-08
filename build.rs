use std::env;
use std::path::PathBuf;

#[cfg(target_os = "macos")]
fn main() {
    let destination = env::var("DESTINATION").unwrap_or_default();

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let lib_path = PathBuf::from(manifest_dir)
        .join("screenpipe-vision")
        .join("lib");

    println!("cargo:rustc-link-search=native={}", lib_path.display());

    if destination == "brew" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../lib");
    } else if destination == "tauri" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
    } else {
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../../screenpipe-vision/lib");
    }

    println!("cargo:rustc-link-lib=dylib=screenpipe");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
