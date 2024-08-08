use std::env;

#[cfg(target_os = "macos")]
fn main() {
    let destination = env::var("DESTINATION").unwrap_or_default();

    println!("cargo:rustc-link-search=native=screenpipe-vision/lib");

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
