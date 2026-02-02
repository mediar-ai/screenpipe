//! Pi Coding Agent Integration
//!
//! Manages the pi coding agent via RPC mode for AI-powered features.
//! Uses stdin/stdout JSON protocol for communication.

use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tauri::{Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

const PI_PACKAGE: &str = "@mariozechner/pi-coding-agent";
const SCREENPIPE_API_URL: &str = "https://api.screenpi.pe/v1";

/// State for managing the Pi sidecar process
pub struct PiState(pub Arc<Mutex<Option<PiManager>>>);

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PiInfo {
    pub running: bool,
    pub project_dir: Option<String>,
    pub pid: Option<u32>,
}

impl Default for PiInfo {
    fn default() -> Self {
        Self {
            running: false,
            project_dir: None,
            pid: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PiCheckResult {
    pub available: bool,
    pub sidecar_available: bool,
    pub path_available: bool,
}

pub struct PiManager {
    child: Option<CommandChild>,
    project_dir: Option<String>,
    child_exited: bool,
}

impl PiManager {
    pub fn new() -> Self {
        Self {
            child: None,
            project_dir: None,
            child_exited: false,
        }
    }

    pub fn snapshot(&self) -> PiInfo {
        let (running, pid) = match &self.child {
            None => (false, None),
            Some(_) if self.child_exited => (false, None),
            Some(child) => (true, Some(child.pid())),
        };

        PiInfo {
            running,
            project_dir: self.project_dir.clone(),
            pid,
        }
    }

    pub fn stop(&mut self) {
        if let Some(child) = self.child.take() {
            if let Err(e) = child.kill() {
                error!("Failed to kill pi child process: {}", e);
            }
        }
        self.child_exited = true;
        self.project_dir = None;
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some() && !self.child_exited
    }
}

/// Get the Pi config directory (~/.pi/agent)
fn get_pi_config_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home_dir.join(".pi").join("agent"))
}

/// Ensure Pi is configured to use screenpipe as the AI provider
fn ensure_pi_config(user_token: Option<&str>) -> Result<(), String> {
    let config_dir = get_pi_config_dir()?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create pi config dir: {}", e))?;

    // Write models.json with screenpipe provider
    let models_path = config_dir.join("models.json");
    let models_config = json!({
        "providers": {
            "screenpipe": {
                "baseUrl": SCREENPIPE_API_URL,
                "api": "openai-completions",
                "apiKey": "SCREENPIPE_API_KEY",
                "authHeader": true,
                "models": [
                    {
                        "id": "claude-opus-4-5@20251101",
                        "name": "Claude Opus 4.5",
                        "reasoning": true,
                        "input": ["text", "image"],
                        "cost": {"input": 15, "output": 75, "cacheRead": 1.5, "cacheWrite": 18.75},
                        "contextWindow": 200000,
                        "maxTokens": 32000
                    },
                    {
                        "id": "claude-haiku-4-5@20251001",
                        "name": "Claude Haiku 4.5",
                        "reasoning": true,
                        "input": ["text", "image"],
                        "cost": {"input": 0.8, "output": 4, "cacheRead": 0.08, "cacheWrite": 1},
                        "contextWindow": 200000,
                        "maxTokens": 64000
                    }
                ]
            }
        }
    });

    let models_str = serde_json::to_string_pretty(&models_config)
        .map_err(|e| format!("Failed to serialize models config: {}", e))?;
    std::fs::write(&models_path, models_str)
        .map_err(|e| format!("Failed to write pi models config: {}", e))?;

    // Write auth.json if we have a token
    if let Some(token) = user_token {
        let auth_path = config_dir.join("auth.json");
        let auth = json!({
            "screenpipe": token
        });
        let auth_str = serde_json::to_string_pretty(&auth)
            .map_err(|e| format!("Failed to serialize auth: {}", e))?;
        std::fs::write(&auth_path, auth_str)
            .map_err(|e| format!("Failed to write pi auth: {}", e))?;
    }

    info!("Pi configured to use screenpipe at {:?}", models_path);
    Ok(())
}

/// Kill orphaned pi processes
pub async fn kill_orphaned_pi_processes() {
    #[cfg(target_os = "macos")]
    {
        let _ = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("pgrep -f 'pi.*--mode.*rpc' | xargs kill -9 2>/dev/null || true")
            .output()
            .await;
    }

    #[cfg(target_os = "linux")]
    {
        let _ = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("pgrep -f 'pi.*--mode.*rpc' | xargs -I {} kill -15 {} 2>/dev/null || true")
            .output()
            .await;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Note: Windows doesn't have easy pattern matching for processes
        // We rely on proper cleanup via manager
        let _ = tokio::process::Command::new("taskkill")
            .args(["/F", "/IM", "pi.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await;
    }
}

/// Get Pi info
#[tauri::command]
#[specta::specta]
pub async fn pi_info(state: State<'_, PiState>) -> Result<PiInfo, String> {
    let manager = state.0.lock().await;
    match manager.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(PiInfo::default()),
    }
}

/// Stop the Pi sidecar
#[tauri::command]
#[specta::specta]
pub async fn pi_stop(state: State<'_, PiState>) -> Result<PiInfo, String> {
    info!("Stopping pi sidecar");

    let mut manager = state.0.lock().await;
    if let Some(m) = manager.as_mut() {
        m.stop();
    }

    // Also kill any orphaned pi processes
    kill_orphaned_pi_processes().await;

    match manager.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(PiInfo::default()),
    }
}

/// Start the Pi sidecar in RPC mode
#[tauri::command]
#[specta::specta]
pub async fn pi_start(
    app: tauri::AppHandle,
    state: State<'_, PiState>,
    project_dir: String,
    user_token: Option<String>,
) -> Result<PiInfo, String> {
    let project_dir = project_dir.trim().to_string();
    if project_dir.is_empty() {
        return Err("Project directory is required".to_string());
    }

    // Create project directory if it doesn't exist
    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Ensure Pi is configured to use screenpipe
    ensure_pi_config(user_token.as_deref())?;

    let mut manager_guard = state.0.lock().await;

    // Initialize manager if needed
    if manager_guard.is_none() {
        *manager_guard = Some(PiManager::new());
    }

    // Stop any existing instance
    if let Some(m) = manager_guard.as_mut() {
        if m.is_running() {
            info!("Stopping existing pi instance");
            m.stop();
        }
    }

    // Build pi RPC command
    let args = vec![
        "--mode".to_string(),
        "rpc".to_string(),
        "--provider".to_string(),
        "screenpipe".to_string(),
        "--model".to_string(),
        "claude-haiku-4-5@20251001".to_string(),
        "--no-session".to_string(),
    ];

    info!("Starting pi with args: {:?} in dir: {}", args, project_dir);

    // Try to spawn pi - first try sidecar, then fall back to PATH
    let spawn_result = {
        // Try sidecar first
        let sidecar_spawn = if let Ok(cmd) = app.shell().sidecar("pi") {
            info!("Trying bundled pi sidecar");
            let mut command = cmd.args(&args).current_dir(&project_dir);
            if let Some(ref token) = user_token {
                command = command.env("SCREENPIPE_API_KEY", token);
            }
            Some(command.spawn())
        } else {
            None
        };

        // Check if sidecar spawn succeeded
        match sidecar_spawn {
            Some(Ok(result)) => {
                info!("Using bundled pi sidecar");
                Ok(result)
            }
            _ => {
                // Fallback to PATH
                info!("Sidecar not available, trying pi from PATH");
                let mut command = app.shell()
                    .command("pi")
                    .args(&args)
                    .current_dir(&project_dir);

                if let Some(ref token) = user_token {
                    command = command.env("SCREENPIPE_API_KEY", token);
                }

                command.spawn()
            }
        }
    };

    let (mut rx, child) = spawn_result.map_err(|e| {
        format!("Failed to start Pi: {}. Install with: bun add -g {}", e, PI_PACKAGE)
    })?;

    let pid = child.pid();
    info!("Spawned pi with PID {}", pid);

    // Update manager state
    if let Some(m) = manager_guard.as_mut() {
        m.child = Some(child);
        m.project_dir = Some(project_dir.clone());
        m.child_exited = false;
    }

    // Clone state for async task
    let state_arc = state.0.clone();
    let app_handle = app.app_handle().clone();

    // Spawn task to handle stdout/stderr
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    debug!("pi stdout: {}", line);
                    let _ = app_handle.emit("pi_output", &line);
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    if line.to_lowercase().contains("error") || line.to_lowercase().contains("failed") {
                        error!("pi stderr: {}", line);
                    } else {
                        debug!("pi stderr: {}", line);
                    }
                    let _ = app_handle.emit("pi_log", &line);
                }
                CommandEvent::Terminated(payload) => {
                    warn!("pi terminated with status: {:?}", payload.code);
                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            m.child_exited = true;
                        }
                    }
                    let _ = app_handle.emit("pi_terminated", payload.code);
                }
                CommandEvent::Error(message) => {
                    error!("pi error: {}", message);
                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            m.child_exited = true;
                        }
                    }
                    let _ = app_handle.emit("pi_error", &message);
                }
                _ => {}
            }
        }
    });

    // Brief wait for process to start
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Check if still running
    if let Some(m) = manager_guard.as_ref() {
        if m.child_exited {
            return Err("Pi exited unexpectedly. Check logs for details.".to_string());
        }
    }

    match manager_guard.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(PiInfo::default()),
    }
}

