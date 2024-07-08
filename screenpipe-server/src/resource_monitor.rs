use log::{error, info, warn};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};

pub struct ResourceMonitor {
    open_files: AtomicUsize,
    active_threads: AtomicUsize,
    start_time: Instant,
    memory_threshold: f64,
    runtime_threshold: Duration,
}

impl ResourceMonitor {
    pub fn new(memory_threshold: f64, runtime_threshold_minutes: u64) -> Arc<Self> {
        Arc::new(Self {
            open_files: AtomicUsize::new(0),
            active_threads: AtomicUsize::new(0),
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

            info!(
                "Runtime: {:?}, Memory: {:.2}% ({:.2} KB / {:.2} KB), CPU: {:.2}%",
                runtime,
                memory_usage_percent,
                memory_usage,
                total_memory,
                cpu_usage,
                // self.open_files.load(Ordering::SeqCst),
                // self.active_threads.load(Ordering::SeqCst)
            );

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
        thread::spawn(move || {
            let mut sys = System::new_all();
            loop {
                sys.refresh_all();
                monitor.log_status(&sys);
                thread::sleep(interval);
            }
        });
    }
}
