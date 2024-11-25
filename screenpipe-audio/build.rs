#[cfg(target_os = "windows")]
use std::time::Duration;
use reqwest::blocking::Client;
use std::{env, fs, process::Command, path::Path};

fn main() {
    #[cfg(target_os = "windows")]
    {
        // Set static CRT for Windows MSVC target
        if env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default() == "msvc" {
            println!("cargo:rustc-env=KNF_STATIC_CRT=1");
            println!("cargo:rustc-flag=-C target-feature=+crt-static");
        }

        let url = "https://github.com/microsoft/onnxruntime/releases/download/v1.19.2/onnxruntime-win-x64-gpu-1.19.2.zip";
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("failed to build client");
        let resp = client.get(url).send().expect("request failed");
        let body = resp.bytes().expect("body invalid");
        fs::write("./onnxruntime-win-x64-gpu-1.19.2.zip", &body).expect("failed to write");
        let status = Command::new("unzip")
            .args(["-o", "onnxruntime-win-x64-gpu-1.19.2.zip"])
            .status()
            .expect("failed to execute process");
        if !status.success() {
            panic!("failed to install onnx binary");
        }
        let target_dir = Path::new("../screenpipe-app-tauri/src-tauri/onnxruntime-win-x64-gpu-1.19.2");
        if target_dir.exists() {
            fs::remove_dir_all(target_dir).expect("failed to remove existing directory");
        }
        fs::rename(
            "onnxruntime-win-x64-gpu-1.19.2",
            target_dir,
        ).expect("failed to rename directory");
    }
}

