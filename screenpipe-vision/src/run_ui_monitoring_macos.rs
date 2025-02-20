use crate::core::RealtimeVisionEvent;
use crate::UIFrame;
use anyhow::Result;
use log::{debug, error, info, warn};
use screenpipe_events::send_event;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;
use tokio::signal;
use tokio::time::{sleep, timeout, Duration};
use which::which;

pub async fn run_ui() -> Result<()> {
    info!("starting ui monitoring service...");

    let binary_name = "ui_monitor";

    // Try screenpipe-vision/bin first
    let bin_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(binary_name);

    // If not found, try current directory
    let current_dir_path = std::env::current_dir()?.join(binary_name);

    // Try the directory of the current executable
    let exe_dir_path = std::env::current_exe()?
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(binary_name);

    // Try using which
    let which_path = which(binary_name).ok();

    // If not found, try tauri location
    let ui_monitor_path = if bin_path.exists() {
        bin_path
    } else if current_dir_path.exists() {
        current_dir_path
    } else if exe_dir_path.exists() {
        exe_dir_path
    } else if let Some(path) = which_path {
        path
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("screenpipe-app-tauri")
            .join("src-tauri")
            .join(binary_name)
    };

    info!("ui_monitor path: {}", ui_monitor_path.display());

    let named_pipe = setup_ipc_queue().await?;

    let named_pipe_clone = named_pipe.clone();
    let is_running = Arc::new(AtomicBool::new(true));
    let is_running_clone = is_running.clone();
    let (is_running_sender, mut is_running_receiver) = tokio::sync::broadcast::channel(1);
    tokio::spawn(async move {
        let mut terminate_signal =
            signal::unix::signal(signal::unix::SignalKind::terminate()).unwrap();
        tokio::select! {
            _ = signal::ctrl_c() => {
                debug!("ctrl-c received");
            }
            _ = terminate_signal.recv() => {
                debug!("terminate signal received");
            }
        }

        if fs::metadata(&named_pipe_clone.path).is_ok() {
            if let Err(e) = fs::remove_file(&named_pipe_clone.path) {
                eprintln!("Failed to remove named pipe: {:?}", e);
            }
        }
        is_running_clone.store(false, std::sync::atomic::Ordering::Relaxed);
        let _ = is_running_sender.send(false);
    });

    let named_pipe_clone = named_pipe.clone();
    tokio::spawn(async move {
        // add loop and timeout for opening the file
        let mut file: Option<File> = None;
        let mut attempts = 0;

        while attempts < 10 {
            match timeout(Duration::from_secs(5), named_pipe_clone.open()).await {
                Ok(Ok(opened_file)) => {
                    // Successfully opened the file
                    file = Some(opened_file);
                    break;
                }
                Ok(Err(e)) => {
                    error!("failed to open named pipe: {}", e);
                    attempts += 1;
                    sleep(Duration::from_secs(1)).await;
                }
                Err(_) => {
                    error!("timeout while trying to open named pipe");
                    attempts += 1;
                    sleep(Duration::from_secs(1)).await;
                }
            }
        }

        let file = match file {
            Some(f) => f,
            None => {
                return Err(anyhow::anyhow!(
                    "failed to open named pipe after multiple attempts"
                ))
            }
        };

        let mut reader = BufReader::new(file);

        loop {
            tokio::select! {
                _ = is_running_receiver.recv() => {
                    info!("ui_monitor is shutting down");
                    return Ok(());
                }
                frame = UIFrame::read_from_pipe(&mut reader) => {
                    match frame {
                        Ok(frame) => {
                            let _ = send_event("ui_frame", RealtimeVisionEvent::Ui(frame));
                        }
                        Err(e) => {
                            if let Some(io_err) = e.downcast_ref::<io::Error>() {
                                if io_err.kind() == io::ErrorKind::WouldBlock {
                                    // Resource temporarily unavailable, retry after a short delay
                                    tokio::time::sleep(Duration::from_millis(100)).await;
                                } else {
                                    error!("failed to read line from ui_monitor: {}", e);
                                }
                            } else {
                                error!("failed to read line from ui_monitor: {}", e);
                            }
                        }
                    }
                }
            }
        }
    });

    let named_pipe_clone = named_pipe.clone();

    while is_running.load(std::sync::atomic::Ordering::Relaxed) {
        // Clone the PathBuf for each iteration
        let mut child = Command::new(&ui_monitor_path)
            .arg(named_pipe_clone.path.clone())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("failed to start ui_monitor");

        info!("ui_monitor process started");

        // Handle stdout
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            // Spawn a task to read lines asynchronously
            tokio::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    if line.to_lowercase().contains("error") {
                        error!("ui_monitor stdout: {}", line);
                    } else {
                        debug!("ui_monitor stdout: {}", line);
                    }
                }
            });
        }

        // Handle stderr
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            tokio::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    error!("ui_monitor stderr: {}", line);
                }
            });
        }

        // Wait for the process to exit
        match child.wait().await {
            Ok(status) => {
                warn!("ui_monitor exited with status: {}", status);
                warn!("restarting ui_monitor in 5 seconds...");
                sleep(Duration::from_secs(5)).await;
            }
            Err(e) => {
                error!("failed to wait for ui_monitor process: {}", e);
                warn!("retrying ui_monitor in 5 seconds...");
                sleep(Duration::from_secs(5)).await;
            }
        }
    }

    Ok(())
}

async fn setup_ipc_queue() -> Result<NamedPipe> {
    // create random /dev/shm/screenpipe-ipc-queue-<random-string>
    // read 16 bytes from /dev/urandom
    let mut random_bytes = [0u8; 16];
    let mut file = File::open("/dev/urandom").await?;
    file.read_exact(&mut random_bytes).await?;
    let mut path: String = String::from("/tmp/screenpipe-ui-ipc-queue-");
    for byte in random_bytes {
        path.push_str(&format!("{:02x}", byte));
    }

    NamedPipe::new(path).await
}

#[derive(Debug, Clone)]
struct NamedPipe {
    pub path: String,
}

impl NamedPipe {
    async fn new(path: String) -> Result<Self> {
        // Create the named pipe
        let c_path = std::ffi::CString::new(path.clone()).expect("CString::new failed");
        let result = unsafe { libc::mkfifo(c_path.as_ptr(), libc::S_IRUSR | libc::S_IWUSR) };
        if result != 0 {
            panic!(
                "Failed to create named pipe: {:?}",
                std::io::Error::last_os_error()
            );
        }

        Ok(NamedPipe { path })
    }

    async fn open(&self) -> Result<File> {
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NONBLOCK) // Open in non-blocking mode
            .open(self.path.clone())
            .await?;

        Ok(file)
    }
}