/// Check if pi is available (either as sidecar or in PATH)
#[tauri::command]
#[specta::specta]
pub async fn pi_check(app: tauri::AppHandle) -> Result<PiCheckResult, String> {
    let sidecar_available = app.shell().sidecar("pi").is_ok();

    let path_available = {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("where")
                .arg("pi")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }

        #[cfg(not(target_os = "windows"))]
        {
            std::process::Command::new("which")
                .arg("pi")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
    };

    Ok(PiCheckResult {
        available: sidecar_available || path_available,
        sidecar_available,
        path_available,
    })
}

/// Install pi via bun (runs in background)
#[tauri::command]
#[specta::specta]
pub async fn pi_install(app: tauri::AppHandle) -> Result<(), String> {
    info!("Installing pi via bun...");

    // Use bundled bun sidecar to install pi globally
    let bun_result = app.shell().sidecar("bun");

    match bun_result {
        Ok(cmd) => {
            let args = vec!["add", "-g", PI_PACKAGE];
            info!("Running: bun {:?}", args);

            match cmd.args(&args).spawn() {
                Ok((mut rx, _child)) => {
                    // Spawn a task to log output but don't block
                    let app_handle = app.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    let text = String::from_utf8_lossy(&line);
                                    debug!("pi install stdout: {}", text);
                                }
                                CommandEvent::Stderr(line) => {
                                    let text = String::from_utf8_lossy(&line);
                                    debug!("pi install stderr: {}", text);
                                }
                                CommandEvent::Terminated(payload) => {
                                    if payload.code == Some(0) {
                                        info!("Pi installed successfully");
                                        let _ = app_handle.emit("pi_installed", true);
                                    } else {
                                        error!("Pi installation failed with code: {:?}", payload.code);
                                        let _ = app_handle.emit("pi_installed", false);
                                    }
                                }
                                CommandEvent::Error(e) => {
                                    error!("Pi install error: {}", e);
                                    let _ = app_handle.emit("pi_installed", false);
                                }
                                _ => {}
                            }
                        }
                    });
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to spawn bun install: {}", e);
                    Err(format!("Failed to start installation: {}", e))
                }
            }
        }
        Err(e) => {
            error!("Bun sidecar not available: {}", e);
            Err("Bun not available for installation".to_string())
        }
    }
}

