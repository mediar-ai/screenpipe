use log::{error, info, warn};
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use tokio::sync::mpsc::Sender;
use tokio::sync::Mutex;

pub struct ResourceMonitor {
    start_time: Instant,
    self_healing_enabled: bool,
    health_check_interval: Duration,
    health_check_failures: Mutex<u32>,
    max_health_check_failures: u32,
    restart_sender: Sender<RestartSignal>,
}

pub enum RestartSignal {
    RecordingTasks,
}

impl ResourceMonitor {
    pub fn new(
        self_healing_enabled: bool,
        health_check_interval: Duration,
        max_health_check_failures: u32,
        restart_sender: Sender<RestartSignal>,
    ) -> Arc<Self> {
        Arc::new(Self {
            start_time: Instant::now(),
            self_healing_enabled,
            health_check_interval,
            health_check_failures: Mutex::new(0),
            max_health_check_failures,
            restart_sender,
        })
    }

    fn log_status(&self, sys: &System) {
        let pid = std::process::id();
        let main_process = sys.process(sysinfo::Pid::from_u32(pid));

        let mut total_memory = 0.0;
        let mut total_cpu = 0.0;

        if let Some(process) = main_process {
            total_memory += process.memory() as f64;
            total_cpu += process.cpu_usage();

            // Iterate through all processes to find children
            for (_child_pid, child_process) in sys.processes() {
                if child_process.parent() == Some(sysinfo::Pid::from_u32(pid)) {
                    total_memory += child_process.memory() as f64;
                    total_cpu += child_process.cpu_usage();
                }
            }

            let total_memory_gb = total_memory / 1048576000.0;
            let system_total_memory = sys.total_memory() as f64 / 1048576000.0;
            let memory_usage_percent = (total_memory_gb / system_total_memory) * 100.0;
            let runtime = self.start_time.elapsed();

            let log_message = if cfg!(target_os = "macos") {
                if let Some(npu_usage) = self.get_npu_usage() {
                    format!(
                        "Runtime: {}s, Total Memory: {:.0}% ({:.0} GB / {:.0} GB), Total CPU: {:.0}%, NPU: {:.0}%",
                        runtime.as_secs(), memory_usage_percent, total_memory_gb, system_total_memory, total_cpu, npu_usage
                    )
                } else {
                    format!(
                        "Runtime: {}s, Total Memory: {:.0}% ({:.0} GB / {:.0} GB), Total CPU: {:.0}%, NPU: N/A",
                        runtime.as_secs(), memory_usage_percent, total_memory_gb, system_total_memory, total_cpu
                    )
                }
            } else {
                format!(
                    "Runtime: {}s, Total Memory: {:.0}% ({:.2} GB / {:.2} GB), Total CPU: {:.0}%",
                    runtime.as_secs(),
                    memory_usage_percent,
                    total_memory_gb,
                    system_total_memory,
                    total_cpu
                )
            };

            info!("{}", log_message);
        }
    }

    pub fn start_monitoring(self: &Arc<Self>, interval: Duration) {
        let monitor = Arc::clone(self);
        tokio::spawn(async move {
            let mut sys = System::new_all();
            let mut health_check_interval = tokio::time::interval(monitor.health_check_interval);
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(interval) => {
                        sys.refresh_all();
                        monitor.log_status(&sys);
                    }
                    _ = health_check_interval.tick() => {
                        monitor.check_health().await;
                    }
                }
            }
        });
    }
    async fn check_health(&self) {
        let client = reqwest::Client::new();
        match client.get("http://localhost:3030/health").send().await {
            Ok(response) => {
                if response.status().is_success() {
                    *self.health_check_failures.lock().await = 0;
                } else {
                    self.handle_health_check_failure().await;
                }
            }
            Err(_) => {
                self.handle_health_check_failure().await;
            }
        }
    }

    async fn handle_health_check_failure(&self) {
        let mut failures = self.health_check_failures.lock().await;
        *failures += 1;
        warn!("Health check failed. Consecutive failures: {}", *failures);

        if !self.self_healing_enabled {
            return;
        }

        if *failures >= self.max_health_check_failures {
            warn!("Max health check failures reached. Restarting recording tasks...");
            if let Err(e) = self
                .restart_sender
                .send(RestartSignal::RecordingTasks)
                .await
            {
                error!("Failed to send restart signal: {}", e);
            }
            *self.health_check_failures.lock().await = 0;
        }
    }

    #[cfg(target_os = "macos")]
    fn get_npu_usage(&self) -> Option<f32> {
        let output = Command::new("ioreg")
            .args(&["-r", "-c", "AppleARMIODevice", "-n", "ane0"])
            .output()
            .ok()?;

        let output_str = String::from_utf8_lossy(&output.stdout);

        // Parse the output to find the "ane_power" value
        for line in output_str.lines() {
            if line.contains("\"ane_power\"") {
                if let Some(value) = line.split('=').nth(1) {
                    if let Ok(power) = value.trim().parse::<f32>() {
                        // Assuming max ANE power is 8.0W (adjust if needed)
                        let max_ane_power = 8.0;
                        let npu_usage_percent = (power / max_ane_power) * 100.0;
                        return Some(npu_usage_percent);
                    }
                }
            }
        }

        None
    }

    #[cfg(not(target_os = "macos"))]
    fn get_npu_usage(&self) -> Option<f32> {
        None
    }
}
