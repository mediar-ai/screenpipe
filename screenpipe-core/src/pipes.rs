use dirs::home_dir;
use regex::Regex;
use sentry;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::process::Command;
use tokio::sync::watch;

use anyhow::Result;
use std::fs;
use std::path::Path;
use tokio::io::{AsyncBufReadExt, BufReader};
use tracing::{debug, error, info, warn};
use url::Url;
use which::which;

// Add these imports at the top of the file
use serde_json::json;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

use crate::pick_unused_port;
use once_cell::sync::Lazy;

// Add near other imports
use http_cache_reqwest::{CACacheManager, Cache, CacheMode, HttpCache, HttpCacheOptions};
use rand::distributions::Alphanumeric;
use rand::{thread_rng, Rng};
use reqwest_middleware::reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest_middleware::reqwest::Client;
use reqwest_middleware::ClientBuilder;
use std::collections::HashSet;
use std::str::FromStr;

// Add at top of file with other imports
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Clone, Debug, Copy)]
pub enum PipeState {
    Port(u16),
    Pid(i32),
}

pub struct CronHandle {
    shutdown: watch::Sender<bool>,
}

#[derive(Debug, Clone)]
pub enum BuildStatus {
    NotStarted,
    InProgress,
    Success,
    Failed(String),
}

impl CronHandle {
    pub fn stop(&self) {
        let _ = self.shutdown.send(true);
    }
}

static CRON_HANDLES: Lazy<tokio::sync::Mutex<HashMap<String, Vec<CronHandle>>>> =
    Lazy::new(|| tokio::sync::Mutex::new(HashMap::new()));

// Add this function to generate a secure cron secret
fn generate_cron_secret() -> String {
    thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

// Update this function near the top of the file
fn sanitize_pipe_name(name: &str) -> String {
    let re = Regex::new(r"[^a-zA-Z0-9_-]").unwrap();
    let sanitized = re.replace_all(name, "-").to_string();

    // Remove "-ref-main/" suffix if it exists
    sanitized
        .strip_suffix("-ref-main/")
        .or_else(|| sanitized.strip_suffix("-ref-main"))
        .unwrap_or(&sanitized)
        .to_string()
}

async fn create_watchdog_script(parent_pid: u32, child_pid: u32) -> Result<PathBuf> {
    let script_content = if cfg!(windows) {
        format!(
            r#"
$parentPid = {parent_pid}
$childPid = {child_pid}

function Get-ChildProcesses($ProcessId) {{
    Get-WmiObject Win32_Process | Where-Object {{ $_.ParentProcessId -eq $ProcessId }} | ForEach-Object {{
        $_.ProcessId
        Get-ChildProcesses $_.ProcessId
    }}
}}

while ($true) {{
    try {{
        $parent = Get-Process -Id $parentPid -ErrorAction Stop
        $child = Get-Process -Id $childPid -ErrorAction Stop
        Start-Sleep -Seconds 1
    }} catch {{
        Write-Host "Parent process ($parentPid) not found, terminating child processes"
        
        # Get all child processes recursively
        $children = Get-ChildProcesses $childPid
        
        # Add the main process to the list
        $allProcesses = @($childPid) + $children
        
        foreach ($processId in $allProcesses) {{
            try {{
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Write-Host "Stopped process: $processId"
            }} catch {{
                Write-Host "Process $processId already terminated"
            }}
        }}
        Stop-Process -Id $PID -Force
        exit
    }}
}}
"#
        )
    } else {
        format!(
            r#"#!/bin/bash
set -x  # Enable debug mode
parent_pid={parent_pid}
child_pid={child_pid}

echo "[$(date)] Watchdog started - monitoring parent PID: $parent_pid, child PID: $child_pid"

find_all_children() {{
    local parent=$1
    local children=$(pgrep -P $parent)
    echo $children
    for child in $children; do
        find_all_children $child
    done
}}

cleanup() {{
    echo "[$(date)] Starting cleanup..."
    
    # Get all child processes recursively
    all_children=$(find_all_children $child_pid)
    echo "[$(date)] Found child processes: $all_children"
    
    # Try to kill by process group first
    child_pgid=$(ps -o pgid= -p $child_pid 2>/dev/null | tr -d ' ')
    if [ ! -z "$child_pgid" ]; then
        echo "[$(date)] Killing process group $child_pgid"
        pkill -TERM -g $child_pgid 2>/dev/null || true
        sleep 1
        pkill -KILL -g $child_pgid 2>/dev/null || true
    fi
    
    # Kill all children individually if they still exist
    if [ ! -z "$all_children" ]; then
        echo "[$(date)] Killing all child processes: $all_children"
        kill -TERM $all_children 2>/dev/null || true
        sleep 1
        kill -KILL $all_children 2>/dev/null || true
    fi
    
    # Kill the main process if it still exists
    echo "[$(date)] Killing main process $child_pid"
    kill -TERM $child_pid 2>/dev/null || true
    sleep 1
    kill -KILL $child_pid 2>/dev/null || true
    
    # Final verification
    sleep 1
    remaining=$(ps -o pid= -g $child_pgid 2>/dev/null || true)
    if [ ! -z "$remaining" ]; then
        echo "[$(date)] WARNING: Some processes might still be running: $remaining"
        pkill -KILL -g $child_pgid 2>/dev/null || true
    fi
    
    exit 0
}}

trap cleanup SIGTERM SIGINT

while true; do
    if ! ps -p $parent_pid > /dev/null 2>&1; then
        echo "[$(date)] Parent process ($parent_pid) not found, terminating child processes"
        cleanup
        exit
    fi
    sleep 1
done
"#
        )
    };

    let temp_dir = std::env::temp_dir();
    let script_name = if cfg!(windows) {
        format!("watchdog_{parent_pid}_{child_pid}.ps1")
    } else {
        format!("watchdog_{parent_pid}_{child_pid}.sh")
    };
    let script_path = temp_dir.join(script_name);

    tokio::fs::write(&script_path, script_content).await?;

    // Set executable permissions on Unix systems only
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&script_path).await?.permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&script_path, perms).await?;
    }

    Ok(script_path)
}

