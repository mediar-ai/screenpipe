#[cfg(target_os = "windows")]
use std::{io, fs, process::Command};

fn main() {
    #[cfg(target_os = "windows")]
    {
        let url = "https://github.com/microsoft/onnxruntime/releases/download/v1.19.2/onnxruntime-win-x64-gpu-1.19.2.zip";
        let resp = reqwest::blocking::get(url).expect("request failed");
        let body = resp.text().expect("body invalid");
        let mut out = fs::File::create("onnxruntime-win-x64-gpu-1.19.2.zip").expect("failed to create file");
        io::copy(&mut body.as_bytes(), &mut out).expect("failed to copy content");
        let status = Command::new("unzip")
            .args(["onnxruntime-win-x64-gpu-1.19.2.zip"])
            .status()
            .expect("failed to execute process");
        if !status.success() {
            panic!("failed to install onnx binary");
        }
        fs::rename("onnxruntime-win-x64-gpu-1.19.2",
            "../screenpipe-app-tauri/src-tauri/onnxruntime-win-x64-gpu-1.19.2");
    }
}
