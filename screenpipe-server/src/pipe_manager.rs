use anyhow::Result;
use screenpipe_core::{download_pipe, download_pipe_private, PipeState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc::{self, Sender};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PipeInfo {
    pub id: String,
    pub enabled: bool,
    pub config: Value,
    pub source: String,
    pub port: Option<u16>,
    pub is_nextjs: bool,
    pub desc: String,
    pub build_status: Option<Value>,
}

struct PipeHandle {
    state: PipeState,
    kill_tx: Sender<()>,
}

pub struct PipeManager {
    screenpipe_dir: PathBuf,
    running_pipes: Arc<RwLock<HashMap<String, PipeHandle>>>,
}

impl PipeManager {
    pub fn new(screenpipe_dir: PathBuf) -> Self {
        PipeManager {
            screenpipe_dir,
            running_pipes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn update_config(&self, id: &str, new_config: Value) -> Result<()> {
        debug!("Updating config for pipe: {}", id);
        let pipe_dir = self.screenpipe_dir.join("pipes").join(id);

        if !pipe_dir.exists() {
            return Err(anyhow::anyhow!("pipe '{}' does not exist", id));
        }

        let config_path = pipe_dir.join("pipe.json");

        let mut config: Value = if config_path.exists() {
            let config_str = tokio::fs::read_to_string(&config_path).await?;
            serde_json::from_str(&config_str)?
        } else {
            tokio::fs::create_dir_all(&pipe_dir).await?;
            serde_json::json!({
                "id": id,
                "enabled": false
            })
        };

        debug!("config: {}", config);

        let was_enabled = if config_path.exists() {
            let old_config: Value =
                serde_json::from_str(&tokio::fs::read_to_string(&config_path).await?)?;
            old_config
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        } else {
            false
        };

        let is_enabled = new_config.get("enabled").and_then(Value::as_bool);

        debug!("is_enabled: {}", is_enabled.unwrap_or(false));

        // Handle both top-level properties and nested fields
        if let Value::Object(existing_config) = &mut config {
            if let Value::Object(updates) = new_config {
                // Update top-level properties
                for (key, value) in updates.iter() {
                    if key != "fields" {
                        // Handle non-fields properties directly
                        existing_config.insert(key.clone(), value.clone());
                    }
                }

                // Handle fields separately if they exist
                if let Some(Value::Array(new_fields)) = updates.get("fields") {
                    existing_config.insert("fields".to_string(), Value::Array(new_fields.clone()));
                }
            } else {
                return Err(anyhow::anyhow!("new configuration must be an object"));
            }
        } else {
            return Err(anyhow::anyhow!("existing configuration is not an object"));
        }

        let updated_config_str = serde_json::to_string_pretty(&config)?;

        let mut file = File::create(&config_path).await?;
        file.write_all(updated_config_str.as_bytes()).await?;

        // Handle pipe state changes
        if let Some(enabled) = is_enabled {
            match (was_enabled, enabled) {
                (false, true) => {
                    let future = self.start_pipe_task(id.to_string()).await?;
                    tokio::spawn(future);

                    info!("pipe {} enabled", id);
                }
                (true, false) => {
                    self.stop_pipe(id).await?;

                    info!("pipe {} disabled", id);
                }
                (true, true) => {
                    self.stop_pipe(id).await?;

                    let future = self.start_pipe_task(id.to_string()).await?;
                    tokio::spawn(future);

                    info!("pipe {} restarted", id);
                }
                (false, false) => {} // No state change needed
            }
        }

        Ok(())
    }

    pub async fn get_pipe_info(&self, id: &str) -> Option<PipeInfo> {
        let pipes = self.list_pipes().await;
        pipes.iter().find(|pipe| pipe.id == id).cloned()
    }

    async fn load_pipe_info(pipe_id: String, pipe_path: PathBuf) -> PipeInfo {
        let config_path = pipe_path.join("pipe.json");
        let config = tokio::fs::read_to_string(&config_path)
            .await
            .and_then(|s| serde_json::from_str::<Value>(&s).map_err(Into::into))
            .unwrap_or(Value::Null);

        let desc_file = pipe_path.join("README.md");
        let desc_pipe = tokio::fs::read_to_string(desc_file)
            .await
            .unwrap_or_default();

        PipeInfo {
            id: pipe_id,
            enabled: config
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            source: config
                .get("source")
                .unwrap_or(&Value::Null)
                .as_str()
                .unwrap_or("")
                .to_string(),
            config: config.clone(),
            port: config
                .get("port")
                .and_then(Value::as_u64)
                .and_then(|p| u16::try_from(p).ok()),
            is_nextjs: config
                .get("is_nextjs")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            desc: desc_pipe,
            build_status: config.get("buildStatus").cloned(),
        }
    }

    pub async fn list_pipes(&self) -> Vec<PipeInfo> {
        let pipe_dir = self.screenpipe_dir.join("pipes");
        let mut pipe_infos = Vec::new();

        if let Ok(mut entries) = tokio::fs::read_dir(pipe_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let file_name = entry.file_name();
                let pipe_id = file_name.to_string_lossy();

                // ignore hidden directories and files
                if !pipe_id.starts_with('.')
                    && entry
                        .file_type()
                        .await
                        .map(|ft| ft.is_dir())
                        .unwrap_or(false)
                {
                    pipe_infos.push(Self::load_pipe_info(pipe_id.into_owned(), entry.path()).await);
                }
            }
        }

        pipe_infos
    }

    pub async fn download_pipe(&self, url: &str) -> Result<String> {
        // Remove any surrounding quotes and normalize backslashes
        let normalized_url = url.trim_matches('"').replace("\\", "/");

        let pipe_dir = download_pipe(&normalized_url, self.screenpipe_dir.clone()).await?;

        // update the config with the source url
        self.update_config(
            &pipe_dir.file_name().unwrap().to_string_lossy(),
            serde_json::json!({
                "source": normalized_url,
                "enabled": true, // always enable the pipe
            }),
        )
        .await?;

        info!(
            "pipe {} downloaded",
            pipe_dir.file_name().unwrap().to_string_lossy()
        );

        Ok(pipe_dir.file_name().unwrap().to_string_lossy().into_owned())
    }

    pub async fn download_pipe_private(
        &self,
        url: &str,
        pipe_name: &str,
        pipe_id: &str,
    ) -> Result<String> {
        let pipe_dir = download_pipe_private(pipe_name, url, self.screenpipe_dir.clone()).await?;

        let package_json_path = pipe_dir.join("package.json");
        let version = if package_json_path.exists() {
            let package_json = tokio::fs::read_to_string(&package_json_path).await?;
            let package_data: Value = serde_json::from_str(&package_json)?;
            package_data["version"]
                .as_str()
                .unwrap_or("1.0.0")
                .to_string()
        } else {
            "1.0.0".to_string()
        };

        // update the config with the source url and version
        self.update_config(
            &pipe_dir.file_name().unwrap().to_string_lossy(),
            serde_json::json!({
                "source": "store",
                "version": version,
                "id": pipe_id,
                "enabled": true,
            }),
        )
        .await?;

        info!(
            "pipe {} downloaded",
            pipe_dir.file_name().unwrap().to_string_lossy()
        );

        Ok(pipe_dir.file_name().unwrap().to_string_lossy().into_owned())
    }

    pub async fn purge_pipes(&self) -> Result<()> {
        let mut retries = 3;

        loop {
            // First, get all running pipes
            let pipes = self.list_pipes().await;

            // Stop all running pipes
            for pipe in pipes {
                if pipe.enabled {
                    debug!("stopping pipe [{}] before purge", pipe.id);
                    match self.stop_pipe(&pipe.id).await {
                        Ok(_) => {
                            debug!("successfully killed pipe process [{}]", &pipe.id);
                        }
                        Err(_) => {
                            debug!("failed to stop pipe [{}],", &pipe.id);
                        }
                    };
                }
            }

            // wait a little
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

            let pipe_dir = self.screenpipe_dir.join("pipes");
            if pipe_dir.exists() {
                match tokio::fs::remove_dir_all(&pipe_dir).await {
                    Ok(_) => {
                        debug!("all pipes purged");
                        return Ok(());
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::Other => {
                        debug!("attempting iterative deletion");
                        let mut entries = tokio::fs::read_dir(&pipe_dir).await?;
                        while let Some(entry) = entries.next_entry().await? {
                            if let Err(e) = tokio::fs::remove_file(entry.path()).await {
                                debug!("failed to remove file: {:?}", e);
                            }
                        }
                    }
                    Err(e) => {
                        if retries > 0 {
                            retries -= 1;
                            debug!(
                                "failed to purge pipes, retrying! ({} retries left)",
                                retries
                            );
                        } else {
                            return Err(e.into());
                        }
                    }
                }
            } else {
                debug!("pipe directory does not exist");
                return Ok(());
            }
        }
    }

    pub async fn delete_pipe(&self, id: &str) -> Result<()> {
        // First stop the pipe if running
        self.stop_pipe(id).await?;

        // Then delete the directory
        let pipe_dir = self.screenpipe_dir.join("pipes").join(id);
        if pipe_dir.exists() {
            tokio::fs::remove_dir_all(pipe_dir).await?;
            debug!("deleted pipe: {}", id);
            Ok(())
        } else {
            Err(anyhow::anyhow!("pipe '{}' does not exist", id))
        }
    }

    pub async fn stop_pipe(&self, id: &str) -> Result<()> {
        let mut pipes = self.running_pipes.write().await;
        if let Some(handle) = pipes.remove(id) {
            info!("stopping pipe: {}", id);

            // Send kill signal and wait for confirmation
            handle.kill_tx.send(()).await?;

            // Clean up any running cron jobs
            screenpipe_core::pipes::cleanup_pipe_crons(id).await?;

            // Wait a bit for the process to actually terminate
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            #[cfg(unix)]
            {
                // Make grep pattern more specific to target only pipe processes
                let command = format!(
                    "ps axuw | grep 'pipes/{}/' | grep -v grep | awk '{{print $2}}' | xargs -I {{}} kill -TERM {{}}",
                    &id.to_string()
                );

                let _ = tokio::process::Command::new("sh")
                    .arg("-c")
                    .arg(command)
                    .output()
                    .await;
            }

            #[cfg(windows)]
            {
                // killing by name is faster
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let _ = tokio::process::Command::new("powershell")
                    .arg("-NoProfile")
                    .arg("-WindowStyle")
                    .arg("hidden")
                    .arg("-Command")
                    .arg(format!(
                        r#"Get-WmiObject Win32_Process | Where-Object {{ $_.CommandLine -like "*.screenpipe\pipes\{}*" }} | ForEach-Object {{ taskkill.exe /T /F /PID $_.ProcessId }}"#,
                        &id.to_string()
                    ))
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                    .await;
            }

            match handle.state {
                PipeState::Port(port) => {
                    tokio::task::spawn(async move {
                        // killport doesn't seems working
                        #[cfg(unix)]
                        {
                            // soft kill
                            let command = format!(
                                "lsof -i :{} | grep -E 'bun|node' | awk 'NR>1 {{print $2}}' | xargs -I {{}} kill -TERM {{}}",
                                port
                            );

                            let output = tokio::process::Command::new("sh")
                                .arg("-c")
                                .arg(command)
                                .output()
                                .await
                                .expect("failed to execute sh command");

                            if !output.status.success() {
                                // keep killport in fallback
                                use killport::cli::Mode;
                                use killport::killport::{Killport, KillportOperations};
                                use killport::signal::KillportSignal;

                                let killport = Killport;
                                let signal: KillportSignal = "SIGKILL".parse().unwrap();

                                match killport.kill_service_by_port(port, signal.clone(), Mode::Auto, false)
                                {
                                    Ok(killed_services) => {
                                        if killed_services.is_empty() {
                                            debug!("no services found using port {}", port);
                                        } else {
                                            for (killable_type, name) in killed_services {
                                                debug!(
                                                    "successfully killed {} '{}' listening on port {}",
                                                    killable_type, name, port
                                                );
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        warn!("error killing port {}: {}", port, e);
                                    }
                                }

                            } else {
                                debug!(
                                    "successfully killed listening on port {}",
                                    port
                                );
                            }
                        }
                        #[cfg(windows)]
                        {
                            const CREATE_NO_WINDOW: u32 = 0x08000000;
                            let output = tokio::process::Command::new("netstat")
                                .args(&["-ano"])
                                .creation_flags(CREATE_NO_WINDOW)
                                .output()
                                .await
                                .expect("failed to execute netstat");

                            let output_str = std::str::from_utf8(&output.stdout)
                                .expect("failed to convert output to string");

                            for line in output_str.lines() {
                                // parts
                                let parts: Vec<&str> = line.split_whitespace().collect();
                                if parts.len() >= 5 {
                                // only kill local address
                                    let local_address = parts[1];
                                    if local_address.ends_with(&format!(":{}", port)) {
                                        // extract pid
                                        if let Ok(pid) = parts[4].parse::<u32>() {
                                            let kill_result = tokio::process::Command::new("taskkill.exe")
                                                .args(&["/F", "/T", "/PID", &pid.to_string()])
                                                .creation_flags(CREATE_NO_WINDOW)
                                                .output()
                                                .await
                                                .expect("failed to execute taskkill");
                                            if kill_result.status.success() {
                                                info!("successfully stopped pipe running on port: {}", port);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    })
                    .await
                    .map_err(|e| anyhow::anyhow!("Failed to kill port: {}", e))?;
                }
                PipeState::Pid(pid) => {
                    // Force kill the process if it's still running
                    #[cfg(unix)]
                    {
                        use nix::sys::signal::{kill, Signal};
                        use nix::unistd::Pid;
                        let _ = kill(Pid::from_raw(pid), Signal::SIGKILL);
                    }
                    #[cfg(windows)]
                    {
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        let kill_result = tokio::process::Command::new("taskkill")
                            .args(&["/F", "/T", "/PID", &pid.to_string()])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output()
                            .await
                            .expect("failed to execute taskkill");
                        if kill_result.status.success() {
                            info!("successfully stopped pipe pid: {}", pid.to_string());
                        }
                    }
                }
            }

            // Clean up cron jobs
            screenpipe_core::pipes::cleanup_pipe_crons(id).await?;

            info!("stopped pipe: {}", id);
        }
        Ok(())
    }

    pub async fn start_pipe_task(&self, id: String) -> Result<impl Future<Output = Result<()>>> {
        let screenpipe_dir = self.screenpipe_dir.clone();
        let running_pipes = self.running_pipes.clone();
        let id_for_map = id.clone();

        Ok(async move {
            match screenpipe_core::run_pipe(&id, screenpipe_dir.clone()).await {
                Ok((mut child, pipe_state)) => {
                    let (kill_tx, mut kill_rx) = mpsc::channel::<()>(1);

                    running_pipes.write().await.insert(
                        id_for_map.clone(),
                        PipeHandle {
                            state: pipe_state,
                            kill_tx: kill_tx.clone(),
                        },
                    );

                    match pipe_state {
                        PipeState::Port(port) => {
                            info!("started pipe: {} on port {}", id, port);
                        }
                        PipeState::Pid(pid) => {
                            info!("started pipe: {} on pid {}", id, pid);
                        }
                    }

                    tokio::select! {
                        status = child.wait() => {
                            match status {
                                Ok(status) if !status.success() => {
                                    println!("pipe {} exited with status: {}", id, status);
                                    running_pipes.write().await.remove(&id_for_map);
                                    anyhow::bail!("pipe exited with non-zero status: {}", status);
                                }
                                Err(e) => {
                                    println!("error waiting for pipe {}: {}", id, e);
                                    running_pipes.write().await.remove(&id_for_map);
                                    anyhow::bail!("error waiting for pipe: {}", e);
                                }
                                Ok(_) => Ok(())
                            }
                        }
                        _ = kill_rx.recv() => {
                            // Kill received through channel
                            let _ = child.kill().await;
                            running_pipes.write().await.remove(&id_for_map);
                            Ok(())
                        }
                    }
                }
                Err(e) => {
                    error!("[{}] failed to start pipe {}:", id, e);
                    Err(e)
                }
            }
        })
    }

    pub async fn update_pipe_version(&self, id: &str, source: &str) -> Result<()> {
        debug!("updating pipe: {}", id);
        let pipe_dir = self.screenpipe_dir.join("pipes").join(id);

        // 1. Get source URL from existing config
        let pipe_json_path = pipe_dir.join("pipe.json");
        let config = tokio::fs::read_to_string(&pipe_json_path).await?;
        let mut config: Value = serde_json::from_str(&config)?;

        // Save the build status from the existing config
        let build_status = config.get("buildStatus").cloned();
        debug!("preserving build status: {:?}", build_status);

        // Update build status to indicate update has started
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "buildStatus".to_string(),
                serde_json::json!({
                    "status": "in_progress",
                    "step": "preparing",
                    "message": "Starting update process"
                }),
            );
            let updated_config = serde_json::to_string_pretty(&config)?;
            tokio::fs::write(&pipe_json_path, updated_config).await?;
        }

        // Create temp directory outside of pipes dir
        let tmp_dir = std::env::temp_dir().join(format!("{}_update", id));
        tokio::fs::create_dir_all(&tmp_dir).await?;
        debug!("created temp dir: {:?}", tmp_dir);

        // Update build status to indicate downloading
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "buildStatus".to_string(),
                serde_json::json!({
                    "status": "in_progress",
                    "step": "downloading",
                    "message": "Downloading new version"
                }),
            );
            let updated_config = serde_json::to_string_pretty(&config)?;
            tokio::fs::write(&pipe_json_path, updated_config).await?;
        }

        // Download new version to temp directory
        let tmp_pipe_dir = match download_pipe_private(id, source, tmp_dir.clone()).await {
            Ok(dir) => {
                debug!("downloaded new version to temp dir: {:?}", dir);
                dir
            },
            Err(e) => {
                // Update build status to indicate download failure
                if let Some(obj) = config.as_object_mut() {
                    obj.insert(
                        "buildStatus".to_string(),
                        serde_json::json!({
                            "status": "error",
                            "step": "downloading",
                            "error": format!("Failed to download: {}", e)
                        }),
                    );
                    let updated_config = serde_json::to_string_pretty(&config)?;
                    tokio::fs::write(&pipe_json_path, updated_config).await?;
                }
                return Err(anyhow::anyhow!("failed to download new version: {}", e));
            }
        };

        // Verify temp directory exists and contains the pipe files
        if !tmp_pipe_dir.exists() {
            // Update build status to indicate verification failure
            if let Some(obj) = config.as_object_mut() {
                obj.insert(
                    "buildStatus".to_string(),
                    serde_json::json!({
                        "status": "error",
                        "step": "verification",
                        "message": "Temp pipe directory not found"
                    }),
                );
                let updated_config = serde_json::to_string_pretty(&config)?;
                tokio::fs::write(&pipe_json_path, updated_config).await?;
            }
            
            error!("temp pipe directory not found: {:?}", tmp_pipe_dir);
            return Err(anyhow::anyhow!(
                "temp pipe directory not found: {:?}",
                tmp_pipe_dir
            ));
        }

        // Update build status to indicate extracting version
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "buildStatus".to_string(),
                serde_json::json!({
                    "status": "in_progress",
                    "step": "extracting version",
                    "message": "Extracting version information"
                }),
            );
            let updated_config = serde_json::to_string_pretty(&config)?;
            tokio::fs::write(&pipe_json_path, updated_config).await?;
        }

        // Get version from new pipe.json in temp dir
        let new_pipe_package_json_path = tmp_pipe_dir.join("package.json");
        let new_config = match tokio::fs::read_to_string(&new_pipe_package_json_path).await {
            Ok(content) => {
                match serde_json::from_str::<Value>(&content) {
                    Ok(config) => config,
                    Err(e) => {
                        // Update build status to indicate parsing failure
                        if let Some(obj) = config.as_object_mut() {
                            obj.insert(
                                "buildStatus".to_string(),
                                serde_json::json!({
                                    "status": "error",
                                    "step": "extracting version",
                                    "error": format!("Failed to parse package.json: {}", e)
                                }),
                            );
                            let updated_config = serde_json::to_string_pretty(&config)?;
                            tokio::fs::write(&pipe_json_path, updated_config).await?;
                        }
                        return Err(anyhow::anyhow!("failed to parse new package.json: {}", e));
                    }
                }
            },
            Err(e) => {
                // Update build status to indicate reading failure
                if let Some(obj) = config.as_object_mut() {
                    obj.insert(
                        "buildStatus".to_string(),
                        serde_json::json!({
                            "status": "error",
                            "step": "extracting version",
                            "error": format!("Failed to read package.json: {}", e)
                        }),
                    );
                    let updated_config = serde_json::to_string_pretty(&config)?;
                    tokio::fs::write(&pipe_json_path, updated_config).await?;
                }
                return Err(anyhow::anyhow!("failed to read new package.json: {}", e));
            }
        };

        // Update build status to indicate stopping pipe
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "buildStatus".to_string(),
                serde_json::json!({
                    "status": "in_progress",
                    "step": "stopping pipe",
                    "message": "Stopping current pipe"
                }),
            );
            let updated_config = serde_json::to_string_pretty(&config)?;
            tokio::fs::write(&pipe_json_path, updated_config).await?;
        }

        // Update version in existing config
        if let Some(new_version) = new_config.get("version").and_then(Value::as_str) {
            if let Some(obj) = config.as_object_mut() {
                obj.insert(
                    "version".to_string(),
                    Value::String(new_version.to_string()),
                );
                
                // Write updated config back to file
                let updated_config = serde_json::to_string_pretty(&config)?;
                tokio::fs::write(&pipe_json_path, updated_config).await?;
                debug!("updated version in pipe.json to: {}", new_version);
            }
        }

        // 2. Stop current pipe if running
        if let Err(e) = self.stop_pipe(id).await {
            // Update build status to indicate stopping failure
            if let Some(obj) = config.as_object_mut() {
                obj.insert(
                    "buildStatus".to_string(),
                    serde_json::json!({
                        "status": "error",
                        "step": "stopping pipe",
                        "error": format!("Failed to stop pipe: {}", e)
                    }),
                );
                let updated_config = serde_json::to_string_pretty(&config)?;
                tokio::fs::write(&pipe_json_path, updated_config).await?;
            }
            warn!("failed to stop pipe: {}", e);
            // Continue with update despite stopping failure
        }
        debug!("stopped running pipe");

        // Update build status to indicate removing old files
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "buildStatus".to_string(),
                serde_json::json!({
                    "status": "in_progress",
                    "step": "removing old files",
                    "message": "Removing old files"
                }),
            );
            let updated_config = serde_json::to_string_pretty(&config)?;
            tokio::fs::write(&pipe_json_path, updated_config).await?;
        }

        // 3. Remove old files
        let files_to_remove = ["node_modules", "bun.lockb", "package.json"];
        for file in files_to_remove {
            let path = pipe_dir.join(file);
            if path.exists() {
                if path.is_dir() {
                    tokio::fs::remove_dir_all(&path).await?;
                } else {
                    tokio::fs::remove_file(&path).await?;
                }
                debug!("removed: {}", file);
            }
        }

        debug!("moved old files to trash");

        // Update build status to indicate copying new files
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "buildStatus".to_string(),
                serde_json::json!({
                    "status": "in_progress",
                    "step": "copying new files",
                    "message": "Copying new files"
                }),
            );
            let updated_config = serde_json::to_string_pretty(&config)?;
            tokio::fs::write(&pipe_json_path, updated_config).await?;
        }

        // 4. Move new files from temp to pipe dir
        let mut entries = tokio::fs::read_dir(&tmp_pipe_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let file_name = entry.file_name();
            let src_path = entry.path();
            let dst_path = pipe_dir.join(&file_name);

            // Skip pipe.json to preserve configuration
            if file_name == "pipe.json" {
                continue;
            }

            if src_path.is_dir() {
                if dst_path.exists() {
                    debug!("removing old dir: {:?}", dst_path);
                    tokio::fs::remove_dir_all(&dst_path).await?;
                }
                debug!("creating new dir: {:?}", dst_path);
                tokio::fs::create_dir_all(&dst_path).await?;
                debug!("copying new files: {:?}", src_path);
                copy_dir_all(&src_path, &dst_path).await?;
            } else {
                debug!("copying new file: {:?}", src_path);
                tokio::fs::copy(&src_path, &dst_path).await?;
            }
            debug!("moved: {:?}", file_name);
        }

        // Clean up temp directory
        tokio::fs::remove_dir_all(&tmp_dir).await?;
        debug!("cleaned up temp dir");

        // Update build status to indicate restarting pipe
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "buildStatus".to_string(),
                serde_json::json!({
                    "status": "in_progress",
                    "step": "restarting",
                    "message": "Restarting pipe"
                }),
            );
            let updated_config = serde_json::to_string_pretty(&config)?;
            tokio::fs::write(&pipe_json_path, updated_config).await?;
        }

        // 5. Restart pipe if it was enabled
        if config
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            match self.start_pipe_task(id.to_string()).await {
                Ok(future) => {
                    tokio::spawn(future);
                    debug!("restarted pipe");
                    
                    // Update build status to indicate success
                    if let Some(obj) = config.as_object_mut() {
                        obj.insert(
                            "buildStatus".to_string(),
                            serde_json::json!({
                                "status": "success",
                                "step": "completed",
                                "message": "Update completed successfully"
                            }),
                        );
                        let updated_config = serde_json::to_string_pretty(&config)?;
                        tokio::fs::write(&pipe_json_path, updated_config).await?;
                    }
                },
                Err(e) => {
                    // Update build status to indicate restart failure
                    if let Some(obj) = config.as_object_mut() {
                        obj.insert(
                            "buildStatus".to_string(),
                            serde_json::json!({
                                "status": "error",
                                "step": "restarting",
                                "error": format!("Update completed but failed to restart pipe: {}", e)
                            }),
                        );
                        let updated_config = serde_json::to_string_pretty(&config)?;
                        tokio::fs::write(&pipe_json_path, updated_config).await?;
                    }
                    warn!("failed to restart pipe: {}", e);
                }
            }
        } else {
            // Update build status to indicate success (no restart needed)
            if let Some(obj) = config.as_object_mut() {
                obj.insert(
                    "buildStatus".to_string(),
                    serde_json::json!({
                        "status": "success",
                        "step": "completed",
                        "message": "Update completed successfully (pipe not enabled)"
                    }),
                );
                let updated_config = serde_json::to_string_pretty(&config)?;
                tokio::fs::write(&pipe_json_path, updated_config).await?;
            }
        }

        info!("pipe {} updated successfully", id);
        Ok(())
    }
}

// Helper function to recursively copy directories
async fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> Result<()> {
    let src = src.as_ref();
    let dst = dst.as_ref();

    // Create a queue of directories to process
    let mut dirs_to_process = vec![(src.to_path_buf(), dst.to_path_buf())];

    while let Some((current_src, current_dst)) = dirs_to_process.pop() {
        tokio::fs::create_dir_all(&current_dst).await?;

        let mut entries = tokio::fs::read_dir(&current_src).await?;
        while let Some(entry) = entries.next_entry().await? {
            let ty = entry.file_type().await?;
            let src_path = entry.path();
            let dst_path = current_dst.join(entry.file_name());

            if ty.is_dir() {
                dirs_to_process.push((src_path, dst_path));
            } else {
                tokio::fs::copy(&src_path, &dst_path).await?;
            }
        }
    }

    Ok(())
}
