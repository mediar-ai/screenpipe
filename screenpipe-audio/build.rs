#[cfg(target_os = "windows")]
use std::{env, fs};
use std::{
    io::Result,
    process::{Command, Output},
};

fn main() {
    #[cfg(target_os = "windows")]
    {
        install_onnxruntime();
    }

    if !is_bun_installed() {
        install_bun();
    }
}

fn is_bun_installed() -> bool {
    let output = Command::new("bun").arg("--version").output();

    match output {
        Err(_) => false,
        Ok(output) => output.status.success(),
    }
}

fn run_bun_install_command(command: Result<Output>) {
    match command {
        Err(error) => {
            println!("failed to install bun: {}", error);
            println!("please install bun manually.");
        }
        Ok(output) => {
            if output.status.success() {
                println!("bun installed successfully.");
            } else {
                println!(
                    "failed to install bun: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
                println!("please install bun manually.");
            }
        }
    }
}

fn install_bun() {
    println!("installing bun...");

    #[cfg(target_os = "windows")]
    {
        println!("attempting to install bun using npm...");

        run_bun_install_command(Command::new("npm").args(["install", "-g", "bun"]).output());
    }

    #[cfg(not(target_os = "windows"))]
    {
        run_bun_install_command(
            Command::new("sh")
                .args(["-c", "curl -fsSL https://bun.sh/install | bash"])
                .output(),
        );
    }
}

#[cfg(target_os = "windows")]
fn find_unzip() -> Option<std::path::PathBuf> {
    let paths = [
        // check PATH first
        which::which("unzip").ok(),
        // fallback to common GnuWin32 location
        Some(std::path::PathBuf::from(r"C:\Program Files (x86)\GnuWin32\bin\unzip.exe")),
    ];

    paths.into_iter().flatten().find(|p| p.exists())
}

#[cfg(target_os = "windows")]
fn install_onnxruntime() {
    // Set static CRT for Windows MSVC target
    if env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default() == "msvc" {
        println!("cargo:rustc-env=KNF_STATIC_CRT=1");
        println!("cargo:rustc-flag=-C target-feature=+crt-static");
    }

    let url = "https://github.com/microsoft/onnxruntime/releases/download/v1.19.2/onnxruntime-win-x64-gpu-1.19.2.zip";
    let resp = reqwest::blocking::get(url).expect("request failed");
    let body = resp.bytes().expect("body invalid");
    fs::write("./onnxruntime-win-x64-gpu-1.19.2.zip", &body);
    let unzip_path = find_unzip().expect("could not find unzip executable - please install it via GnuWin32 or add it to PATH");
    
    let status = Command::new(unzip_path)
        .args(["onnxruntime-win-x64-gpu-1.19.2.zip"])
        .status()
        .expect("failed to execute unzip");
    
    if !status.success() {
        panic!("failed to install onnx binary");
    }
    fs::rename(
        "onnxruntime-win-x64-gpu-1.19.2",
        "../screenpipe-app-tauri/src-tauri/onnxruntime-win-x64-gpu-1.19.2",
    );
    println!("cargo:rustc-link-search=native=../screenpipe-app-tauri/src-tauri/onnxruntime-win-x64-gpu-1.19.2/lib");
}
