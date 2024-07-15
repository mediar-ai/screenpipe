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
}

impl ResourceMonitor {
    pub fn new(memory_threshold: f64, runtime_threshold_minutes: u64) -> Arc<Self> {
        Arc::new(Self {
            start_time: Instant::now(),
            memory_threshold,
            runtime_threshold: Duration::from_secs(runtime_threshold_minutes * 60),
        })
    }

    fn log_status(&self, sys: &System) {
        let pid = std::process::id();
        if let Some(process) = sys.process(sysinfo::Pid::from_u32(pid)) {
            let memory_usage = process.memory() as f64 / 1024.0; // Convert to KB
            let total_memory = sys.total_memory() as f64 / 1024.0; // Convert to KB
            let memory_usage_percent = (memory_usage / total_memory) * 100.0;
            let cpu_usage = process.cpu_usage();
            let runtime = self.start_time.elapsed();

            let log_message = if cfg!(target_os = "macos") {
                if let Some(npu_usage) = self.get_npu_usage() {
                    format!(
                        "Runtime: {:?}, Memory: {:.2}% ({:.2} KB / {:.2} KB), CPU: {:.2}%, NPU: {:.2}%",
                        runtime, memory_usage_percent, memory_usage, total_memory, cpu_usage, npu_usage
                    )
                } else {
                    format!(
                        "Runtime: {:?}, Memory: {:.2}% ({:.2} KB / {:.2} KB), CPU: {:.2}%, NPU: N/A",
                        runtime, memory_usage_percent, memory_usage, total_memory, cpu_usage
                    )
                }
            } else {
                format!(
                    "Runtime: {:?}, Memory: {:.2}% ({:.2} KB / {:.2} KB), CPU: {:.2}%",
                    runtime, memory_usage_percent, memory_usage, total_memory, cpu_usage
                )
            };

            info!("{}", log_message);

            // Check for restart conditions
            if memory_usage_percent > self.memory_threshold || runtime > self.runtime_threshold {
                warn!(
                    "Restarting due to: Memory usage: {:.2}%, Runtime: {:?}",
                    memory_usage_percent, runtime
                );
                self.restart();
            }
        }
    }

    fn restart(&self) {
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
        // TODO tokio
        thread::spawn(move || {
            let mut sys = System::new_all();
            loop {
                sys.refresh_all();
                monitor.log_status(&sys);
                thread::sleep(interval);
            }
        });
    }

    // TODO- only way would be to use metal crate (overkill for now :))
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

    // #[cfg(target_os = "macos")]
    // fn get_npu_usage(&self) -> Option<f32> {
    //     // ! HACK unfortunately requrie sudo so not usable ...
    //     let output = Command::new("powermetrics")
    //         .args(&[
    //             "-s",
    //             "cpu_power",
    //             "-i",
    //             "100",
    //             "-n",
    //             "1",
    //             "--format",
    //             "json",
    //         ])
    //         .output()
    //         .ok()?;

    //     println!("Output: {:?}", output);

    //     let json: Value = serde_json::from_slice(&output.stdout).ok()?;
    //     let ane_power = json["processor"]["ane_energy"].as_f64()?;

    //     // Convert energy to power (W) based on the interval (100ms)
    //     let ane_power_watts = ane_power / 0.1 / 1000.0;

    //     // Assuming max ANE power is 8.0W (adjust if needed)
    //     let max_ane_power = 8.0;
    //     let npu_usage_percent = (ane_power_watts / max_ane_power) * 100.0;

    //     Some(npu_usage_percent as f32)
    // }

    #[cfg(not(target_os = "macos"))]
    fn get_npu_usage(&self) -> Option<f32> {
        None
    }
}