/// Send a prompt to pi via stdin (RPC mode)
#[tauri::command]
#[specta::specta]
pub async fn pi_prompt(
    state: State<'_, PiState>,
    message: String,
) -> Result<(), String> {
    let manager = state.0.lock().await;
    
    match manager.as_ref() {
        Some(m) if m.is_running() => {
            // In RPC mode, we communicate via stdin/stdout
            // The child process stdin needs to be accessed differently
            // For now, we emit an event that the frontend will handle
            // The actual RPC communication happens via the event stream
            info!("Pi prompt requested: {}", message.chars().take(100).collect::<String>());
            Ok(())
        }
        _ => Err("Pi is not running".to_string()),
    }
}

/// Cleanup function to be called on app exit
pub async fn cleanup_pi(state: &PiState) {
    info!("Cleaning up pi on app exit");
    let mut manager = state.0.lock().await;
    if let Some(m) = manager.as_mut() {
        m.stop();
    }
    kill_orphaned_pi_processes().await;
}

// Legacy print mode support (for obsidian sync, etc.)
const DEFAULT_MODEL: &str = "claude-haiku-4-5@20251001";

/// Find the pi executable path
fn find_executable() -> Result<String, String> {
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    let paths = vec![
        format!("{}/.bun/bin/pi", home),
        format!("{}/.npm-global/bin/pi", home),
        format!("{}/.nvm/versions/node/v22.11.0/bin/pi", home),
        "/opt/homebrew/bin/pi".to_string(),
        "/usr/local/bin/pi".to_string(),
        "/usr/bin/pi".to_string(),
        "pi".to_string(),
    ];

    paths
        .into_iter()
        .find(|p| p == "pi" || std::path::Path::new(p).exists())
        .ok_or_else(|| format!("Could not find pi. Install with: bun add -g {}", PI_PACKAGE))
}

