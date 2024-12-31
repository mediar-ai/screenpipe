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
        let process: HANDLE = OpenProcess(PROCESS_QUERY_INFORMATION, false, pid);
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
            if !is_process_alive(pid) {
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
