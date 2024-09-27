use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

pub async fn watch_pid(pid: u32) -> bool {
    loop {
        let (command, args) = if cfg!(target_os = "windows") {
            (
                "tasklist",
                vec!["/FI".to_string(), format!("PID eq {}", pid)],
            )
        } else {
            ("ps", vec!["-p".to_string(), pid.to_string()])
        };

        let output = Command::new(command)
            .args(&args)
            .output()
            .expect("failed to execute process check command");

        if !output.status.success() || output.stdout.is_empty() {
            return true;
        }

        sleep(Duration::from_secs(1)).await;
    }
}
