#[cfg(target_os = "macos")]
fn main() {
    println!("cargo:rustc-link-lib=dylib=screenpipe");

    // Add the library search path
    println!("cargo:rustc-link-search=native=screenpipe-vision/lib");

    // Set the rpath
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../lib");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../lib");

    // Ensure the linker uses the correct library name
    println!("cargo:rustc-link-arg=-Wl,-install_name,@rpath/libscreenpipe.dylib");

    // Debugging: Print the library search path
    println!("cargo:warning=Library search path: screenpipe-vision/lib");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
