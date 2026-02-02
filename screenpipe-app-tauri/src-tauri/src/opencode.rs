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

/// State for managing the OpenCode sidecar process
pub struct OpencodeState(pub Arc<Mutex<Option<OpencodeManager>>>);

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeInfo {
    pub running: bool,
    pub base_url: Option<String>,
    pub port: Option<u16>,
    pub project_dir: Option<String>,
    pub pid: Option<u32>,
}

impl Default for OpencodeInfo {
    fn default() -> Self {
        Self {
            running: false,
            base_url: None,
            port: None,
            project_dir: None,
            pid: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeCheckResult {
    pub available: bool,
    pub sidecar_available: bool,
    pub path_available: bool,
}

pub struct OpencodeManager {
    child: Option<CommandChild>,
    port: Option<u16>,
    project_dir: Option<String>,
    child_exited: bool,
}

impl OpencodeManager {
    pub fn new() -> Self {
        Self {
            child: None,
            port: None,
            project_dir: None,
            child_exited: false,
        }
    }

    pub fn snapshot(&self) -> OpencodeInfo {
        let (running, pid) = match &self.child {
            None => (false, None),
            Some(_) if self.child_exited => (false, None),
            Some(child) => (true, Some(child.pid())),
        };

        OpencodeInfo {
            running,
            base_url: self.port.map(|p| format!("http://127.0.0.1:{}", p)),
            port: self.port,
            project_dir: self.project_dir.clone(),
            pid,
        }
    }

    pub fn stop(&mut self) {
        if let Some(child) = self.child.take() {
            if let Err(e) = child.kill() {
                error!("Failed to kill opencode child process: {}", e);
            }
        }
        self.child_exited = true;
        self.port = None;
        self.project_dir = None;
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some() && !self.child_exited
    }
}

/// Find a free port for the OpenCode server
fn find_free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

/// Get the OpenCode config directory
/// OpenCode uses ~/.config/opencode on all platforms (XDG standard)
fn get_opencode_config_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home_dir.join(".config").join("opencode"))
}

/// Ensure OpenCode is configured to use screenpipe-cloud as the AI provider
/// This creates/updates the opencode.json config file
fn ensure_opencode_config(user_token: Option<&str>) -> Result<(), String> {
    let config_dir = get_opencode_config_dir()?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create opencode config dir: {}", e))?;

    let config_path = config_dir.join("opencode.json");

    // Create config that uses screenpipe-cloud as the provider
    // This leverages the $200k Vertex AI credits through screenpipe's proxy
    // Available models: claude-haiku-4-5 (fast), claude-opus-4-5 (powerful)
    let config = json!({
        "$schema": "https://opencode.ai/config.json",
        "provider": {
            "screenpipe": {
                "npm": "@ai-sdk/anthropic",
                "options": {
                    "baseURL": "https://api.screenpi.pe/anthropic"
                },
                "models": {
                    "claude-haiku-4-5": {
                        "name": "Claude Haiku 4.5",
                        "limit": {
                            "context": 200000,
                            "output": 8192
                        }
                    },
                    "claude-opus-4-5": {
                        "name": "Claude Opus 4.5",
                        "limit": {
                            "context": 200000,
                            "output": 32768
                        }
                    }
                }
            }
        },
        "model": "screenpipe/claude-haiku-4-5"
    });

    // Write the config
    let config_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write opencode config: {}", e))?;

    // If we have a user token, also set up auth
    if let Some(token) = user_token {
        let auth_path = config_dir.join("auth.json");
        let auth = json!({
            "screenpipe": {
                "type": "api_key",
                "key": token
            }
        });
        let auth_str = serde_json::to_string_pretty(&auth)
            .map_err(|e| format!("Failed to serialize auth: {}", e))?;
        std::fs::write(&auth_path, auth_str)
            .map_err(|e| format!("Failed to write opencode auth: {}", e))?;
    }

    info!("OpenCode configured to use screenpipe-cloud at {:?}", config_path);
    Ok(())
}

/// Kill orphaned opencode processes
pub async fn kill_orphaned_opencode_processes() {
    #[cfg(target_os = "macos")]
    {
        let _ = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("pgrep -x opencode | xargs kill -9 2>/dev/null || true")
            .output()
            .await;
    }

    #[cfg(target_os = "linux")]
    {
        let _ = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("pgrep -x opencode | xargs -I {} kill -15 {} 2>/dev/null || true")
            .output()
            .await;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let _ = tokio::process::Command::new("taskkill")
            .args(["/F", "/IM", "opencode.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await;
    }
}

/// Get OpenCode info
#[tauri::command]
#[specta::specta]
pub async fn opencode_info(state: State<'_, OpencodeState>) -> Result<OpencodeInfo, String> {
    let manager = state.0.lock().await;
    match manager.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(OpencodeInfo::default()),
    }
}

/// Stop the OpenCode sidecar
#[tauri::command]
#[specta::specta]
pub async fn opencode_stop(state: State<'_, OpencodeState>) -> Result<OpencodeInfo, String> {
    info!("Stopping opencode sidecar");

    let mut manager = state.0.lock().await;
    if let Some(m) = manager.as_mut() {
        m.stop();
    }

    // Also kill any orphaned opencode processes
    kill_orphaned_opencode_processes().await;

    match manager.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(OpencodeInfo::default()),
    }
}

/// Start the OpenCode sidecar
/// user_token: The user's screenpipe auth token for API access
#[tauri::command]
#[specta::specta]
pub async fn opencode_start(
    app: tauri::AppHandle,
    state: State<'_, OpencodeState>,
    project_dir: String,
    user_token: Option<String>,
) -> Result<OpencodeInfo, String> {
    let project_dir = project_dir.trim().to_string();
    if project_dir.is_empty() {
        return Err("Project directory is required".to_string());
    }

    // Create project directory if it doesn't exist
    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Ensure OpenCode is configured to use screenpipe-cloud
    ensure_opencode_config(user_token.as_deref())?;

    let port = find_free_port()?;

    let mut manager_guard = state.0.lock().await;

    // Initialize manager if needed
    if manager_guard.is_none() {
        *manager_guard = Some(OpencodeManager::new());
    }

    // Stop any existing instance
    if let Some(m) = manager_guard.as_mut() {
        if m.is_running() {
            info!("Stopping existing opencode instance");
            m.stop();
        }
    }

    // Build opencode serve command
    let args = vec![
        "serve".to_string(),
        "--hostname".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--cors".to_string(),
        "*".to_string(),
    ];

    info!("Starting opencode with args: {:?} in dir: {}", args, project_dir);

    // Try to spawn opencode - first try sidecar, then PATH
    let spawn_result = {
        let sidecar_result = app.shell().sidecar("opencode");

        match sidecar_result {
            Ok(cmd) => {
                info!("Using bundled opencode sidecar");
                let mut command = cmd.args(&args).current_dir(&project_dir);

                // Pass the API key via environment variable for the provider
                if let Some(ref token) = user_token {
                    command = command.env("ANTHROPIC_API_KEY", token);
                }

                command.spawn()
            }
            Err(_) => {
                // Fallback to PATH
                info!("Sidecar not found, trying opencode from PATH");
                let mut command = app.shell()
                    .command("opencode")
                    .args(&args)
                    .current_dir(&project_dir);

                if let Some(ref token) = user_token {
                    command = command.env("ANTHROPIC_API_KEY", token);
                }

                command.spawn()
            }
        }
    };

    let (mut rx, child) = spawn_result.map_err(|e| {
        format!("Failed to start OpenCode: {}", e)
    })?;

    let pid = child.pid();
    info!("Spawned opencode with PID {} on port {}", pid, port);

    // Update manager state
    if let Some(m) = manager_guard.as_mut() {
        m.child = Some(child);
        m.port = Some(port);
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
                    debug!("opencode stdout: {}", line);
                    let _ = app_handle.emit("opencode_log", &line);
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    if line.to_lowercase().contains("error") || line.to_lowercase().contains("failed") {
                        error!("opencode stderr: {}", line);
                    } else {
                        debug!("opencode stderr: {}", line);
                    }
                    let _ = app_handle.emit("opencode_log", &line);
                }
                CommandEvent::Terminated(payload) => {
                    warn!("opencode terminated with status: {:?}", payload.code);
                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            m.child_exited = true;
                        }
                    }
                    let _ = app_handle.emit("opencode_terminated", payload.code);
                }
                CommandEvent::Error(message) => {
                    error!("opencode error: {}", message);
                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            m.child_exited = true;
                        }
                    }
                    let _ = app_handle.emit("opencode_error", &message);
                }
                _ => {}
            }
        }
    });

    // Wait for server to be ready (poll health endpoint)
    let base_url = format!("http://127.0.0.1:{}", port);
    let health_url = format!("{}/health", base_url);
    let client = reqwest::Client::new();

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(15);

    loop {
        // Check if process exited
        if let Some(m) = manager_guard.as_ref() {
            if m.child_exited {
                return Err("OpenCode exited unexpectedly. Check logs for details.".to_string());
            }
        }

        // Try health check
        match client.get(&health_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                info!("OpenCode server is ready at {}", base_url);
                break;
            }
            _ => {}
        }

        if start.elapsed() > timeout {
            if let Some(m) = manager_guard.as_mut() {
                m.stop();
            }
            return Err("OpenCode server failed to start within 15 seconds.".to_string());
        }

        drop(manager_guard);
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        manager_guard = state.0.lock().await;
    }

    match manager_guard.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(OpencodeInfo::default()),
    }
}

