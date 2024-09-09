use anyhow::Result;
use log::{debug, error};
use screenpipe_core::{download_pipe, run_pipe};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::future::Future;
use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PipeInfo {
    pub id: String,
    pub enabled: bool,
    pub config: Value,
}

pub struct PipeManager {
    screenpipe_dir: PathBuf,
}

impl PipeManager {
    pub fn new(screenpipe_dir: PathBuf) -> Self {
        PipeManager { screenpipe_dir }
    }

    pub async fn start_pipe(
        &self,
        id: &str,
    ) -> Result<impl Future<Output = Result<(), anyhow::Error>>> {
        let pipes = self.list_pipes().await;

        if let Some(_) = pipes.iter().find(|pipe| pipe.id == id) {
            let pipe_id = id.to_string();
            let screenpipe_dir = self.screenpipe_dir.clone();

            let future = run_pipe(pipe_id.clone(), screenpipe_dir);

            self.update_config(
                id,
                serde_json::json!({
                    "enabled": true,
                }),
            )
            .await?;

            Ok(future)
        } else {
            Err(anyhow::anyhow!("Pipe not found"))
        }
    }

    pub async fn update_config(&self, id: &str, new_config: Value) -> Result<()> {
        debug!("Updating config for pipe: {}", id);
        let pipe_dir = self.screenpipe_dir.join("pipes").join(id);
        let config_path = pipe_dir.join("pipe.json");

        let config_str = tokio::fs::read_to_string(&config_path).await?;
        let mut config: Value = serde_json::from_str(&config_str)?;

        if let Value::Object(existing_config) = &mut config {
            if let Value::Object(updates) = new_config {
                for (key, value) in updates {
                    existing_config.insert(key, value);
                }
            } else {
                return Err(anyhow::anyhow!("New configuration must be an object"));
            }
        } else {
            return Err(anyhow::anyhow!("Existing configuration is not an object"));
        }

        let updated_config_str = serde_json::to_string_pretty(&config)?;

        let mut file = File::create(&config_path).await?;
        file.write_all(updated_config_str.as_bytes()).await?;

        Ok(())
    }

    pub async fn get_pipe_info(&self, id: &str) -> Option<PipeInfo> {
        let pipes = self.list_pipes().await;
        pipes.iter().find(|pipe| pipe.id == id).cloned()
    }

    pub async fn list_pipes(&self) -> Vec<PipeInfo> {
        let pipe_dir = self.screenpipe_dir.join("pipes");
        let mut pipe_infos = Vec::new();

        if let Ok(mut entries) = tokio::fs::read_dir(pipe_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let pipe_id = entry.file_name().to_string_lossy().into_owned();
                let config_path = entry.path().join("pipe.json");
                pipe_infos.push(async move {
                    let config = tokio::fs::read_to_string(config_path).await?;
                    let config: Value = serde_json::from_str(&config)?;
                    debug!("Pipe config: {:?}", config);
                    Ok::<_, anyhow::Error>(PipeInfo {
                        id: pipe_id,
                        enabled: config
                            .get("enabled")
                            .unwrap_or(&Value::Bool(false))
                            .as_bool()
                            .unwrap_or(false),
                        config,
                    })
                });
            }
        }

        match futures::future::try_join_all(pipe_infos).await {
            Ok(infos) => infos,
            Err(e) => {
                error!("Error listing pipes: {}", e);
                Vec::new()
            }
        }
    }

    pub async fn download_pipe(&self, url: &str) -> Result<String> {
        let pipe_dir = download_pipe(url, self.screenpipe_dir.clone()).await?;
        Ok(pipe_dir.file_name().unwrap().to_string_lossy().into_owned())
    }
}
