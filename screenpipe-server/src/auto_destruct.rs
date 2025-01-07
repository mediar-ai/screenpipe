use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{CloseHandle, HANDLE};
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION};

#[cfg(target_os = "windows")]
fn is_process_alive(pid: u32) -> bool {
    unsafe {
        let process: HANDLE = OpenProcess(PROCESS_QUERY_INFORMATION, false, pid).unwrap();
        if process.is_invalid() {
            return false;
        }
        CloseHandle(process);
        true
    }
}

pub async fn watch_pid(pid: u32) -> bool {
    println!("starting to watch for app termination (pid: {})", pid);

    loop {
        #[cfg(target_os = "windows")]
        {
            // Try Windows API first
            if !is_process_alive(pid) {
                println!("process {} not found via windows api", pid);
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

            println!("pid alive: {}, app alive: {}", pid_alive, app_alive);

            if !pid_alive || !app_alive {
                return true;
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let output = Command::new("ps")
                .args(&["-p", &pid.to_string()])
                .output()
                .expect("failed to execute process check command");

            if !output.status.success() || output.stdout.is_empty() {
                return true;
            }
        }

        sleep(Duration::from_secs(1)).await;
    }
}