/// Check if opencode is available (either as sidecar or in PATH)
#[tauri::command]
#[specta::specta]
pub async fn opencode_check(app: tauri::AppHandle) -> Result<OpencodeCheckResult, String> {
    let sidecar_available = app.shell().sidecar("opencode").is_ok();

    let path_available = {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("where")
                .arg("opencode")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }

        #[cfg(not(target_os = "windows"))]
        {
            std::process::Command::new("which")
                .arg("opencode")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
    };

    Ok(OpencodeCheckResult {
        available: sidecar_available || path_available,
        sidecar_available,
        path_available,
    })
}

/// Install opencode via bun (runs in background)
/// Returns immediately, installation happens async
#[tauri::command]
#[specta::specta]
pub async fn opencode_install(app: tauri::AppHandle) -> Result<(), String> {
    info!("Installing opencode via bun...");

    // Use bundled bun sidecar to install opencode globally
    let bun_result = app.shell().sidecar("bun");

    match bun_result {
        Ok(cmd) => {
            let args = vec!["add", "-g", "opencode-ai"];
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
                                    debug!("opencode install stdout: {}", text);
                                }
                                CommandEvent::Stderr(line) => {
                                    let text = String::from_utf8_lossy(&line);
                                    debug!("opencode install stderr: {}", text);
                                }
                                CommandEvent::Terminated(payload) => {
                                    if payload.code == Some(0) {
                                        info!("OpenCode installed successfully");
                                        let _ = app_handle.emit("opencode_installed", true);
                                    } else {
                                        error!("OpenCode installation failed with code: {:?}", payload.code);
                                        let _ = app_handle.emit("opencode_installed", false);
                                    }
                                }
                                CommandEvent::Error(e) => {
                                    error!("OpenCode install error: {}", e);
                                    let _ = app_handle.emit("opencode_installed", false);
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

/// Cleanup function to be called on app exit
pub async fn cleanup_opencode(state: &OpencodeState) {
    info!("Cleaning up opencode on app exit");
    let mut manager = state.0.lock().await;
    if let Some(m) = manager.as_mut() {
        m.stop();
    }
    kill_orphaned_opencode_processes().await;
}
