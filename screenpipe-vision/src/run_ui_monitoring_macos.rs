use anyhow::Result;
use log::{debug, error, info, warn};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{sleep, Duration};
use which::which;

pub async fn run_ui() -> Result<()> {
    info!("starting ui monitoring service...");

    let binary_name = "ui_monitor";

    // Try screenpipe-vision/bin first
    let bin_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(binary_name);

    // If not found, try current directory
    let current_dir_path = std::env::current_dir()?.join(binary_name);

    // Try the directory of the current executable
    let exe_dir_path = std::env::current_exe()?
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(binary_name);

    // Try using which
    let which_path = which(binary_name).ok();

    // If not found, try tauri location
    let ui_monitor_path = if bin_path.exists() {
        bin_path
    } else if current_dir_path.exists() {
        current_dir_path
    } else if exe_dir_path.exists() {
        exe_dir_path
    } else if let Some(path) = which_path {
        path
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("screenpipe-app-tauri")
            .join("src-tauri")
            .join(binary_name)
    };

    info!("ui_monitor path: {}", ui_monitor_path.display());

    loop {
        // Clone the PathBuf for each iteration
        let mut child = Command::new(&ui_monitor_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("failed to start ui_monitor");

        info!("ui_monitor process started");

        // Handle stdout
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            // Spawn a task to read lines asynchronously
            tokio::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    if line.to_lowercase().contains("error") {
                        error!("ui_monitor stdout: {}", line);
                    } else {
                        debug!("ui_monitor stdout: {}", line);
                    }
                }
            });
        }

        // Handle stderr
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            tokio::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    error!("ui_monitor stderr: {}", line);
                }
            });
        }

        // Wait for the process to exit
        match child.wait().await {
            Ok(status) => {
                warn!("ui_monitor exited with status: {}", status);
                warn!("restarting ui_monitor in 5 seconds...");
                sleep(Duration::from_secs(5)).await;
            }
            Err(e) => {
                error!("failed to wait for ui_monitor process: {}", e);
                warn!("retrying ui_monitor in 5 seconds...");
                sleep(Duration::from_secs(5)).await;
            }
        }
    }
}
