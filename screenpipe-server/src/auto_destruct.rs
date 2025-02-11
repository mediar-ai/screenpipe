use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;
#[cfg(target_os = "windows")]
use tracing::debug;
use tracing::info;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{CloseHandle, HANDLE, STILL_ACTIVE};
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_INFORMATION,
};

#[cfg(target_os = "windows")]
fn is_process_alive(pid: u32) -> bool {
    unsafe {
        let process: HANDLE = match OpenProcess(PROCESS_QUERY_INFORMATION, false, pid) {
            Ok(handle) => handle,
            Err(e) => {
                debug!("Failed to open process with PID ({}): {:?}", pid, e);
                return false;
            }
        };
        if process.is_invalid() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let result = GetExitCodeProcess(process, &mut exit_code);
        CloseHandle(process).expect("Failed to close process handle");
        if result.is_err() {
            debug!("Failed to get exit code for process with PID ({})", pid);
            return false;
        }
        exit_code == STILL_ACTIVE.0 as u32
    }
}

pub async fn watch_pid(pid: u32) -> bool {
    info!("starting to watch for app termination (pid: {})", pid);

    loop {
        #[cfg(target_os = "windows")]
        {
            // Try Windows API first
            if !is_process_alive(pid) {
                debug!("Process ({}) not found via windows api", pid);
                return true;
            }

            // Fallback to Command approach
            let pid_output = Command::new("tasklist")
                .args(&["/FI", &format!("PID eq {}", pid), "/NH", "/FO", "CSV"])
                .output()
                .expect("failed to check pid");

            let app_output = Command::new("tasklist")
                .args(&[
                    "/FI",
                    "IMAGENAME eq screenpipe-app.exe",
                    "/NH",
                    "/FO",
                    "CSV",
                ])
                .output()
                .expect("failed to check app name");

            let pid_alive = String::from_utf8_lossy(&pid_output.stdout).contains(&pid.to_string());
            let app_alive = !String::from_utf8_lossy(&app_output.stdout).is_empty();

            if !pid_alive || !app_alive {
                return true;
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let output = Command::new("ps")
                .args(["-p", &pid.to_string()])
                .output()
                .expect("failed to execute process check command");

            if !output.status.success() || output.stdout.is_empty() {
                return true;
            }
        }

        sleep(Duration::from_secs(1)).await;
    }
}

// inspiration: ps axuw | grep reddit-auto-posts | grep -v grep | awk '{print $2}' | xargs kill -9
#[cfg(target_os = "windows")]
pub async fn kill_orphan_processes(pipe_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let output = Command::new("wmic")
        .args(&[
            "process",
            "where",
            &format!("executablepath like '%{}%' and executablepath like '%screenpipe%' and executablepath like '%pipes%'", pipe_id),
            "get",
            "processid",
            "/format:csv",
        ])
        .output()
        .expect("failed to run wmic");

    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut pids = Vec::new();

    for line in output_str.lines().skip(1) {
        if let Some(pid) = line.split(',').last() {
            if let Ok(pid) = pid.trim().parse::<u32>() {
                pids.push(pid);
            }
        }
    }

    for pid in pids {
        let _ = Command::new("taskkill")
            .args(&["/PID", &pid.to_string(), "/F"])
            .output()
            .expect("failed to kill pid");
    }

    Ok(())
}

