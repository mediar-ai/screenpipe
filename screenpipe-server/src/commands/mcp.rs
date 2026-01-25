use crate::cli::{McpCommand, OutputFormat};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use tokio::signal;
use tracing::{debug, warn};

#[derive(Deserialize)]
struct GitHubContent { name: String, path: String, download_url: Option<String>, #[serde(rename = "type")] content_type: String }

pub async fn handle_mcp_command(cmd: &McpCommand, data_dir: &PathBuf) -> anyhow::Result<()> {
    if !cmd_exists("python") && !cmd_exists("python3") { warn!("python not installed"); }
    if !cmd_exists("uv") { warn!("uv not installed - see https://docs.astral.sh/uv"); }

    match cmd {
        McpCommand::Setup { directory, output, port, update, purge } => {
            let dir = directory.as_ref().map(PathBuf::from).unwrap_or_else(|| data_dir.join("mcp"));

            if *purge {
                if dir.exists() { tokio::fs::remove_dir_all(&dir).await?; }
                match output {
                    OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&json!({"data": {"message": "purged", "directory": dir.display().to_string()}, "success": true}))?),
                    OutputFormat::Text => println!("MCP directory purged: {}", dir.display()),
                }
                return Ok(());
            }

            let need_download = if dir.exists() {
                if *update { tokio::fs::remove_dir_all(&dir).await?; true }
                else { tokio::fs::read_dir(&dir).await?.next_entry().await?.is_none() }
            } else { true };

            let config = json!({"mcpServers": {"screenpipe": {"command": "uv", "args": ["--directory", dir.to_string_lossy(), "run", "screenpipe-mcp", "--port", port.to_string()]}}});
            let config_path = dir.join("config.json");

            if need_download {
                tokio::fs::create_dir_all(&dir).await?;
                let (tx, mut rx) = tokio::sync::mpsc::channel(1);
                let cancel = tokio::spawn(async move { if signal::ctrl_c().await.is_ok() { let _ = tx.send(()).await; } });

                let client = Client::new();
                let result = tokio::select! {
                    r = download_dir(&client, "https://api.github.com/repos/mediar-ai/screenpipe/contents/screenpipe-integrations/screenpipe-mcp?ref=main", &dir) => r,
                    _ = rx.recv() => Err(anyhow::anyhow!("cancelled"))
                };
                cancel.abort();
                if let Err(e) = result { if dir.exists() { let _ = tokio::fs::remove_dir_all(&dir).await; } return Err(e); }
            }

            tokio::fs::write(&config_path, serde_json::to_string_pretty(&config)?).await?;

            match output {
                OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&json!({"data": {"config": config, "directory": dir.display().to_string()}, "success": true}))?),
                OutputFormat::Text => { println!("MCP setup at: {}", dir.display()); println!("Run: uv --directory {} run screenpipe-mcp --port {}", dir.display(), port); }
            }
        }
    }
    Ok(())
}

async fn download_dir(client: &Client, url: &str, target: &Path) -> anyhow::Result<()> {
    let resp = client.get(url).header("User-Agent", "screenpipe").send().await?;
    if !resp.status().is_success() { return Err(anyhow::anyhow!("GitHub API error: {}", resp.status())); }

    for item in resp.json::<Vec<GitHubContent>>().await? {
        let path = target.join(&item.name);
        match item.content_type.as_str() {
            "file" => if let Some(u) = item.download_url {
                tokio::fs::write(&path, client.get(&u).send().await?.bytes().await?).await?;
                debug!("downloaded: {}", path.display());
            },
            "dir" => {
                tokio::fs::create_dir_all(&path).await?;
                Box::pin(download_dir(client, &format!("https://api.github.com/repos/mediar-ai/screenpipe/contents/{}?ref=main", item.path), &path)).await?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn cmd_exists(cmd: &str) -> bool { std::process::Command::new(cmd).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) }
