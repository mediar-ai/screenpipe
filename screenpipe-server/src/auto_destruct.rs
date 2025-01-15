use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{CloseHandle, HANDLE, STILL_ACTIVE};
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{
    CreateJobObjectW, AssignProcessToJobObject, GetExitCodeProcess, OpenProcess, TerminateProcess,
    PROCESS_QUERY_INFORMATION, PROCESS_TERMINATE, PROCESS_ALL_ACCESS,
};
use tracing::{debug, error, info, warn};
use std::io::Error as IoError;
use thiserror::Error;

#[cfg(target_os = "windows")]
#[derive(Error, Debug)]
pub enum ProcessError {
    #[error("Failed to open process: {0}")]
    OpenProcess(IoError),
    #[error("Failed to terminate process: {0}")]
    TerminateProcess(IoError),
    #[error("Process became unresponsive")]
    Unresponsive,
    #[error("Port is still in use")]
    PortInUse,
    #[error("Failed to kill port: {0}")]
    KillPort(String),
}

#[cfg(target_os = "windows")]
#[derive(Debug)]
pub struct ProcessStatus {
    pub terminated: bool,
    pub exit_code: Option<u32>,
    pub port_released: bool,
}

#[cfg(target_os = "windows")]
pub struct ProcessManager {
    pid: u32,
    port: u16,
    job_handle: HANDLE,
}

#[cfg(target_os = "windows")]
impl ProcessManager {
    pub fn new(pid: u32, port: u16) -> windows::core::Result<Self> {
        unsafe {
            let job_handle = CreateJobObjectW(None, None)?;
            let process_handle = OpenProcess(PROCESS_ALL_ACCESS, false, pid)?;
            AssignProcessToJobObject(job_handle, process_handle)?;
            CloseHandle(process_handle).expect("Failed to close process handle");
            Ok(Self {
                pid,
                port,
                job_handle,
            })
        }
    }

    fn is_process_alive(&self) -> Result<bool, ProcessError> {
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_TERMINATE, false, self.pid)
                .map_err(|e| ProcessError::OpenProcess(IoError::from_raw_os_error(e.code().0)))?;
            
            if process.is_invalid() {
                return Ok(false);
            }

            let mut exit_code: u32 = 0;
            GetExitCodeProcess(process, &mut exit_code).map_err(|_| ProcessError::Unresponsive)?;
            CloseHandle(process).expect("Failed to close process handle");

