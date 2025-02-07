use chrono::Local;
use reqwest::Client;
use serde_json::json;
use serde_json::Value;
use std::env;
use std::fs::File;
use std::fs::OpenOptions;
use std::io::Read;
use std::io::Seek;
use std::io::SeekFrom;
use std::io::Write;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use tracing::{error, info, warn};
use uuid;

pub struct ResourceMonitor {
    start_time: Instant,
    resource_log_file: Option<String>, // analyse output here: https://colab.research.google.com/drive/1zELlGdzGdjChWKikSqZTHekm5XRxY-1r?usp=sharing
    posthog_client: Option<Client>,
    posthog_enabled: bool,
    distinct_id: String,
}

pub enum RestartSignal {
    RecordingTasks,
}

impl ResourceMonitor {
    pub fn new(telemetry_enabled: bool) -> Arc<Self> {
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

        // Create client once and reuse instead of Option
        let posthog_client = telemetry_enabled.then(Client::new);

        // Generate a unique ID for this installation
        let distinct_id = uuid::Uuid::new_v4().to_string();

        Arc::new(Self {
            start_time: Instant::now(),
            resource_log_file,
            posthog_client,
            posthog_enabled: telemetry_enabled,
            distinct_id,
        })
    }

    async fn send_to_posthog(
        &self,
        total_memory_gb: f64,
        system_total_memory: f64,
        total_cpu: f32,
    ) {
        let Some(client) = &self.posthog_client else {
            return;
        };

        // Create System only when needed
        let sys = System::new();

        // Avoid unnecessary cloning by using references
        let payload = json!({
            "api_key": "phc_6TUWxXM2NQGPuLhkwgRHxPfXMWqhGGpXqWNIw0GRpMD",
            "event": "resource_usage",
            "properties": {
                "distinct_id": &self.distinct_id,
                "$lib": "rust-reqwest",
                "total_memory_gb": total_memory_gb,
                "system_total_memory_gb": system_total_memory,
                "memory_usage_percent": (total_memory_gb / system_total_memory) * 100.0,
                "total_cpu_percent": total_cpu,
                "runtime_seconds": self.start_time.elapsed().as_secs(),
                "os_name": sys.name().unwrap_or_default(),
                "os_version": sys.os_version().unwrap_or_default(),
                "kernel_version": sys.kernel_version().unwrap_or_default(),
                "cpu_count": sys.cpus().len(),
                "release": env!("CARGO_PKG_VERSION"),
            }
        });

        // Send the event to PostHog
        if let Err(e) = client
            .post("https://eu.i.posthog.com/capture/")
            .json(&payload)
            .send()
            .await
        {
            error!("Failed to send resource usage to PostHog: {}", e);
        }
    }

    async fn log_status(&self, sys: &System) {
        let pid = std::process::id();
        let main_process = match sys.process(sysinfo::Pid::from_u32(pid)) {
            Some(p) => p,
            None => {
                warn!("Could not find main process");
                return;
            }
        };

        let mut total_memory = 0.0;
        let mut total_cpu = 0.0;

        total_memory += main_process.memory() as f64;
        total_cpu += main_process.cpu_usage();

        // Iterate through all processes to find children
        for child_process in sys.processes().values() {
            if child_process.parent() == Some(sysinfo::Pid::from_u32(pid)) {
                total_memory += child_process.memory() as f64;
                total_cpu += child_process.cpu_usage();
            }
        }

        let total_memory_gb = total_memory / 1048576000.0;
        let system_total_memory = sys.total_memory() as f64 / 1048576000.0;
        let memory_usage_percent = (total_memory_gb / system_total_memory) * 100.0;
        let runtime = self.start_time.elapsed();

        let log_message = format!(
            "Runtime: {}s, Total Memory: {:.0}% ({:.2} GB / {:.2} GB), Total CPU: {:.0}%",
            runtime.as_secs(),
            memory_usage_percent,
            total_memory_gb,
            system_total_memory,
            total_cpu
        );

        info!("{}", log_message);

        if let Some(ref filename) = self.resource_log_file {
            let file = OpenOptions::new()
                .read(true)
                .write(true)
                .open(filename)
                .map_err(|e| {
                    error!("Failed to open resource log file: {}", e);
                    e
                });

            if let Ok(mut file) = file {
                let json_data = json!({
                    "timestamp": Local::now().to_rfc3339(),
                    "runtime_seconds": runtime.as_secs(),
                    "total_memory_gb": total_memory_gb,
                    "system_total_memory_gb": system_total_memory,
                    "memory_usage_percent": memory_usage_percent,
                    "total_cpu_percent": total_cpu,
                });

                // Create string buffer first
                let mut contents = String::new();
                file.read_to_string(&mut contents).unwrap_or_default();
                if let Ok(mut json_array) = serde_json::from_str::<Value>(&contents) {
                    if let Some(array) = json_array.as_array_mut() {
                        array.push(json_data);
                        if file.set_len(0).is_ok() && file.seek(SeekFrom::Start(0)).is_ok() {
                            if let Err(e) = file.write_all(json_array.to_string().as_bytes()) {
                                error!("Failed to write JSON data to file: {}", e);
                            }
                        } else {
                            error!("Failed to truncate and seek file: {}", filename);
                        }
                    }
                } else {
                    error!("Failed to parse JSON from file: {}", filename);
                }

                let _ = file.flush();
            }
        }

        if self.posthog_enabled {
            tokio::select! {
                _ = self.send_to_posthog(total_memory_gb, system_total_memory, total_cpu) => {},
                _ = tokio::time::sleep(Duration::from_secs(5)) => {
                    warn!("PostHog request timed out");
                }
            }
        }
    }

    pub fn start_monitoring(self: &Arc<Self>, interval: Duration) {
        // Clone the Arc since we need to move it into the spawned task
        let monitor = Arc::clone(self);

        tokio::spawn(async move {
            let mut sys = System::new_all();

            loop {
                tokio::select! {
                    _ = tokio::time::sleep(interval) => {
                        sys.refresh_all();
                        monitor.log_status(&sys).await;
                    }
                }
            }
        });
    }

    pub async fn shutdown(&self) {
        if let Some(ref file) = self.resource_log_file {
            if let Ok(mut f) = OpenOptions::new().write(true).open(file) {
                let _ = f.flush();
            }
        }

        if let Some(_) = &self.posthog_client {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
}
