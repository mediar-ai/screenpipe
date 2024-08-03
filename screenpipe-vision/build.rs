#[cfg(target_os = "macos")]
fn main() {
    // println!("cargo:rustc-link-lib=framework=Vision");
    // println!("cargo:rustc-link-lib=framework=Foundation");
    // println!("cargo:rustc-link-lib=framework=CoreGraphics");
    println!("cargo:rustc-link-lib=framework=Vision");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
