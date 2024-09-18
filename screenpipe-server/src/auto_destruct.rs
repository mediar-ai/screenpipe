use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

pub async fn watch_pid(pid: u32) -> bool {
    loop {
        let output = Command::new("ps")
            .arg("-p")
            .arg(pid.to_string())
            .output()
            .expect("failed to execute ps command");

        if !output.status.success() {
            return true;
        }

        sleep(Duration::from_secs(1)).await;
    }
}