#[cfg(target_os = "macos")]
fn main() {
    println!("cargo:rustc-link-lib=dylib=screenpipe");

    // Add the library search path
    println!("cargo:rustc-link-search=native=screenpipe-vision/lib");

    // Set the rpath
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../lib");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
