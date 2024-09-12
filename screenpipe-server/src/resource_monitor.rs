use chrono::Local;
use serde_json::json;
use serde_json::Value;
use std::env;
use std::fs::File;
use std::fs::OpenOptions;
use std::io::Read;
use std::io::Seek;
use std::io::SeekFrom;
use std::io::Write;
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use tracing::{error, info};

pub struct ResourceMonitor {
    start_time: Instant,
    resource_log_file: Option<String>, // analyse output here: https://colab.research.google.com/drive/1zELlGdzGdjChWKikSqZTHekm5XRxY-1r?usp=sharing
}

pub enum RestartSignal {
    RecordingTasks,
}

impl ResourceMonitor {
    pub fn new() -> Arc<Self> {
        let resource_log_file = if env::var("SAVE_RESOURCE_USAGE").is_ok() {
            let now = Local::now();
            let filename = format!("resource_usage_{}.json", now.format("%Y%m%d_%H%M%S"));
            info!("Resource usage data will be saved to file: {}", filename);

            // Initialize the file with an empty JSON array
            if let Ok(mut file) = File::create(&filename) {
                if let Err(e) = file.write_all(b"[]") {
                    error!("Failed to initialize JSON file: {}", e);
                }
            } else {
                error!("Failed to create JSON file: {}", filename);
            }

            Some(filename)
        } else {
            None
        };

        Arc::new(Self {
            start_time: Instant::now(),
            resource_log_file,
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

            if let Some(filename) = &self.resource_log_file {
                let now = Local::now();
                let json_data = json!({
                    "timestamp": now.to_rfc3339(),
                    "runtime_seconds": runtime.as_secs(),
                    "total_memory_gb": total_memory_gb,
                    "system_total_memory_gb": system_total_memory,
                    "memory_usage_percent": memory_usage_percent,
                    "total_cpu_percent": total_cpu,
                    "npu_usage_percent": self.get_npu_usage().unwrap_or(-1.0),
                });

                if let Ok(mut file) = OpenOptions::new().read(true).write(true).open(filename) {
                    let mut contents = String::new();
                    if file.read_to_string(&mut contents).is_ok() {
                        if let Ok(mut json_array) = serde_json::from_str::<Value>(&contents) {
                            if let Some(array) = json_array.as_array_mut() {
                                array.push(json_data);
                                if file.set_len(0).is_ok() && file.seek(SeekFrom::Start(0)).is_ok()
                                {
                                    if let Err(e) =
                                        file.write_all(json_array.to_string().as_bytes())
                                    {
                                        error!("Failed to write JSON data to file: {}", e);
                                    }
                                } else {
                                    error!("Failed to truncate and seek file: {}", filename);
                                }
                            }
                        } else {
                            error!("Failed to parse JSON from file: {}", filename);
                        }
                    } else {
                        error!("Failed to read JSON file: {}", filename);
                    }
                } else {
                    error!("Failed to open JSON file: {}", filename);
                }
            }
        }
    }

    pub fn start_monitoring(self: &Arc<Self>, interval: Duration) {
        let monitor = Arc::clone(self);
        tokio::spawn(async move {
            let mut sys = System::new_all();
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(interval) => {
                        sys.refresh_all();
                        monitor.log_status(&sys);
                    }
                }
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
