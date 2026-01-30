use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Emitter;
use tauri::{Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// State for managing the OpenCode sidecar process
pub struct OpencodeState(pub Arc<Mutex<Option<OpencodeManager>>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeInfo {
    pub running: bool,
    pub base_url: Option<String>,
    pub port: Option<u16>,
    pub project_dir: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub pid: Option<u32>,
    pub last_stdout: Option<String>,
    pub last_stderr: Option<String>,
}

impl Default for OpencodeInfo {
    fn default() -> Self {
        Self {
            running: false,
            base_url: None,
            port: None,
            project_dir: None,
            username: None,
            password: None,
            pid: None,
            last_stdout: None,
            last_stderr: None,
        }
    }
}

pub struct OpencodeManager {
    child: Option<CommandChild>,
    port: Option<u16>,
    project_dir: Option<String>,
    username: Option<String>,
    password: Option<String>,
    last_stdout: Option<String>,
    last_stderr: Option<String>,
    child_exited: bool,
}

impl OpencodeManager {
    pub fn new() -> Self {
        Self {
            child: None,
            port: None,
            project_dir: None,
            username: None,
            password: None,
            last_stdout: None,
            last_stderr: None,
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
            username: self.username.clone(),
            password: self.password.clone(),
            pid,
            last_stdout: self.last_stdout.clone(),
            last_stderr: self.last_stderr.clone(),
        }
    }

    pub fn stop(&mut self) {
        if let Some(child) = self.child.take() {
            let _ = child.kill();
        }
        self.child_exited = true;
        self.port = None;
        self.project_dir = None;
        self.username = None;
        self.password = None;
        self.last_stdout = None;
        self.last_stderr = None;
    }
}

/// Find a free port for the OpenCode server
fn find_free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

/// Truncate output to avoid memory issues
fn truncate_output(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("...{}", &s[s.len() - max_len..])
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
    let mut manager = state.0.lock().await;
    if let Some(m) = manager.as_mut() {
        m.stop();
    }

    // Also kill any orphaned opencode processes
    #[cfg(target_os = "macos")]
    {
        let _ = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("pgrep -x opencode | xargs -r kill -9 2>/dev/null || true")
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

    match manager.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(OpencodeInfo::default()),
    }
}

/// Start the OpenCode sidecar
#[tauri::command]
#[specta::specta]
pub async fn opencode_start(
    app: tauri::AppHandle,
    state: State<'_, OpencodeState>,
    project_dir: String,
) -> Result<OpencodeInfo, String> {
    let project_dir = project_dir.trim().to_string();
    if project_dir.is_empty() {
        return Err("project_dir is required".to_string());
    }

    // Create project directory if it doesn't exist
    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    let port = find_free_port()?;
    let username = Uuid::new_v4().to_string();
    let password = Uuid::new_v4().to_string();

    let mut manager_guard = state.0.lock().await;

    // Initialize manager if needed
    if manager_guard.is_none() {
        *manager_guard = Some(OpencodeManager::new());
    }

    // Stop any existing instance
    if let Some(m) = manager_guard.as_mut() {
        m.stop();
    }

    // Build opencode serve command
    let args = vec![
        "serve".to_string(),
        "--hostname".to_string(),
        "0.0.0.0".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--cors".to_string(),
        "*".to_string(),
    ];

    // Try to spawn opencode - first try sidecar, then PATH
    let spawn_result = {
        // Try sidecar first
        let sidecar_result = app.shell().sidecar("opencode");

        match sidecar_result {
            Ok(cmd) => {
                info!("Using bundled opencode sidecar");
                cmd.args(&args)
                    .current_dir(&project_dir)
                    .env("OPENCODE_CLIENT", "screenpipe")
                    .env("OPENCODE_SERVER_USERNAME", &username)
                    .env("OPENCODE_SERVER_PASSWORD", &password)
                    .spawn()
            }
            Err(_) => {
                // Fallback to PATH
                info!("Sidecar not found, trying opencode from PATH");
                app.shell()
                    .command("opencode")
                    .args(&args)
                    .current_dir(&project_dir)
                    .env("OPENCODE_CLIENT", "screenpipe")
                    .env("OPENCODE_SERVER_USERNAME", &username)
                    .env("OPENCODE_SERVER_PASSWORD", &password)
                    .spawn()
            }
        }
    };

    let (mut rx, child) = spawn_result.map_err(|e| {
        format!(
            "Failed to start opencode. Please install it:\n\
             - brew install anomalyco/tap/opencode\n\
             - curl -fsSL https://opencode.ai/install | bash\n\n\
             Error: {}",
            e
        )
    })?;

    let pid = child.pid();
    info!("Spawned opencode with PID {} on port {}", pid, port);

    // Update manager state
    if let Some(m) = manager_guard.as_mut() {
        m.child = Some(child);
        m.port = Some(port);
        m.project_dir = Some(project_dir.clone());
        m.username = Some(username.clone());
        m.password = Some(password.clone());
        m.child_exited = false;
        m.last_stdout = None;
        m.last_stderr = None;
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

                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            let next = m.last_stdout.as_deref().unwrap_or_default().to_string() + &line;
                            m.last_stdout = Some(truncate_output(&next, 8000));
                        }
                    }

                    let _ = app_handle.emit("opencode_log", &line);
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    error!("opencode stderr: {}", line);

                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            let next = m.last_stderr.as_deref().unwrap_or_default().to_string() + &line;
                            m.last_stderr = Some(truncate_output(&next, 8000));
                        }
                    }

                    let _ = app_handle.emit("opencode_log", format!("ERROR: {}", line));
                }
                CommandEvent::Terminated(payload) => {
                    warn!("opencode terminated with status: {:?}", payload.code);

                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            m.child_exited = true;
                        }
                    }
                }
                CommandEvent::Error(message) => {
                    error!("opencode error: {}", message);

                    if let Ok(mut manager) = state_arc.try_lock() {
                        if let Some(m) = manager.as_mut() {
                            m.child_exited = true;
                            let next = m.last_stderr.as_deref().unwrap_or_default().to_string() + &message;
                            m.last_stderr = Some(truncate_output(&next, 8000));
                        }
                    }
                }
                _ => {}
            }
        }
    });

    // Wait for warmup (2 seconds) to detect early crashes
    let warmup_deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        if let Some(m) = manager_guard.as_ref() {
            if m.child_exited {
                let stdout = m.last_stdout.clone().unwrap_or_default();
                let stderr = m.last_stderr.clone().unwrap_or_default();

                let mut parts = Vec::new();
                if !stdout.is_empty() {
                    parts.push(format!("stdout:\n{}", stdout));
                }
                if !stderr.is_empty() {
                    parts.push(format!("stderr:\n{}", stderr));
                }

                let suffix = if parts.is_empty() {
                    String::new()
                } else {
                    format!("\n\n{}", parts.join("\n\n"))
                };

                return Err(format!("OpenCode exited immediately.{}", suffix));
            }
        }

        if std::time::Instant::now() >= warmup_deadline {
            break;
        }

        // Release lock during sleep
        drop(manager_guard);
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
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
    // Check sidecar first
    let sidecar_available = app.shell().sidecar("opencode").is_ok();

    // Check PATH
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

    // Try to get version if available
    let version = if sidecar_available || path_available {
        let output = if sidecar_available {
            app.shell()
                .sidecar("opencode")
                .ok()
                .and_then(|cmd| cmd.args(["--version"]).output().ok())
        } else {
            None
        };

        let output = output.or_else(|| {
            std::process::Command::new("opencode")
                .arg("--version")
                .output()
                .ok()
        });

        output.and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
    } else {
        None
    };

    Ok(OpencodeCheckResult {
        available: sidecar_available || path_available,
        sidecar_available,
        path_available,
        version,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeCheckResult {
    pub available: bool,
    pub sidecar_available: bool,
    pub path_available: bool,
    pub version: Option<String>,
}