async fn spawn_watchdog(parent_pid: u32, child_pid: u32) -> Result<tokio::process::Child> {
    let script_path = create_watchdog_script(parent_pid, child_pid).await?;

    info!(
        "Spawning watchdog process for parent_pid={}, child_pid={}",
        parent_pid, child_pid
    );
    info!("Watchdog script path: {:?}", script_path);

    // Create a log file for the watchdog
    let log_path = std::env::temp_dir().join(format!("watchdog_{}_{}.log", parent_pid, child_pid));

    #[cfg(windows)]
    let child = {
        Command::new("powershell")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-File")
            .arg(&script_path)
            .creation_flags(0x08000000)
            .stdout(std::fs::File::create(&log_path)?)
            .stderr(std::fs::File::create(&log_path)?)
            .spawn()?
    };

    #[cfg(not(windows))]
    let child = {
        Command::new("bash")
            .arg(&script_path)
            .stdout(std::fs::File::create(&log_path)?)
            .stderr(std::fs::File::create(&log_path)?)
            .spawn()?
    };

    if let Some(id) = child.id() {
        info!("Watchdog process spawned with PID: {}", id);

        // Modify verification for Windows
        #[cfg(windows)]
        {
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_secs(1)).await;
                let output = Command::new("powershell")
                    .arg("-NoProfile")
                    .arg("-NonInteractive")
                    .arg("-Command")
                    .arg(format!(
                        "Get-Process -Id {} -ErrorAction SilentlyContinue",
                        id
                    ))
                    .output()
                    .await;

                match output {
                    Ok(output) => {
                        if output.status.success() {
                            info!("Watchdog process verified running with PID: {}", id);
                        } else {
                            error!("Watchdog process not found after spawn! PID: {}", id);
                        }
                    }
                    Err(e) => error!("Failed to verify watchdog process: {}", e),
                }
            });
        }

        #[cfg(not(windows))]
        {
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_secs(1)).await;
                let output = Command::new("ps")
                    .args(["-p", &id.to_string()])
                    .output()
                    .await;

                match output {
                    Ok(output) => {
                        if output.status.success() {
                            info!("Watchdog process verified running with PID: {}", id);
                        } else {
                            error!("Watchdog process not found after spawn! PID: {}", id);
                        }
                    }
                    Err(e) => error!("Failed to verify watchdog process: {}", e),
                }
            });
        }
    }

    // Clean up script after a delay
    let script_path_clone = script_path.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        if let Err(e) = tokio::fs::remove_file(&script_path_clone).await {
            error!("Failed to remove watchdog script: {}", e);
        }
    });

    Ok(child)
}

