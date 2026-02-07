//! Pi Coding Agent Integration
//!
//! Manages the pi coding agent via RPC mode (stdin/stdout JSON protocol).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Arc;
use tauri::Emitter;
use tauri::{AppHandle, State};
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
    pub session_id: Option<String>,
}

impl Default for PiInfo {
    fn default() -> Self {
        Self {
            running: false,
            project_dir: None,
            pid: None,
            session_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PiCheckResult {
    pub available: bool,
    pub path: Option<String>,
}

/// RPC Response from Pi
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RpcResponse {
    #[serde(rename = "type")]
    response_type: String,
    success: Option<bool>,
    error: Option<String>,
    data: Option<Value>,
    command: Option<String>,
    id: Option<String>,
}

#[allow(dead_code)]
pub struct PiManager {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    project_dir: Option<String>,
    request_id: u64,
    app_handle: AppHandle,
}

impl PiManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            child: None,
            stdin: None,
            project_dir: None,
            request_id: 0,
            app_handle,
        }
    }

    pub fn snapshot(&self) -> PiInfo {
        let (running, pid) = match &self.child {
            None => (false, None),
            Some(child) => (true, Some(child.id())),
        };

        PiInfo {
            running,
            project_dir: self.project_dir.clone(),
            pid,
            session_id: None,
        }
    }

    pub fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            // Send abort command first
            if let Some(ref mut stdin) = self.stdin {
                let _ = writeln!(stdin, r#"{{"type":"abort"}}"#);
            }
            
            // Kill the process
            if let Err(e) = child.kill() {
                error!("Failed to kill pi child process: {}", e);
            }
            let _ = child.wait();
        }
        self.stdin = None;
        self.project_dir = None;
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }

    /// Send a command to Pi via stdin and return response
    pub fn send_command(&mut self, command: Value) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("Pi not running")?;
        
        self.request_id += 1;
        let mut cmd = command;
        if let Some(obj) = cmd.as_object_mut() {
            obj.insert("id".to_string(), json!(format!("req_{}", self.request_id)));
        }
        
        let cmd_str = serde_json::to_string(&cmd).map_err(|e| e.to_string())?;
        debug!("Sending to Pi: {}", cmd_str);
        
        writeln!(stdin, "{}", cmd_str).map_err(|e| format!("Failed to write to Pi stdin: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush Pi stdin: {}", e))?;
        
        Ok(())
    }
}

/// Get the Pi config directory (~/.pi/agent)
fn get_pi_config_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home_dir.join(".pi").join("agent"))
}

/// Parse the output of `where pi` on Windows, preferring .cmd files
/// This is extracted for testability
#[cfg(windows)]
fn parse_where_output(stdout: &str) -> Option<String> {
    // On Windows, prefer .cmd files over shell scripts
    // `where pi` may return multiple results, shell script first then .cmd
    
    // First try to find a .cmd file
    for line in stdout.lines() {
        let path = line.trim();
        if path.ends_with(".cmd") {
            return Some(path.to_string());
        }
    }
    
    // Fallback to first result if no .cmd found
    if let Some(path) = stdout.lines().next() {
        let path = path.trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    
    None
}

/// Find pi executable
fn find_pi_executable() -> Option<String> {
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    #[cfg(unix)]
    let paths = vec![
        format!("{}/.bun/bin/pi", home),
        format!("{}/.npm-global/bin/pi", home),
        "/opt/homebrew/bin/pi".to_string(),
        "/usr/local/bin/pi".to_string(),
    ];

    #[cfg(windows)]
    let paths = vec![
        format!("{}\\.bun\\bin\\pi.exe", home),
        format!("{}\\AppData\\Roaming\\npm\\pi.cmd", home),
        format!("{}\\AppData\\Roaming\\npm\\pi", home),
        format!("{}\\AppData\\Local\\bun\\bin\\pi.exe", home),
        format!("{}\\.npm-global\\pi.cmd", home),
    ];

    for path in paths {
        if std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }

    // Try which/where command
    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new("which").arg("pi").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(output) = std::process::Command::new("where")
            .arg("pi")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(path) = parse_where_output(&stdout) {
                    return Some(path);
                }
            }
        }
    }

    None
}

/// Ensure the screenpipe-search skill exists in the project's .pi/skills directory
fn ensure_screenpipe_skill(project_dir: &str) -> Result<(), String> {
    let skill_dir = std::path::Path::new(project_dir)
        .join(".pi")
        .join("skills")
        .join("screenpipe-search");
    let skill_path = skill_dir.join("SKILL.md");

    // Always overwrite to keep skill up-to-date with app version
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill dir: {}", e))?;

    let skill_content = include_str!("../assets/skills/screenpipe-search/SKILL.md");
    std::fs::write(&skill_path, skill_content)
        .map_err(|e| format!("Failed to write screenpipe-search skill: {}", e))?;

    debug!("Screenpipe search skill installed at {:?}", skill_path);
    Ok(())
}

