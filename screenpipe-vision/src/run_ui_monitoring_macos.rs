use std::process::Stdio;
use tokio::time::{sleep, Duration};
use tokio::io::{BufReader, AsyncBufReadExt};
use tokio::select;
use tokio::process::Command as TokioCommand;
use anyhow::Result;
use log::{info, warn, error, debug};

const UI_MONITORING_SCRIPT: &str = include_str!("ui_monitoring_macos.swift");

pub async fn run_ui() -> Result<()> {
    // Create a temporary file for the Swift script
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("ui_monitoring_macos.swift");
    debug!("writing swift script to: {}", script_path.display());
    std::fs::write(&script_path, UI_MONITORING_SCRIPT)?;

    loop {
        info!("starting ui monitoring...");
        debug!("running swift script from: {}", script_path.display());
        let mut child = TokioCommand::new("swift")
            .arg(script_path.to_str().unwrap())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;

        // Add debug log for process ID
        if let Some(pid) = child.id() {
            debug!("swift process started with pid: {}", pid);
        }

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        loop {
            select! {
                line = stdout_reader.next_line() => {
                    match line {
                        Ok(Some(line)) => debug!("ui monitoring: {}", line),
                        Ok(None) => debug!("ui monitoring: stdout closed"),
                        Err(e) => error!("ui monitoring: error reading stdout: {}", e),
                    }
                }
                line = stderr_reader.next_line() => {
                    match line {
                        Ok(Some(line)) => warn!("ui monitoring error: {}", line),
                        Ok(None) => debug!("ui monitoring: stderr closed"),
                        Err(e) => error!("ui monitoring: error reading stderr: {}", e),
                    }
                }
                status = child.wait() => {
                    match status {
                        Ok(status) => {
                            if !status.success() {
                                error!("ui monitoring crashed with status: {}, restarting in 1 second...", status);
                                sleep(Duration::from_secs(1)).await;
                                break;
                            } else {
                                debug!("ui monitoring exited successfully");
                                return Ok(());
                            }
                        }
                        Err(e) => {
                            error!("ui monitoring wait error: {}", e);
                            sleep(Duration::from_secs(1)).await;
                            break;
                        }
                    }
                }
            }
        }
    }
}