            Ok(exit_code == STILL_ACTIVE.0 as u32)
        }
    }

    fn get_port_pids(&self) -> Vec<u32> {
        let netstat_output = Command::new("netstat")
            .args(&["-ano"])
            .output()
            .expect("failed to execute netstat");

        let output = String::from_utf8_lossy(&netstat_output.stdout);
        let mut pids = Vec::new();

        for line in output.lines() {
            if line.contains(&format!(":{}", self.port)) {
                if let Some(pid_str) = line.split_whitespace().last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        pids.push(pid);
                    }
                }
            }
        }
        pids
    }

    fn kill_port_forcefully(&self) -> Result<(), ProcessError> {
        // First try using killport crate
        if let Err(e) = killport::kill(self.port as u16) {
            warn!("killport failed: {:?}, trying alternative methods", e);
        }

        // Then try killing all processes using the port
        for pid in self.get_port_pids() {
            unsafe {
                if let Ok(process) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                    let _ = TerminateProcess(process, 1);
                    CloseHandle(process).expect("Failed to close process handle");
                }
            }
        }

        // Verify port is released
        if self.is_port_in_use() {
            Err(ProcessError::KillPort(format!("Failed to release port {}", self.port)))
        } else {
            Ok(())
        }
    }

    fn is_port_in_use(&self) -> bool {
        let netstat_output = Command::new("netstat")
            .args(&["-ano"])
            .output()
            .expect("failed to execute netstat");

        let output = String::from_utf8_lossy(&netstat_output.stdout);
        output.contains(&format!(":{}", self.port))
    }

    async fn try_graceful_shutdown(&self) -> Result<(), ProcessError> {
        for _ in 0..3 {
            if !self.is_process_alive()? {
                // Even if process is dead, ensure port is released
                if !self.is_port_in_use() {
                    return Ok(());
                }
            }
            sleep(Duration::from_secs(1)).await;
        }
        Err(ProcessError::Unresponsive)
    }

    pub async fn force_terminate(&self) -> Result<(), ProcessError> {
        // First try normal process termination
        unsafe {
            let process = OpenProcess(PROCESS_TERMINATE, false, self.pid)
                .map_err(|e| ProcessError::OpenProcess(IoError::from_raw_os_error(e.code().0)))?;

            if !process.is_invalid() {
                TerminateProcess(process, 1)
                    .map_err(|e| ProcessError::TerminateProcess(IoError::from_raw_os_error(e.code().0)))?;
                CloseHandle(process).expect("Failed to close process handle");
            }
        }

        // Then ensure port is released
        if self.is_port_in_use() {
            self.kill_port_forcefully()?;
        }

        Ok(())
    }

    pub async fn watch_and_cleanup(&self) -> Result<ProcessStatus, ProcessError> {
        info!("starting enhanced process monitoring (pid: {}, port: {})", self.pid, self.port);
        
        let mut consecutive_fails = 0;
        let max_fails = 3;

        loop {
            match self.is_process_alive() {
                Ok(false) => {
                    debug!("Process ({}) not found via Windows API", self.pid);
                    break;
                }
                Ok(true) => {
                    consecutive_fails = 0;
                }
                Err(e) => {
                    consecutive_fails += 1;
                    error!("Error checking process status: {:?}", e);
                    if consecutive_fails >= max_fails {
                        return Err(ProcessError::Unresponsive);
                    }
                }
            }

            sleep(Duration::from_secs(1)).await;
        }

        // Try graceful shutdown first
        if let Err(e) = self.try_graceful_shutdown().await {
            warn!("Graceful shutdown failed: {:?}, attempting force terminate", e);
            self.force_terminate().await?;
        }

        // If port is still in use after process termination, force kill it
        if self.is_port_in_use() {
            warn!("Port {} still in use after process termination, force killing", self.port);
            self.kill_port_forcefully()?;
        }

        let mut port_released = false;
        for _ in 0..5 {
            if !self.is_port_in_use() {
                port_released = true;
                break;
            }
            sleep(Duration::from_secs(1)).await;
        }

        if !port_released {
            return Err(ProcessError::PortInUse);
        }

        Ok(ProcessStatus {
            terminated: true,
            exit_code: None,
            port_released,
        })
    }
}

#[cfg(target_os = "windows")]
impl Drop for ProcessManager {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.job_handle).expect("Failed to close job handle");
        }
    }
}

#[cfg(target_os = "windows")]
pub async fn watch_pid(pid: u32) -> bool {
    let port = 3030;
    match ProcessManager::new(pid, port) {
        Ok(manager) => {
            match manager.watch_and_cleanup().await {
                Ok(status) => {
                    info!(
                        "Process terminated successfully. Port released: {}",
                        status.port_released
                    );
                    true
                }
                Err(e) => {
                    error!("Failed to manage process: {:?}", e);
                    false
                }
            }
        }
        Err(e) => {
            error!("Failed to create process manager: {:?}", e);
            false
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn watch_pid(pid: u32) -> bool {
    info!("starting to watch for app termination (pid: {})", pid);

    loop {
        let output = Command::new("ps")
            .args(&["-p", &pid.to_string()])
            .output()
            .expect("failed to execute process check command");

        if !output.status.success() || output.stdout.is_empty() {
            return true;
        }

        sleep(Duration::from_secs(1)).await;
    }
}