/// Ensure the web-search extension exists in the project's .pi/extensions directory
fn ensure_web_search_extension(project_dir: &str) -> Result<(), String> {
    let ext_dir = std::path::Path::new(project_dir)
        .join(".pi")
        .join("extensions");
    let ext_path = ext_dir.join("web-search.ts");

    std::fs::create_dir_all(&ext_dir)
        .map_err(|e| format!("Failed to create extensions dir: {}", e))?;

    let ext_content = include_str!("../assets/extensions/web-search.ts");
    std::fs::write(&ext_path, ext_content)
        .map_err(|e| format!("Failed to write web-search extension: {}", e))?;

    debug!("Web search extension installed at {:?}", ext_path);
    Ok(())
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

    match manager.as_ref() {
        Some(m) => Ok(m.snapshot()),
        None => Ok(PiInfo::default()),
    }
}

/// Start the Pi sidecar in RPC mode
#[tauri::command]
#[specta::specta]
pub async fn pi_start(
    app: AppHandle,
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

    // Ensure screenpipe-search skill exists in project
    ensure_screenpipe_skill(&project_dir)?;

    // Ensure web-search extension exists in project
    ensure_web_search_extension(&project_dir)?;

    // Ensure Pi is configured
    ensure_pi_config(user_token.as_deref())?;

    let mut manager_guard = state.0.lock().await;

    // Initialize manager if needed
    if manager_guard.is_none() {
        *manager_guard = Some(PiManager::new(app.clone()));
    }

    // Stop any existing instance
    if let Some(m) = manager_guard.as_mut() {
        if m.is_running() {
            info!("Stopping existing pi instance");
            m.stop();
        }
    }

    // Find pi executable
    let pi_path = find_pi_executable()
        .ok_or_else(|| format!("Pi not found. Install with: bun add -g {}", PI_PACKAGE))?;

    info!("Starting pi from {} in dir: {}", pi_path, project_dir);

    // Build command
    let mut cmd = Command::new(&pi_path);
    cmd.current_dir(&project_dir)
        .args(["--mode", "rpc", "--provider", "screenpipe", "--model", "claude-haiku-4-5@20251001"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // On Windows, prevent console window from appearing
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    if let Some(ref token) = user_token {
        cmd.env("SCREENPIPE_API_KEY", token);
    }

    // Spawn process
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn pi: {}", e))?;

    let pid = child.id();
    info!("Pi started with PID: {}", pid);

    // Take stdin for writing commands
    let stdin = child.stdin.take()
        .ok_or_else(|| "Failed to get pi stdin".to_string())?;

    // Take stdout for reading events
    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to get pi stdout".to_string())?;

    // Take stderr for logging
    let stderr = child.stderr.take();

    // Update manager
    if let Some(m) = manager_guard.as_mut() {
        m.child = Some(child);
        m.stdin = Some(stdin);
        m.project_dir = Some(project_dir.clone());
    }

    // Snapshot the state BEFORE dropping the lock, so we don't hold it during I/O
    let snapshot = match manager_guard.as_ref() {
        Some(m) => m.snapshot(),
        None => PiInfo::default(),
    };

    // Drop the lock before spawning reader threads — this is critical to prevent
    // queued pi_start calls from stacking behind a 500ms sleep while holding the lock
    drop(manager_guard);

    // Spawn stdout reader thread
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        info!("Pi stdout reader started");
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    // Try to parse as JSON and emit event
                    match serde_json::from_str::<Value>(&line) {
                        Ok(event) => {
                            if let Err(e) = app_handle.emit("pi_event", &event) {
                                error!("Failed to emit pi_event: {}", e);
                            }
                        }
                        Err(e) => {
                            warn!("Pi stdout not JSON: {} (line: {})", e, &line[..line.len().min(100)]);
                        }
                    }
                    if let Err(e) = app_handle.emit("pi_output", &line) {
                        error!("Failed to emit pi_output: {}", e);
                    }
                }
                Err(e) => {
                    error!("Error reading pi stdout: {}", e);
                    break;
                }
            }
        }
        info!("Pi stdout reader ended");
        let _ = app_handle.emit("pi_terminated", ());
    });

    // Spawn stderr reader thread
    if let Some(stderr) = stderr {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            info!("Pi stderr reader started");
            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        info!("Pi stderr: {}", line);
                        let _ = app_handle.emit("pi_log", &line);
                    }
                    Err(_) => break,
                }
            }
            info!("Pi stderr reader ended");
        });
    }

    // Brief wait then check if process died immediately (e.g. bad config, missing deps)
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    {
        let mut manager_guard = state.0.lock().await;
        if let Some(m) = manager_guard.as_mut() {
            if let Some(ref mut child) = m.child {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let code = status.code().unwrap_or(-1);
                        error!("Pi process exited immediately with code {}", code);
                        m.child = None;
                        m.stdin = None;
                        return Err(format!("Pi exited immediately with code {}", code));
                    }
                    Ok(None) => {
                        // Still running — good
                    }
                    Err(e) => {
                        warn!("Failed to check pi process status: {}", e);
                    }
                }
            }
        }
    }

    Ok(snapshot)
}

