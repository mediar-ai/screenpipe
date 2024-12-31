use anyhow::Result;
use log::{debug, error, info, warn};
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{sleep, Duration};
use which::which;
use windows::{
    core::*, Win32::Foundation::*, Win32::System::Com::*, Win32::UI::Accessibility::*,
    Win32::UI::WindowsAndMessaging::*, UI::UIAutomation::*,
};

pub async fn run_ui() -> Result<()> {
    info!("Starting Windows UI monitoring service...");

    let binary_name = "ui_monitor.exe";

    // Resolve binary path dynamically
    let ui_monitor_path = resolve_binary_path(binary_name)?;
    info!("ui_monitor path: {}", ui_monitor_path.display());

    loop {
        let mut child = Command::new(&ui_monitor_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("Failed to start ui_monitor");

        info!("ui_monitor process started");

        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

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

        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            tokio::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    error!("ui_monitor stderr: {}", line);
                }
            });
        }

        // UI Automation Logic
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
            EnumWindows(Some(enum_window_proc), LPARAM(0));
            CoUninitialize();
        }

        match child.wait().await {
            Ok(status) => {
                warn!("ui_monitor exited with status: {}", status);
                warn!("Restarting ui_monitor in 5 seconds...");
                sleep(Duration::from_secs(5)).await;
            }
            Err(e) => {
                error!("Failed to wait for ui_monitor process: {}", e);
                warn!("Retrying ui_monitor in 5 seconds...");
                sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

fn resolve_binary_path(binary_name: &str) -> Result<PathBuf> {
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
    let path = if bin_path.exists() {
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

    Ok(path)
}

unsafe extern "system" fn enum_window_proc(hwnd: HWND, _: LPARAM) -> BOOL {
    let mut buffer = [0u16; 512];
    if GetWindowTextW(hwnd, &mut buffer) > 0 {
        let window_title = String::from_utf16_lossy(&buffer);
        if !window_title.is_empty() && is_relevant_window(&window_title) {
            info!("Detected Window: {}", window_title);

            let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_ALL)
                .expect("Failed to create IUIAutomation instance");
            if let Ok(element) = automation.ElementFromHandle(hwnd) {
                if let Ok(name) = element.CurrentName() {
                    info!("Window Automation Name: {}", name);
                }
            } else {
                warn!("Failed to retrieve automation element for window.");
            }
        }
    }
    BOOL(1)
}

fn is_relevant_window(title: &str) -> bool {
    let system_titles = ["Program Manager", "Windows Shell Experience Host"];
    !system_titles.iter().any(|sys| title.contains(sys))
}
