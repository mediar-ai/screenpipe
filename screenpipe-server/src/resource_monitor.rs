use log::{error, info, warn};
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};

pub struct ResourceMonitor {
    start_time: Instant,
    memory_threshold: f64,
    runtime_threshold: Duration,
    restart_enabled: bool,
}

impl ResourceMonitor {
    pub fn new(
        memory_threshold: f64,
        runtime_threshold_minutes: u64,
        restart_enabled: bool,
    ) -> Arc<Self> {
        Arc::new(Self {
            start_time: Instant::now(),
            memory_threshold,
            runtime_threshold: Duration::from_secs(runtime_threshold_minutes * 60),
            restart_enabled,
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

            let total_memory_kb = total_memory / 1024.0;
            let system_total_memory = sys.total_memory() as f64 / 1024.0;
            let memory_usage_percent = (total_memory_kb / system_total_memory) * 100.0;
            let runtime = self.start_time.elapsed();

            let log_message = if cfg!(target_os = "macos") {
                if let Some(npu_usage) = self.get_npu_usage() {
                    format!(
                        "Runtime: {:?}, Total Memory: {:.2}% ({:.2} KB / {:.2} KB), Total CPU: {:.2}%, NPU: {:.2}%",
                        runtime, memory_usage_percent * 100.0, total_memory_kb, system_total_memory, total_cpu, npu_usage
                    )
                } else {
                    format!(
                        "Runtime: {:?}, Total Memory: {:.2}% ({:.2} KB / {:.2} KB), Total CPU: {:.2}%, NPU: N/A",
                        runtime, memory_usage_percent * 100.0, total_memory_kb, system_total_memory, total_cpu
                    )
                }
            } else {
                format!(
                    "Runtime: {:?}, Total Memory: {:.2}% ({:.2} KB / {:.2} KB), Total CPU: {:.2}%",
                    runtime,
                    memory_usage_percent * 100.0,
                    total_memory_kb,
                    system_total_memory,
                    total_cpu
                )
            };

            info!("{}", log_message);

            // Check for restart conditions only if restart is enabled
            if self.restart_enabled
                && (memory_usage_percent > self.memory_threshold
                    || runtime > self.runtime_threshold)
            {
                warn!(
                    "Restarting due to: Memory usage: {:.2}%, Runtime: {:?}",
                    memory_usage_percent * 100.0,
                    runtime
                );
                self.restart();
            } else if memory_usage_percent > self.memory_threshold
                || runtime > self.runtime_threshold
            {
                warn!(
                    "Resource threshold exceeded: Memory usage: {:.2}%, Runtime: {:?}",
                    memory_usage_percent * 100.0,
                    runtime
                );
            }
        }
    }

    fn restart(&self) {
        if !self.restart_enabled {
            warn!("Restart requested but restart feature is disabled.");
            return;
        }
        warn!("Initiating restart due to resource thresholds...");

        let args: Vec<String> = std::env::args().collect();

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            let mut cmd = Command::new(&args[0]);
            cmd.args(&args[1..]);
            let err = cmd.exec();
            error!("Failed to restart application: {}", err);
            std::process::exit(1);
        }

        #[cfg(not(unix))]
        {
            // For non-Unix systems, we'll use a less seamless but still functional approach
            match Command::new(&args[0]).args(&args[1..]).spawn() {
                Ok(_) => {
                    info!("Application restarted successfully");
                    std::process::exit(0);
                }
                Err(e) => {
                    error!("Failed to restart application: {}", e);
                    std::process::exit(1);
                }
            }
        }
    }

    pub fn start_monitoring(self: &Arc<Self>, interval: Duration) {
        let monitor = Arc::clone(self);
        thread::spawn(move || {
            let mut sys = System::new_all();
            loop {
                sys.refresh_all();
                monitor.log_status(&sys);
                thread::sleep(interval);
            }
        });
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