pub async fn run_pipe(
    pipe: &str,
    screenpipe_dir: PathBuf,
) -> Result<(tokio::process::Child, PipeState)> {
    let bun_path = find_bun_path().ok_or_else(|| {
        let err = anyhow::anyhow!("bun not found");
        sentry::capture_error(&err.source().unwrap());
        err
    })?;
    let pipe_dir = screenpipe_dir.join("pipes").join(pipe);
    let pipe_json_path = pipe_dir.join("pipe.json");
    let package_json_path = pipe_dir.join("package.json");

    debug!(
        "checking if pipe is a next.js project at: {:?}",
        package_json_path
    );

    // First check if it's a Next.js project by looking at package.json
    let is_nextjs = if package_json_path.exists() {
        debug!("found package.json, checking for next.js dependency");
        let package_json = tokio::fs::read_to_string(&package_json_path).await?;
        let package_data: Value = serde_json::from_str(&package_json)?;
        let has_next = package_data["dependencies"].get("next").is_some();
        debug!("is next.js project: {}", has_next);
        has_next
    } else {
        false
    };

    // Check if pipe is still enabled
    if pipe_json_path.exists() {
        debug!("checking if pipe is enabled from: {:?}", pipe_json_path);
        let pipe_json = tokio::fs::read_to_string(&pipe_json_path).await?;
        let pipe_config: Value = serde_json::from_str(&pipe_json)?;

        if !pipe_config
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            debug!("pipe {} is disabled, stopping", pipe);
            anyhow::bail!("pipe is disabled");
        }
        debug!("pipe {} is enabled, continuing", pipe);
    }

    // Prepare environment variables
    debug!("preparing environment variables for pipe: {}", pipe);
    let mut env_vars = std::env::vars().collect::<Vec<(String, String)>>();
    env_vars.push((
        "SCREENPIPE_DIR".to_string(),
        screenpipe_dir.to_str().unwrap().to_string(),
    ));
    env_vars.push(("PIPE_ID".to_string(), pipe.to_string()));
    env_vars.push((
        "PIPE_DIR".to_string(),
        pipe_dir.to_str().unwrap().to_string(),
    ));

    if is_nextjs {
        debug!(
            "setting up next.js specific configuration for pipe: {}",
            pipe
        );

        let mut assigned_port = None;

        // Handle Next.js specific setup including crons
        if pipe_json_path.exists() {
            debug!("reading pipe.json for next.js configuration");
            let pipe_json = tokio::fs::read_to_string(&pipe_json_path).await?;
            let pipe_config: Value = serde_json::from_str(&pipe_json)?;

            // Try to use user-configured port first
            if let Some(user_port) = pipe_config.get("port").and_then(|p| p.as_u64()) {
                debug!("found user-configured port: {}", user_port);
                // Verify port is available
                if is_port_available(user_port as u16) {
                    assigned_port = Some(user_port as u16);
                    debug!("user-configured port {} is available", user_port);
                } else {
                    debug!(
                        "user-configured port {} is in use, will assign random port",
                        user_port
                    );
                }
            }

            // Fallback to random port if needed
            let port = assigned_port.unwrap_or_else(|| pick_unused_port().expect("No ports free"));
            info!("[{}] using port {} for next.js pipe", pipe, port);

            // Update pipe.json with the actual port being used
            let mut updated_config = pipe_config.clone();
            updated_config["port"] = json!(port);
            let updated_pipe_json = serde_json::to_string_pretty(&updated_config)?;
            let mut file = File::create(&pipe_json_path).await?;
            file.write_all(updated_pipe_json.as_bytes()).await?;
            info!(
                "[{}] updated pipe.json with port configuration: {}",
                pipe, updated_pipe_json
            );

            env_vars.push(("PORT".to_string(), port.to_string()));

            // Handle cron jobs if they exist
            if let Some(crons) = pipe_config.get("crons").and_then(Value::as_array) {
                info!(
                    "[{}] found {} cron jobs in configuration",
                    pipe,
                    crons.len()
                );
                let base_url = format!("http://localhost:{}", port);
                debug!("[{}] using base url: {} for cron jobs", pipe, base_url);

                let cron_secret = generate_cron_secret();
                debug!("[{}] generated cron secret: {}", pipe, cron_secret);
                env_vars.push(("CRON_SECRET".to_string(), cron_secret.clone()));

                let mut handles = Vec::new();

                for cron in crons {
                    let path = cron["path"]
                        .as_str()
                        .ok_or_else(|| anyhow::anyhow!("missing path"))?
                        .to_string();
                    let schedule = cron["schedule"]
                        .as_str()
                        .ok_or_else(|| anyhow::anyhow!("missing schedule"))?
                        .to_string();

                    let (tx, rx) = watch::channel(false);
                    let handle = CronHandle { shutdown: tx };
                    handles.push(handle);

                    let base_url = base_url.clone();
                    let pipe_clone = pipe.to_string();
                    let secret_clone = cron_secret.clone();
                    let screenpipe_dir = screenpipe_dir.clone();

                    tokio::spawn(async move {
                        run_cron_schedule(
                            &pipe_clone,
                            &base_url,
                            &path,
                            &secret_clone,
                            &schedule,
                            &screenpipe_dir,
                            rx,
                        )
                        .await;
                    });
                }

                // Store handles for later cleanup
                CRON_HANDLES.lock().await.insert(pipe.to_string(), handles);
            }

            // Install dependencies using bun
            info!("[{}] installing dependencies for next.js pipe", pipe);

            let install_output = Command::new(&bun_path)
                .arg("install")
                .current_dir(&pipe_dir)
                .env("NPM_CONFIG_REGISTRY", "https://registry.npmjs.org")
                .env("BUN_CONFIG_REGISTRY", "https://registry.npmjs.org")
                .output()
                .await?;

            if !install_output.status.success() {
                let err_msg = String::from_utf8_lossy(&install_output.stderr);
                error!("[{}] failed to install dependencies: {}", pipe, err_msg);
                let err = anyhow::anyhow!(
                    "failed to install dependencies for next.js pipe: {}",
                    err_msg
                );
                sentry::capture_error(&err.source().unwrap());
                anyhow::bail!(err);
            }
            info!(
                "[{}] successfully installed dependencies for next.js pipe",
                pipe
            );
        } else {
            let port = pick_unused_port().expect("No ports free");
            info!(
                "[{}] no pipe.json found, using random port {} for next.js pipe",
                pipe, port
            );
            env_vars.push(("PORT".to_string(), port.to_string()));
        }

        // Try to build the Next.js project
        let build_status = try_build_nextjs(&pipe_dir, &bun_path).await?;
        let build_success = matches!(build_status, BuildStatus::Success);

        if pipe_json_path.exists() {
            let pipe_json = tokio::fs::read_to_string(&pipe_json_path).await?;
            let mut pipe_config: Value = serde_json::from_str(&pipe_json)?;

            pipe_config["buildStatus"] = match &build_status {
                BuildStatus::Success => json!("success"),
                BuildStatus::Failed(error) => json!({
                    "status": "failed",
                    "error": error
                }),
                BuildStatus::InProgress => json!("in_progress"),
                BuildStatus::NotStarted => json!("not_started"),
            };

            let updated_pipe_json = serde_json::to_string_pretty(&pipe_config)?;
            tokio::fs::write(&pipe_json_path, updated_pipe_json).await?;
        }

        let port = env_vars
            .iter()
            .find(|(k, _)| k == "PORT")
            .map(|(_, v)| v)
            .unwrap()
            .parse::<u16>()
            .expect("Invalid port number");

        // Run the Next.js project
        info!(
            "starting next.js project in {} mode",
            if build_success {
                "production"
            } else {
                "development"
            }
        );

        let mut command = Command::new(&bun_path);
        command.arg("run").arg("--bun");

        if build_success {
            command.arg("start");
        } else {
            info!("[{}] falling back to dev mode due to build failure", pipe);
            command.arg("dev");
        }

        command
            .arg("--port")
            .arg(port.to_string())
            .current_dir(&pipe_dir)
            .envs(env_vars)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = command.spawn()?;

        debug!("[{}] streaming logs for next.js pipe", pipe);
        stream_logs(pipe, &mut child).await?;

        let child_pid = child.id().expect("Failed to get child PID") as u32;
        let parent_pid = std::process::id();

        info!("Spawned bun process with PID: {}", child_pid);

        // Spawn watchdog process
        match spawn_watchdog(parent_pid, child_pid).await {
            Ok(watchdog) => {
                debug!(
                    "Watchdog process spawned successfully with PID: {:?}",
                    watchdog.id()
                );
            }
            Err(e) => {
                warn!("Failed to spawn watchdog process: {}", e);
            }
        }

        return Ok((child, PipeState::Port(port)));
    }

    // If it's not a Next.js project, run as regular pipe
    let main_module = find_pipe_file(&pipe_dir)?;
    info!("[{}] executing pipe: {:?}", pipe, main_module);

    env_vars.push((
        "PIPE_FILE".to_string(),
        main_module.to_str().unwrap().to_string(),
    ));

    let mut child = Command::new(&bun_path)
        .arg("run")
        .arg("--bun")
        .arg(&main_module)
        .envs(env_vars)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    // Stream logs
    stream_logs(pipe, &mut child).await?;

    let child_id = child.id().unwrap();
    Ok((child, PipeState::Pid(child_id as i32))) // Return 0 or handle port differently for non-Next.js projects
}

