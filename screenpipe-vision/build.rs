use std::env;
use std::path::PathBuf;

fn main() {
    #[cfg(target_os = "macos")]
    {

        println!("cargo:rustc-link-lib=dylib=screenpipe");

        // Get the package root directory
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let lib_path = PathBuf::from(manifest_dir).join("lib");

        // Add the library search path
        println!("cargo:rustc-link-search=native={}", lib_path.display());
    }
}
