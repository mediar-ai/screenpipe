use std::env;
use std::path::PathBuf;

#[cfg(target_os = "macos")]
fn main() {
    println!("cargo:rustc-link-lib=dylib=screenpipe");

    // Get the package root directory
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let lib_path = PathBuf::from(manifest_dir).join("lib");

    // Add the library search path
    println!("cargo:rustc-link-search=native={}", lib_path.display());
}

#[cfg(not(target_os = "macos"))]
fn main() {}
