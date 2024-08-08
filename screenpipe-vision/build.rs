use std::env;

#[cfg(target_os = "macos")]
fn main() {
    println!("cargo:rustc-link-lib=dylib=screenpipe");

    // let destination = env::var("DESTINATION").unwrap_or_default();
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../lib");

    // if destination == "brew" {
    //     println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../lib");
    // } else if destination == "tauri" {
    //     println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
    // } else {
    //     println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../../screenpipe-vision/lib");
    // }
}

#[cfg(not(target_os = "macos"))]
fn main() {}
