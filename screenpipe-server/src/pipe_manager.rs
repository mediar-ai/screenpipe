use anyhow::Result;
use screenpipe_core::download_pipe;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc::{self, Sender};
use tokio::sync::RwLock;
use tracing::{debug, info};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PipeInfo {
    pub id: String,
    pub enabled: bool,
    pub config: Value,
    pub source: String,
    pub port: Option<u16>,
}

struct PipeHandle {
    pid: i32,
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

        if let Value::Object(existing_config) = &mut config {
            if let Value::Object(updates) = new_config {
                for (key, value) in updates {
                    existing_config.insert(key, value);
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

    async fn load_pipe_info(pipe_id: String, config_path: PathBuf) -> PipeInfo {
        let config = tokio::fs::read_to_string(&config_path)
            .await
            .and_then(|s| serde_json::from_str::<Value>(&s).map_err(Into::into))
            .unwrap_or_else(|_| Value::Null);

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
                    let config_path = entry.path().join("pipe.json");
                    pipe_infos.push(Self::load_pipe_info(pipe_id.into_owned(), config_path).await);
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
        let pipe_dir = self.screenpipe_dir.join("pipes");
        tokio::fs::remove_dir_all(pipe_dir).await?;
        Ok(())
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
            info!("stopping pipe: {} with pid {}", id, handle.pid);

            // Send kill signal through channel
            let _ = handle.kill_tx.send(()).await;

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
                Ok(mut child) => {
                    let pid = child.id().expect("Failed to get child pid") as i32;
                    let (kill_tx, mut kill_rx) = mpsc::channel::<()>(1);

                    running_pipes.write().await.insert(
                        id_for_map.clone(),
                        PipeHandle {
                            pid,
                            kill_tx: kill_tx.clone(),
                        },
                    );

                    info!("started pipe: {} with pid {}", id, pid);

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
                    println!("failed to start pipe {}: {}", id, e);
                    Err(e)
                }
            }
        })
    }
}
