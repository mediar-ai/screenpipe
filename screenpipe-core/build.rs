fn main() {
    println!("cargo:rustc-link-search=/opt/homebrew/opt/libomp/lib");
    println!("cargo:rustc-link-lib=omp");
}