async fn stream_logs(pipe: &str, child: &mut tokio::process::Child) -> Result<()> {
    let stdout = child.stdout.take().expect("failed to get stdout");
    let stderr = child.stderr.take().expect("failed to get stderr");

    let pipe_clone = pipe.to_string();

    // Spawn tasks to handle stdout and stderr
    let _stdout_handle = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            info!("[{}] {}", pipe_clone, line);
        }
    });

    let pipe_clone = pipe.to_string();

    let _stderr_handle = tokio::spawn(async move {
        // Create static HashMaps for efficient lookups
        static INFO_PATTERNS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
            let mut set = HashSet::new();
            // Development related
            set.insert("Download");
            set.insert("Task dev");
            set.insert("$ next dev");
            set.insert("ready started server");
            set.insert("Local:");
            set.insert("Webpack is configured");
            set.insert("See instructions");
            set.insert("https://nextjs.org");
            set.insert("⚠ See instructions");
            set.insert("$ next start");
            set.insert("[bun install]");
            set.insert("Saved lockfile");
            set.insert("Resolved, downloaded");
            set.insert("Installing");
            set.insert("Successfully installed");
            set.insert("packages installed");
            set.insert("Fetching");
            set.insert("Resolving");
            // Frontend console patterns
            set.insert("[LOG]");
            set.insert("console.log");
            set.insert("] ");
            set.insert("›");
            set.insert("<");
            set.insert("Warning:");
            set.insert("render@");
            set.insert("webpack");
            set.insert("HMR");
            set.insert("[HMR]");
            set
        });

        static ERROR_PATTERNS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
            let mut set = HashSet::new();
            set.insert("TypeError:");
            set.insert("ReferenceError:");
            set.insert("SyntaxError:");
            set.insert("Error:");
            set.insert("Uncaught");
            set.insert("Failed to compile");
            set.insert("ENOENT");
            set.insert("FATAL");
            set
        });

        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let line_lower = line.to_lowercase(); // Convert once for case-insensitive matching

            // Quick checks first
            if line.trim().is_empty() || line.contains("console.") {
                info!("[{}] {}", pipe_clone, line);
                continue;
            }

            // Check for error patterns first (higher priority)
            if ERROR_PATTERNS
                .iter()
                .any(|&pattern| line_lower.contains(&pattern.to_lowercase()))
            {
                error!("[{}] {}", pipe_clone, line);
                sentry::capture_message(
                    &format!("[{}] {}", pipe_clone, line),
                    sentry::Level::Error,
                );
                continue;
            }

            // Then check for info patterns
            if INFO_PATTERNS
                .iter()
                .any(|&pattern| line_lower.contains(&pattern.to_lowercase()))
            {
                info!("[{}] {}", pipe_clone, line);
                continue;
            }

            // Default to warning for unknown patterns
            warn!("[{}] {}", pipe_clone, line);
        }
    });

    info!("pipe execution completed successfully [{}]", pipe);
    Ok(())
}

// Add this helper function for retrying installations
async fn retry_install(bun_path: &Path, dest_dir: &Path, max_retries: u32) -> Result<()> {
    let mut attempt = 0;
    let mut last_error = None;

    while attempt < max_retries {
        let mut install_child = Command::new(bun_path)
            .arg("i")
            .current_dir(dest_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        // Stream logs for npm install
        if let Ok(()) = stream_logs("bun install", &mut install_child).await {
            let status = install_child.wait().await?;
            if status.success() {
                return Ok(());
            }
        }

        attempt += 1;
        let delay = std::time::Duration::from_secs(2u64.pow(attempt)); // exponential backoff
        error!(
            "install attempt {} failed, retrying in {} seconds",
            attempt,
            delay.as_secs()
        );
        tokio::time::sleep(delay).await;
        last_error = Some(anyhow::anyhow!(
            "installation failed after {} attempts",
            attempt
        ));
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("installation failed")))
}