/// Image content for Pi RPC protocol
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct PiImageContent {
    #[serde(rename = "type")]
    pub content_type: String, // always "image"
    pub source: PiImageSource,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct PiImageSource {
    #[serde(rename = "type")]
    pub source_type: String, // "base64"
    #[serde(rename = "mediaType")]
    pub media_type: String, // e.g. "image/png"
    pub data: String, // base64-encoded image data
}

/// Send a prompt to Pi, optionally with images
#[tauri::command]
#[specta::specta]
pub async fn pi_prompt(
    state: State<'_, PiState>,
    message: String,
    images: Option<Vec<PiImageContent>>,
) -> Result<(), String> {
    let mut manager = state.0.lock().await;
    let m = manager.as_mut().ok_or("Pi not initialized")?;
    
    if !m.is_running() {
        return Err("Pi is not running".to_string());
    }

    let mut cmd = json!({
        "type": "prompt",
        "message": message
    });

    if let Some(imgs) = images {
        if !imgs.is_empty() {
            cmd["images"] = serde_json::to_value(imgs).map_err(|e| e.to_string())?;
        }
    }

    m.send_command(cmd)
}

/// Abort current Pi operation
#[tauri::command]
#[specta::specta]
pub async fn pi_abort(state: State<'_, PiState>) -> Result<(), String> {
    let mut manager = state.0.lock().await;
    let m = manager.as_mut().ok_or("Pi not initialized")?;
    
    if !m.is_running() {
        return Err("Pi is not running".to_string());
    }

    m.send_command(json!({"type": "abort"}))
}

/// Start a new Pi session (clears conversation history)
#[tauri::command]
#[specta::specta]
pub async fn pi_new_session(state: State<'_, PiState>) -> Result<(), String> {
    let mut manager = state.0.lock().await;
    let m = manager.as_mut().ok_or("Pi not initialized")?;
    
    if !m.is_running() {
        return Err("Pi is not running".to_string());
    }

    m.send_command(json!({"type": "new_session"}))
}

/// Check if pi is available
#[tauri::command]
#[specta::specta]
pub async fn pi_check() -> Result<PiCheckResult, String> {
    let path = find_pi_executable();
    Ok(PiCheckResult {
        available: path.is_some(),
        path,
    })
}

/// Install pi via bun
#[tauri::command]
#[specta::specta]
pub async fn pi_install(app: AppHandle) -> Result<(), String> {
    info!("Installing pi via bun...");

    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    #[cfg(unix)]
    let bun_paths = vec![
        format!("{}/.bun/bin/bun", home),
        "/opt/homebrew/bin/bun".to_string(),
        "/usr/local/bin/bun".to_string(),
    ];

    #[cfg(windows)]
    let bun_paths = vec![
        format!("{}\\.bun\\bin\\bun.exe", home),
        format!("{}\\AppData\\Local\\bun\\bin\\bun.exe", home),
    ];

    let bun = bun_paths
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .ok_or("Could not find bun. Install from https://bun.sh")?
        .clone();

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut cmd = std::process::Command::new(&bun);
        cmd.args(["add", "-g", PI_PACKAGE]);

        // On Windows, prevent console window from appearing
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let output = cmd.output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    info!("Pi installed successfully");
                    let _ = app_handle.emit("pi_installed", true);
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    error!("Pi installation failed: {}", stderr);
                    let _ = app_handle.emit("pi_installed", false);
                }
            }
            Err(e) => {
                error!("Failed to run bun: {}", e);
                let _ = app_handle.emit("pi_installed", false);
            }
        }
    });

    Ok(())
}

