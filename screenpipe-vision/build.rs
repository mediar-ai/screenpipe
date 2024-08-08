#[cfg(target_os = "macos")]
fn main() {
    println!("cargo:rustc-link-search=native=screenpipe-vision/lib");
    println!("cargo:rustc-link-lib=dylib=ocr");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