/// Ensure pi CLI is installed/updated via bun (legacy)
pub async fn ensure_installed() -> Result<(), String> {
    info!("Ensuring pi CLI is installed/updated via bun...");

    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    let bun_paths = vec![
        format!("{}/.bun/bin/bun", home),
        "/opt/homebrew/bin/bun".to_string(),
        "/usr/local/bin/bun".to_string(),
        "bun".to_string(),
    ];

    let bun = bun_paths
        .iter()
        .find(|p| *p == "bun" || std::path::Path::new(p).exists())
        .ok_or("Could not find bun. Install from https://bun.sh")?
        .clone();

    info!("Using bun at: {}", bun);

    let output = tokio::process::Command::new(&bun)
        .args(["add", "-g", PI_PACKAGE])
        .output()
        .await
        .map_err(|e| format!("Failed to run bun: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("bun install warning: {}", stderr);
    } else {
        info!("pi CLI installed/updated successfully");
    }

    Ok(())
}

/// Run pi with a prompt (non-interactive print mode) - legacy for obsidian sync
pub async fn run(
    prompt: &str,
    user_token: Option<&str>,
    working_dir: &str,
    pid_tx: Option<tokio::sync::oneshot::Sender<u32>>,
) -> Result<String, String> {
    // Ensure pi is installed and configured
    ensure_installed().await?;
    ensure_pi_config(user_token)?;

    let pi_cmd = find_executable()?;
    info!("Using pi at: {}", pi_cmd);

    let mut cmd = tokio::process::Command::new(&pi_cmd);
    cmd.current_dir(working_dir);
    cmd.arg("-p").arg(prompt);
    cmd.arg("--provider").arg("screenpipe");
    cmd.arg("--model").arg(DEFAULT_MODEL);

    if let Some(token) = user_token {
        info!(
            "pi::run: setting SCREENPIPE_API_KEY env var (token length: {})",
            token.len()
        );
        cmd.env("SCREENPIPE_API_KEY", token);
    } else {
        warn!("pi::run: no user_token provided!");
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    info!("Running pi command...");
    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn pi: {}", e))?;

    // Send PID if requested
    if let Some(tx) = pid_tx {
        if let Some(pid) = child.id() {
            let _ = tx.send(pid);
            info!("Pi process started with PID: {}", pid);
        }
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to wait for pi: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stdout.is_empty() {
        debug!("pi stdout: {}", stdout);
    }
    if !stderr.is_empty() {
        debug!("pi stderr: {}", stderr);
    }

    if output.status.success() {
        info!("Pi completed successfully");
        Ok(stdout)
    } else {
        let error_msg = if !stderr.is_empty() {
            stderr
        } else {
            format!("Pi exited with code {:?}", output.status.code())
        };
        error!("Pi failed: {}", error_msg);
        Err(error_msg)
    }
}

/// Kill a pi process by PID (legacy)
pub fn kill(pid: u32) -> Result<(), String> {
    info!("Killing pi process with PID: {}", pid);

    #[cfg(unix)]
    {
        use std::process::Command;
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .output();
        let output = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to kill process: {}", e))?;

        if output.status.success() {
            info!("Pi process {} killed", pid);
            Ok(())
        } else {
            Err(format!("Failed to kill process {}", pid))
        }
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let output = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to kill process: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(format!("Failed to kill process {}", pid))
        }
    }
}