pub async fn download_pipe(source: &str, screenpipe_dir: PathBuf) -> anyhow::Result<PathBuf> {
    info!("Processing pipe from source: {}", source);

    let is_local = Url::parse(source).is_err();

    let mut pipe_name =
        sanitize_pipe_name(Path::new(source).file_name().unwrap().to_str().unwrap());

    // Add _local suffix for local pipes
    if is_local {
        pipe_name.push_str("_local");
    }

    let dest_dir = screenpipe_dir.join("pipes").join(&pipe_name);

    debug!("Destination directory: {:?}", dest_dir);

    // Save existing pipe.json content before downloading
    let pipe_json_path = dest_dir.join("pipe.json");
    let existing_config = if pipe_json_path.exists() {
        debug!("Existing pipe.json found");
        let content = tokio::fs::read_to_string(&pipe_json_path).await?;
        Some(serde_json::from_str::<Value>(&content)?)
    } else {
        debug!("No existing pipe.json found");
        None
    };

    // Create temp directory for download
    let temp_dir = dest_dir.with_extension("_temp");
    tokio::fs::create_dir_all(&temp_dir).await?;

    // Download to temp directory first
    let download_result = if let Ok(parsed_url) = Url::parse(source) {
        debug!("Source is a URL: {}", parsed_url);
        if parsed_url.host_str() == Some("github.com") {
            download_github_folder(&parsed_url, &temp_dir).await
        } else {
            anyhow::bail!("Unsupported URL format");
        }
    } else {
        debug!("Source is a local path");
        let source_path = Path::new(source);
        if !source_path.exists() || !source_path.is_dir() {
            anyhow::bail!("Invalid local source path");
        }
        copy_dir_all(source_path, &temp_dir).await
    };

    // remove temp dir if download failed
    if let Err(e) = download_result {
        tokio::fs::remove_dir_all(&temp_dir).await?;
        error!("Failed to download pipe: {}", e);
    }

    // If download successful, move temp dir to final location
    if dest_dir.exists() {
        tokio::fs::remove_dir_all(&dest_dir).await?;
    }
    tokio::fs::rename(&temp_dir, &dest_dir).await?;

    // Restore or merge pipe.json if needed
    if let Some(ref existing_config) = existing_config {
        let new_config_path = dest_dir.join("pipe.json");
        if new_config_path.exists() {
            let content = tokio::fs::read_to_string(&new_config_path).await?;
            let new_json: Value = serde_json::from_str(&content)?;

            // Create merged config
            let mut merged_config = new_json.clone(); // Start with new schema

            // If both configs have fields array, preserve user values
            if let (Some(existing_obj), Some(new_obj)) =
                (existing_config.as_object(), merged_config.as_object_mut())
            {
                // Copy over non-fields properties from existing config
                for (key, value) in existing_obj {
                    if key != "fields" {
                        new_obj.insert(key.clone(), value.clone());
                    }
                }

                // For fields array, preserve user values while keeping new schema
                if let (Some(existing_fields), Some(new_fields)) = (
                    existing_config["fields"].as_array(),
                    new_obj.get_mut("fields").and_then(|f| f.as_array_mut()),
                ) {
                    // For each field in the new schema
                    for new_field in new_fields {
                        if let Some(name) = new_field.get("name").and_then(Value::as_str) {
                            // If this field existed in the old config, preserve its value
                            if let Some(existing_field) = existing_fields
                                .iter()
                                .find(|f| f.get("name").and_then(Value::as_str) == Some(name))
                            {
                                if let Some(user_value) = existing_field.get("value") {
                                    if let Some(new_field_obj) = new_field.as_object_mut() {
                                        new_field_obj
                                            .insert("value".to_string(), user_value.clone());
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let config_str = serde_json::to_string_pretty(&merged_config)?;
            tokio::fs::write(&new_config_path, config_str).await?;
        } else {
            // If no new config exists, keep the existing one
            let config_str = serde_json::to_string_pretty(&existing_config)?;
            tokio::fs::write(&new_config_path, config_str).await?;
        }
    }

    // After downloading/copying the pipe, check if it's a Next.js project
    let package_json_path = dest_dir.join("package.json");
    if package_json_path.exists() {
        let package_json = tokio::fs::read_to_string(&package_json_path).await?;
        let package_data: Value = serde_json::from_str(&package_json)?;

        let bun_path = find_bun_path().ok_or_else(|| anyhow::anyhow!("bun not found"))?;

        // Make bun install mandatory for all package.json pipes with retries
        retry_install(&bun_path, &dest_dir, 3).await?;

        if package_data["dependencies"].get("next").is_some() {
            info!("Detected Next.js project, setting up for production");
            // Update pipe.json to indicate it's a Next.js project
            let mut pipe_config = if let Some(existing_json) = &existing_config {
                existing_json.clone()
            } else if pipe_json_path.exists() {
                let pipe_json = tokio::fs::read_to_string(&pipe_json_path).await?;
                serde_json::from_str(&pipe_json)?
            } else {
                json!({})
            };

            pipe_config["is_nextjs"] = json!(true);
            pipe_config["buildStatus"] = json!("not_started");
            let updated_pipe_json = serde_json::to_string_pretty(&pipe_config)?;
            let mut file = File::create(&pipe_json_path).await?;
            file.write_all(updated_pipe_json.as_bytes()).await?;
        }
    }

    info!("pipe copied successfully to: {:?}", dest_dir);
    Ok(dest_dir)
}

async fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> anyhow::Result<()> {
    let src = src.as_ref();
    let dst = dst.as_ref();
    debug!("copy_dir_all: src={:?}, dst={:?}", src, dst);

    tokio::fs::create_dir_all(&dst).await?;
    debug!("Created destination directory: {:?}", dst);

    let mut entries = tokio::fs::read_dir(src).await?;
    debug!("Reading source directory: {:?}", src);

    while let Some(entry) = entries.next_entry().await? {
        let ty = entry.file_type().await?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        debug!("Processing entry: {:?}", src_path);

        if should_ignore(&entry.file_name()) {
            debug!("Skipping ignored file/directory: {:?}", entry.file_name());
            continue;
        }

        if ty.is_dir() {
            debug!("Entry is a directory, recursing: {:?}", src_path);
            copy_dir_all_boxed(src_path, dst_path).await?;
        } else {
            debug!("Copying file: {:?} to {:?}", src_path, dst_path);
            tokio::fs::copy(&src_path, &dst_path).await?;
        }
    }

    debug!("Finished copying directory: {:?}", src);
    Ok(())
}

fn copy_dir_all_boxed(
    src: impl AsRef<Path> + Send + 'static,
    dst: impl AsRef<Path> + Send + 'static,
) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send>> {
    Box::pin(copy_dir_all(src, dst))
}

fn should_ignore(file_name: &std::ffi::OsStr) -> bool {
    let ignore_list = [
        "node_modules",
        ".git",
        ".next",
        "dist",
        "build",
        ".DS_Store",
        "Thumbs.db",
        ".env",
        ".env.local",
        ".env.development.local",
        ".env.test.local",
        ".env.production.local",
    ];

    ignore_list.iter().any(|ignored| file_name == *ignored)
        || file_name.to_str().is_some_and(|s| s.starts_with('.'))
}

fn download_github_folder(
    url: &Url,
    dest_dir: &Path,
) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send>> {
    let url = url.clone();
    let dest_dir = dest_dir.to_path_buf();

    Box::pin(async move {
        // Create a cached client
        let client = ClientBuilder::new(Client::new())
            .with(Cache(HttpCache {
                mode: CacheMode::Default,
                manager: CACacheManager {
                    path: home_dir()
                        .unwrap()
                        .join(".screenpipe")
                        .join(".http-cacache"),
                },
                options: HttpCacheOptions::default(),
            }))
            .build();

        let api_url = get_raw_github_url(url.as_str())?;
        debug!("using github api url: {}", api_url);

        let response = client
            .get(&api_url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "screenpipe")
            .send()
            .await?;

        debug!(
            "GitHub API cache hit: {:?}",
            response.headers().get("x-cache")
        );

        let contents: Value = response.text().await?.parse()?;
        let tree = contents["tree"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("invalid response from github api"))?;

        // Extract repo info from URL
        let path_segments: Vec<&str> = url.path_segments().unwrap().collect();
        let (owner, repo, _, branch) = (
            path_segments[0],
            path_segments[1],
            path_segments[2],
            path_segments[3],
        );

        // Extract the base path for subfolder downloads
        let base_path = url
            .path_segments()
            .and_then(|segments| {
                let segments: Vec<_> = segments.collect();
                if segments.len() >= 5 && segments[2] == "tree" {
                    Some(segments[4..].join("/"))
                } else {
                    None
                }
            })
            .unwrap_or_default();

        debug!("base path for download: {}", base_path);

        // Process all files in parallel
        let mut tasks = Vec::new();

        for item in tree {
            let path = item["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("missing path in github response"))?;

            // Skip if file is not in the target directory
            if !path.starts_with(&base_path) {
                continue;
            }

            let file_name = Path::new(path)
                .file_name()
                .ok_or_else(|| anyhow::anyhow!("invalid path"))?;

            // Skip hidden files and ignored directories
            if should_ignore(file_name) {
                debug!("skipping ignored file/directory: {}", path);
                continue;
            }

            let item_type = item["type"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("missing type in github response"))?;

            if item_type == "blob" {
                // Calculate relative path from base_path
                let relative_path = if let Some(stripped) = path.strip_prefix(&base_path) {
                    stripped.trim_start_matches('/')
                } else {
                    path
                };

                let file_dest = dest_dir.join(relative_path);
                let client = client.clone();

                // Use raw.githubusercontent.com URL
                let raw_url = format!(
                    "https://raw.githubusercontent.com/{}/{}/{}/{}",
                    owner, repo, branch, path
                );

                // Create task for parallel download
                tasks.push(tokio::spawn(async move {
                    if let Some(parent) = file_dest.parent() {
                        tokio::fs::create_dir_all(parent).await?;
                    }

                    let file_content = client.get(&raw_url).send().await?.bytes().await?;
                    tokio::fs::write(&file_dest, &file_content).await?;
                    debug!("downloaded file: {:?}", file_dest);
                    Ok::<_, anyhow::Error>(())
                }));
            }
        }

        // Wait for all downloads to complete
        for task in tasks {
            task.await??;
        }

        Ok(())
    })
}

fn get_raw_github_url(url: &str) -> anyhow::Result<String> {
    debug!("Attempting to get raw GitHub URL for: {}", url);
    let parsed_url = Url::parse(url)?;
    if parsed_url.host_str() == Some("github.com") {
        let path_segments: Vec<&str> = parsed_url.path_segments().unwrap().collect();
        if path_segments.len() >= 4 && path_segments.contains(&"tree") {
            // Find the position of "tree" in the path
            let tree_pos = path_segments.iter().position(|&s| s == "tree").unwrap();

            let owner = path_segments[0];
            let repo = path_segments[1];

            // The branch is just the segment after "tree"
            let branch = path_segments[tree_pos + 1];

            let raw_url = format!(
                "https://api.github.com/repos/{}/{}/git/trees/{}?recursive=1",
                owner, repo, branch
            );
            debug!("Converted to GitHub API URL: {}", raw_url);
            return Ok(raw_url);
        }
    }
    anyhow::bail!("Invalid GitHub URL format")
}

fn find_pipe_file(pipe_dir: &Path) -> anyhow::Result<PathBuf> {
    for entry in fs::read_dir(pipe_dir)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let file_name_str = file_name.to_str().unwrap();
        if (file_name_str == "pipe.js" || file_name_str == "pipe.ts") && !is_hidden_file(&file_name)
        {
            return Ok(entry.path());
        }
    }
    anyhow::bail!("No pipe.js/pipe.ts found in the pipe/dist directory")
}

fn is_hidden_file(file_name: &std::ffi::OsStr) -> bool {
    file_name
        .to_str()
        .map(|s| s.starts_with('.') || s == "Thumbs.db")
        .unwrap_or(false)
}

#[cfg(not(windows))]
const BUN_EXECUTABLE_NAME: &str = "bun";

#[cfg(windows)]
const BUN_EXECUTABLE_NAME: &str = "bun.exe";

static BUN_PATH: Lazy<Option<PathBuf>> = Lazy::new(find_bun_path_internal);

pub fn find_bun_path() -> Option<PathBuf> {
    BUN_PATH.as_ref().map(|p| p.clone())
}

fn find_bun_path_internal() -> Option<PathBuf> {
    debug!("starting search for bun executable");

    // Check in executable directory (eg tauri etc.)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_folder) = exe_path.parent() {
            debug!("executable folder: {:?}", exe_folder);
            let bun_in_exe_folder = exe_folder.join(BUN_EXECUTABLE_NAME);
            if bun_in_exe_folder.exists() {
                debug!("found bun in executable folder: {:?}", bun_in_exe_folder);
                return Some(bun_in_exe_folder);
            }
            debug!("bun not found in executable folder");

            // Platform-specific checks
            #[cfg(target_os = "macos")]
            {
                let resources_folder = exe_folder.join("../Resources");
                debug!("resources folder: {:?}", resources_folder);
                let bun_in_resources = resources_folder.join(BUN_EXECUTABLE_NAME);
                if bun_in_resources.exists() {
                    debug!("found bun in resources folder: {:?}", bun_in_resources);
                    return Some(bun_in_resources);
                }
                debug!("bun not found in resources folder");
            }

            #[cfg(target_os = "linux")]
            {
                let lib_folder = exe_folder.join("lib");
                debug!("lib folder: {:?}", lib_folder);
                let bun_in_lib = lib_folder.join(BUN_EXECUTABLE_NAME);
                if bun_in_lib.exists() {
                    debug!("found bun in lib folder: {:?}", bun_in_lib);
                    return Some(bun_in_lib);
                }
                debug!("bun not found in lib folder");
            }
        }
    }

    // Check if bun is in PATH
    if let Ok(path) = which(BUN_EXECUTABLE_NAME) {
        debug!("found bun in PATH: {:?}", path);
        return Some(path);
    }
    debug!("bun not found in PATH");

    // Check in current working directory
    if let Ok(cwd) = std::env::current_dir() {
        debug!("current working directory: {:?}", cwd);
        let bun_in_cwd = cwd.join(BUN_EXECUTABLE_NAME);
        if bun_in_cwd.is_file() && bun_in_cwd.exists() {
            debug!("found bun in current working directory: {:?}", bun_in_cwd);
            return Some(bun_in_cwd);
        }
        debug!("bun not found in current working directory");
    }

    error!("bun not found");
    None
}

// Add this function to handle cron state persistence
pub async fn get_last_cron_execution(pipe_dir: &Path, path: &str) -> Result<Option<SystemTime>> {
    let state_file = pipe_dir.join(".cron_state.json");

    if !state_file.exists() {
        return Ok(None);
    }

    let content = tokio::fs::read_to_string(state_file).await?;
    let state: Value = serde_json::from_str(&content)?;

    if let Some(last_run) = state.get(path).and_then(|v| v.as_u64()) {
        Ok(Some(UNIX_EPOCH + std::time::Duration::from_secs(last_run)))
    } else {
        Ok(None)
    }
}

// Add this function to save cron execution time
pub async fn save_cron_execution(pipe_dir: &Path, path: &str) -> Result<()> {
    let state_file = pipe_dir.join(".cron_state.json");

    let mut state: Value = if state_file.exists() {
        let content = tokio::fs::read_to_string(&state_file).await?;
        serde_json::from_str(&content)?
    } else {
        json!({})
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    if let Some(obj) = state.as_object_mut() {
        obj.insert(path.to_string(), json!(now));
    }

    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(state_file)
        .await?;

    file.write_all(serde_json::to_string_pretty(&state)?.as_bytes())
        .await?;
    Ok(())
}

// Update the run_cron_schedule function
async fn run_cron_schedule(
    pipe: &str,
    base_url: &str,
    path: &str,
    secret: &str,
    schedule: &str,
    screenpipe_dir: &Path,
    mut shutdown: watch::Receiver<bool>,
) {
    let schedule = match cron::Schedule::from_str(schedule) {
        Ok(s) => s,
        Err(e) => {
            let err_msg = format!("invalid cron schedule: {}", e);
            error!("{}", err_msg);
            sentry::capture_error(&anyhow::anyhow!(err_msg).source().unwrap());
            return;
        }
    };

    let client = Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", secret)).unwrap(),
    );

    // Get pipe directory for state persistence
    let pipe_dir = screenpipe_dir.join("pipes").join(pipe);

    loop {
        // Get last execution time at the start of each loop
        let last_run = match get_last_cron_execution(&pipe_dir, path).await {
            Ok(time) => time,
            Err(e) => {
                error!("failed to get last cron execution: {}", e);
                None
            }
        };

        let now = chrono::Local::now();
        let next = if let Some(last) = last_run {
            // Get next occurrence after the last execution
            let last_chrono = chrono::DateTime::<chrono::Local>::from(last);
            schedule.after(&last_chrono).next()
        } else {
            schedule.after(&now).next()
        };

        let next = match next {
            Some(next) => next,
            None => {
                error!("no next execution time found for cron schedule");
                break;
            }
        };

        if next <= now {
            info!("next execution time is before or equal to the current time, recalculating...");
            continue;
        }
        let duration = match (next - now).to_std() {
            Ok(duration) => duration,
            Err(e) => {
                error!("invalid duration: {}", e);
                continue; // falling back to minute is messing with cron schedule
            }
        };

        info!(
            "next cron execution for pipe {} at path {} in {} seconds",
            pipe,
            path,
            duration.as_secs()
        );

        // Wait for either the next execution time or shutdown signal
        tokio::select! {
            _ = tokio::time::sleep(duration) => {
                info!("executing cron job for pipe {} at path {}", pipe, path);
                match client
                    .get(format!("{}{}", base_url, path))
                    .headers(headers.clone())
                    .send()
                    .await
                {
                    Ok(res) => {
                        if !res.status().is_success() {
                            let err_msg = format!("cron job failed with status: {}", res.status());
                            error!("{}", err_msg);
                            if let Ok(text) = res.text().await {
                                error!("error response: {}", text);
                                sentry::capture_message(
                                    &format!("{}: {}", err_msg, text),
                                    sentry::Level::Error
                                );
                            } else {
                                sentry::capture_message(&err_msg, sentry::Level::Error);
                            }
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("failed to execute cron job: {}", e);
                        error!("{}", err_msg);
                        sentry::capture_error(&e);
                    }
                }
            }
            Ok(()) = shutdown.changed() => {
                if *shutdown.borrow() {
                    info!("shutting down cron job for pipe at path: {}", path);
                    break;
                }
            }
        }
    }
}

pub async fn cleanup_pipe_crons(pipe: &str) -> Result<()> {
    if let Some(handles) = CRON_HANDLES.lock().await.remove(pipe) {
        info!("cleaning up {} cron jobs for pipe {}", handles.len(), pipe);
        for handle in handles {
            handle.stop();
        }
        info!("stopped all cron jobs for pipe: {}", pipe);
    }
    Ok(())
}

async fn try_build_nextjs(pipe_dir: &Path, bun_path: &Path) -> Result<BuildStatus> {
    info!(
        "checking if i need to build the next.js project in: {:?}",
        pipe_dir
    );

    // Check if build already exists and is valid
    let build_dir = pipe_dir.join(".next");
    if build_dir.exists() {
        let build_manifest = build_dir.join("build-manifest.json");
        if build_manifest.exists() {
            info!("found existing next.js build, skipping rebuild");
            return Ok(BuildStatus::Success);
        }
        // Invalid/incomplete build directory - remove it
        debug!("removing invalid next.js build directory");
        tokio::fs::remove_dir_all(&build_dir).await?;
    }

    // Update build status to InProgress in pipe.json
    let pipe_json_path = pipe_dir.join("pipe.json");
    if pipe_json_path.exists() {
        let pipe_json = tokio::fs::read_to_string(&pipe_json_path).await?;
        let mut pipe_config: Value = serde_json::from_str(&pipe_json)?;
        pipe_config["buildStatus"] = json!("in_progress");
        let updated_pipe_json = serde_json::to_string_pretty(&pipe_config)?;
        tokio::fs::write(&pipe_json_path, updated_pipe_json).await?;
    }

    info!("running next.js build");
    let build_output = Command::new(bun_path)
        .arg("run")
        .arg("--bun")
        .arg("build")
        .current_dir(pipe_dir)
        .output()
        .await?;

    if build_output.status.success() {
        info!("next.js build completed successfully");
        Ok(BuildStatus::Success)
    } else {
        let error_message = String::from_utf8_lossy(&build_output.stderr).to_string();
        error!("next.js build failed: {}", error_message);
        Ok(BuildStatus::Failed(error_message))
    }
}

// Add this helper function to check if a port is available
fn is_port_available(port: u16) -> bool {
    use std::net::TcpListener;
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

pub async fn download_pipe_private(
    pipe_name: &str,
    source: &str,
    screenpipe_dir: PathBuf,
) -> anyhow::Result<PathBuf> {
    info!("processing private pipe from zip: {}", source);

    let dest_dir = screenpipe_dir.join("pipes").join(&pipe_name);
    debug!("destination directory: {:?}", dest_dir);

    // Create temp directory for download
    let temp_dir = dest_dir.with_extension("_temp");
    tokio::fs::create_dir_all(&temp_dir).await?;

    // Create initial pipe.json in temp directory with download status
    let temp_pipe_json = temp_dir.join("pipe.json");
    let initial_config = json!({
        "buildStatus": {
            "status": "in_progress",
            "step": "downloading",
        }
    });
    tokio::fs::write(
        &temp_pipe_json,
        serde_json::to_string_pretty(&initial_config)?,
    )
    .await?;

    // Helper function to update build status
    async fn update_build_status(
        path: &Path,
        status: &str,
        step: &str,
        error: Option<&str>,
    ) -> anyhow::Result<()> {
        if path.exists() {
            let pipe_json = tokio::fs::read_to_string(path).await?;
            let mut pipe_config: Value = serde_json::from_str(&pipe_json)?;
            pipe_config["buildStatus"] = match error {
                Some(err) => json!({
                    "status": status,
                    "step": step,
                    "error": err
                }),
                None => json!({
                    "status": status,
                    "step": step
                }),
            };
            let updated_pipe_json = serde_json::to_string_pretty(&pipe_config)?;
            tokio::fs::write(path, updated_pipe_json).await?;
        }
        Ok(())
    }

    // Cleanup function
    async fn cleanup_temp(temp_dir: &Path, temp_zip: &Path) -> anyhow::Result<()> {
        if temp_zip.exists() {
            if let Err(e) = tokio::fs::remove_file(temp_zip).await {
                warn!("Failed to remove temporary zip file: {}", e);
            }
        }
        if temp_dir.exists() {
            if let Err(e) = tokio::fs::remove_dir_all(temp_dir).await {
                warn!("Failed to remove temporary directory: {}", e);
            }
        }
        Ok(())
    }

    // Download zip file
    debug!("downloading zip file from: {}", source);
    let client = Client::new();
    let response = match client.get(source).send().await {
        Ok(res) => res,
        Err(e) => {
            let err_msg = format!("Failed to download zip: {}", e);
            error!("{}", err_msg);
            cleanup_temp(&temp_dir, &temp_dir.join("temp.zip")).await?;
            return Err(anyhow::anyhow!(err_msg));
        }
    };

    let zip_content = match response.bytes().await {
        Ok(content) => content,
        Err(e) => {
            let err_msg = format!("Failed to read zip content: {}", e);
            error!("{}", err_msg);
            cleanup_temp(&temp_dir, &temp_dir.join("temp.zip")).await?;
            return Err(anyhow::anyhow!(err_msg));
        }
    };

    // Create temporary zip file
    let temp_zip = temp_dir.join("temp.zip");
    if let Err(e) = tokio::fs::write(&temp_zip, &zip_content).await {
        let err_msg = format!("Failed to write temporary zip file: {}", e);
        error!("{}", err_msg);
        cleanup_temp(&temp_dir, &temp_zip).await?;
        return Err(anyhow::anyhow!(err_msg));
    }

    // Update status before extraction
    let temp_pipe_json = temp_dir.join("pipe.json");
    update_build_status(&temp_pipe_json, "in_progress", "extracting", None).await?;

    // Unzip the file
    debug!("unzipping file to temp directory");
    let temp_zip_path = temp_zip.clone();
    let temp_dir_path = temp_dir.clone();

    let extraction_result = tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let zip_file = std::fs::File::open(&temp_zip_path)?;
        let mut archive = zip::ZipArchive::new(zip_file)?;
        let total_files = archive.len();

        for i in 0..total_files {
            let mut file = archive.by_index(i)?;
            let name = file.name().to_string();

            // Check for zip slip vulnerability
            if name.contains("..") {
                return Err(anyhow::anyhow!(
                    "Invalid zip file: potential path traversal attack"
                ));
            }

            let outpath = temp_dir_path.join(&name);
            if name.ends_with('/') {
                std::fs::create_dir_all(&outpath)?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(p)?;
                    }
                }
                let mut outfile = std::fs::File::create(&outpath)?;
                std::io::copy(&mut file, &mut outfile)?;
            }
        }
        Ok(())
    })
    .await;

    // Handle extraction errors
    if let Err(e) = extraction_result {
        let err_msg = format!("Extraction task failed: {}", e);
        error!("{}", err_msg);
        update_build_status(&temp_pipe_json, "error", "extracting", Some(&err_msg)).await?;
        cleanup_temp(&temp_dir, &temp_zip).await?;
        return Err(anyhow::anyhow!(err_msg));
    }

    if let Err(e) = extraction_result.unwrap() {
        let err_msg = format!("Failed to extract zip: {}", e);
        error!("{}", err_msg);
        update_build_status(&temp_pipe_json, "error", "extracting", Some(&err_msg)).await?;
        cleanup_temp(&temp_dir, &temp_zip).await?;
        return Err(anyhow::anyhow!(err_msg));
    }

    // Remove the temporary zip file
    if let Err(e) = tokio::fs::remove_file(&temp_zip).await {
        warn!("Failed to remove temporary zip file: {}", e);
    }

    // Move temp dir to final location
    if dest_dir.exists() {
        if let Err(e) = tokio::fs::remove_dir_all(&dest_dir).await {
            let err_msg = format!("Failed to remove existing destination directory: {}", e);
            error!("{}", err_msg);
            cleanup_temp(&temp_dir, &temp_zip).await?;
            return Err(anyhow::anyhow!(err_msg));
        }
    }

    if let Err(e) = tokio::fs::rename(&temp_dir, &dest_dir).await {
        let err_msg = format!("Failed to move files to destination: {}", e);
        error!("{}", err_msg);
        cleanup_temp(&temp_dir, &temp_zip).await?;
        return Err(anyhow::anyhow!(err_msg));
    }

    // Update status for installation
    let final_pipe_json = dest_dir.join("pipe.json");
    update_build_status(&final_pipe_json, "in_progress", "installing", None).await?;

    // Check if it's a Next.js project and handle installation
    let package_json_path = dest_dir.join("package.json");
    let is_nextjs = if package_json_path.exists() {
        let package_json = tokio::fs::read_to_string(&package_json_path).await?;
        let package_data: Value = serde_json::from_str(&package_json)?;
        package_data["dependencies"].get("next").is_some()
    } else {
        false
    };

    // Find bun path
    let bun_path = find_bun_path().ok_or_else(|| anyhow::anyhow!("bun not found"))?;

    // Run bun install with error handling
    info!("installing dependencies");
    if let Err(e) = retry_install(&bun_path, &dest_dir, 3).await {
        let err_msg = format!("Failed to install dependencies: {}", e);
        error!("{}", err_msg);
        update_build_status(&final_pipe_json, "error", "installing", Some(&err_msg)).await?;
        return Err(anyhow::anyhow!(err_msg));
    }

    if is_nextjs {
        info!("detected next.js project, updating configuration");
        if final_pipe_json.exists() {
            let pipe_json = tokio::fs::read_to_string(&final_pipe_json).await?;
            let mut pipe_config: Value = serde_json::from_str(&pipe_json)?;
            pipe_config["is_nextjs"] = json!(true);
            pipe_config["buildStatus"] = json!({
                "status": "success",
                "step": "completed"
            });
            let updated_pipe_json = serde_json::to_string_pretty(&pipe_config)?;
            tokio::fs::write(&final_pipe_json, updated_pipe_json).await?;
        }
    } else {
        // Update final success status for non-Next.js projects
        update_build_status(&final_pipe_json, "success", "completed", None).await?;
    }

    info!("pipe downloaded and set up successfully at: {:?}", dest_dir);
    Ok(dest_dir)
}
