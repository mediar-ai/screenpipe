use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

pub async fn watch_pid(pid: u32) -> bool {
    println!("starting to watch for app termination (pid: {})", pid);
    
    loop {
        #[cfg(target_os = "windows")]
        {
            // Check both PID and process name
            let pid_output = Command::new("tasklist")
                .args(&["/FI", &format!("PID eq {}", pid), "/NH", "/FO", "CSV"])
                .output()
                .expect("failed to check pid");

            let app_output = Command::new("tasklist")
                .args(&["/FI", "IMAGENAME eq screenpipe-app.exe", "/NH", "/FO", "CSV"])
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