/// Cleanup function to be called on app exit
pub async fn cleanup_pi(state: &PiState) {
    info!("Cleaning up pi on app exit");
    let mut manager = state.0.lock().await;
    if let Some(m) = manager.as_mut() {
        m.stop();
    }
}

// ============================================================================
// Legacy functions for obsidian sync (print mode)
// ============================================================================

/// Run pi with a prompt (non-interactive print mode)
pub async fn run(
    prompt: &str,
    user_token: Option<&str>,
    working_dir: &str,
    pid_tx: Option<tokio::sync::oneshot::Sender<u32>>,
) -> Result<String, String> {
    ensure_pi_config(user_token)?;

    let pi_path = find_pi_executable()
        .ok_or_else(|| format!("Pi not found. Install with: bun add -g {}", PI_PACKAGE))?;

    let mut cmd = tokio::process::Command::new(&pi_path);
    cmd.current_dir(working_dir);
    cmd.arg("-p").arg(prompt);
    cmd.arg("--provider").arg("screenpipe");
    cmd.arg("--model").arg("claude-haiku-4-5@20251001");

    if let Some(token) = user_token {
        cmd.env("SCREENPIPE_API_KEY", token);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // On Windows, prevent console window from appearing
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn pi: {}", e))?;

    if let Some(tx) = pid_tx {
        if let Some(pid) = child.id() {
            let _ = tx.send(pid);
        }
    }

    let output = child.wait_with_output().await
        .map_err(|e| format!("Failed to wait for pi: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(if !stderr.is_empty() { stderr } else { format!("Pi exited with code {:?}", output.status.code()) })
    }
}

/// Kill a pi process by PID
pub fn kill(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output();
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use super::parse_where_output;

    /// Test that parse_where_output prefers .cmd files over shell scripts
    #[test]
    #[cfg(windows)]
    fn test_parse_where_output_prefers_cmd() {
        // Simulates typical `where pi` output on Windows with npm global install
        let output = "C:\\Users\\louis\\AppData\\Roaming\\npm\\pi\r\nC:\\Users\\louis\\AppData\\Roaming\\npm\\pi.cmd\r\n";
        
        let result = parse_where_output(output);
        assert_eq!(result, Some("C:\\Users\\louis\\AppData\\Roaming\\npm\\pi.cmd".to_string()));
    }

    /// Test that parse_where_output works when only .cmd is present
    #[test]
    #[cfg(windows)]
    fn test_parse_where_output_cmd_only() {
        let output = "C:\\Users\\louis\\AppData\\Roaming\\npm\\pi.cmd\r\n";
        
        let result = parse_where_output(output);
        assert_eq!(result, Some("C:\\Users\\louis\\AppData\\Roaming\\npm\\pi.cmd".to_string()));
    }

    /// Test that parse_where_output falls back to first result if no .cmd
    #[test]
    #[cfg(windows)]
    fn test_parse_where_output_no_cmd_fallback() {
        // Edge case: only shell script available (e.g., WSL or custom install)
        let output = "C:\\Users\\louis\\AppData\\Roaming\\npm\\pi\r\n";
        
        let result = parse_where_output(output);
        assert_eq!(result, Some("C:\\Users\\louis\\AppData\\Roaming\\npm\\pi".to_string()));
    }

    /// Test that parse_where_output handles empty output
    #[test]
    #[cfg(windows)]
    fn test_parse_where_output_empty() {
        let output = "";
        
        let result = parse_where_output(output);
        assert_eq!(result, None);
    }

    /// Test that parse_where_output handles whitespace-only output
    #[test]
    #[cfg(windows)]
    fn test_parse_where_output_whitespace() {
        let output = "   \r\n  \r\n";
        
        let result = parse_where_output(output);
        assert_eq!(result, None);
    }

    /// Test with multiple paths including .cmd in different positions
    #[test]
    #[cfg(windows)]
    fn test_parse_where_output_cmd_not_first() {
        // .cmd file is last in the list
        let output = "C:\\Some\\Path\\pi\r\nC:\\Another\\Path\\pi\r\nC:\\Users\\npm\\pi.cmd\r\n";
        
        let result = parse_where_output(output);
        assert_eq!(result, Some("C:\\Users\\npm\\pi.cmd".to_string()));
    }

    /// Test with Unix-style line endings (shouldn't happen on Windows but be safe)
    #[test]
    #[cfg(windows)]
    fn test_parse_where_output_unix_line_endings() {
        let output = "C:\\Users\\npm\\pi\nC:\\Users\\npm\\pi.cmd\n";
        
        let result = parse_where_output(output);
        assert_eq!(result, Some("C:\\Users\\npm\\pi.cmd".to_string()));
    }
}
