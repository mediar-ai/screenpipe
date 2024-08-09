#[cfg(target_os = "macos")]
fn main() {
    println!("cargo:rustc-link-lib=dylib=screenpipe");

    // Add the library search path
    println!("cargo:rustc-link-search=native=screenpipe-vision/lib");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
