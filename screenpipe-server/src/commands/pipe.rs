use crate::cli::{OutputFormat, PipeCommand};
use crate::pipe_manager::{PipeInfo, PipeManager};
use serde_json::{json, Value};
use std::io::Write;
use std::sync::Arc;

pub async fn handle_pipe_command(
    command: &PipeCommand,
    pipe_manager: &Arc<PipeManager>,
    enable_pipe_manager: bool,
) -> anyhow::Result<()> {
    if !enable_pipe_manager {
        println!("note: pipe functionality is disabled");
        return Ok(());
    }

    let client = reqwest::Client::new();
    let server_url = "http://localhost";

    match command {
        PipeCommand::List { output, port } => {
            handle_list(&client, server_url, pipe_manager, output, *port).await
        }
        #[allow(deprecated)]
        PipeCommand::Download { url, output, port }
        | PipeCommand::Install { url, output, port } => {
            handle_install(&client, server_url, pipe_manager, url, output, *port).await
        }
        PipeCommand::Info { id, output, port } => {
            handle_info(&client, server_url, pipe_manager, id, output, *port).await
        }
        PipeCommand::Enable { id, port } => {
            handle_enable(&client, server_url, pipe_manager, id, *port).await
        }
        PipeCommand::Disable { id, port } => {
            handle_disable(&client, server_url, pipe_manager, id, *port).await
        }
        PipeCommand::Update { id, config, port } => {
            handle_update(&client, server_url, pipe_manager, id, config, *port).await
        }
        PipeCommand::Delete { id, yes, port } => {
            handle_delete(&client, server_url, pipe_manager, id, *yes, *port).await
        }
        PipeCommand::Purge { yes, port } => {
            handle_purge(&client, server_url, pipe_manager, *yes, *port).await
        }
    }
}

async fn handle_list(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    output: &OutputFormat,
    port: u16,
) -> anyhow::Result<()> {
    let server_url = format!("{}:{}", server_url, port);
    let pipes = match client
        .get(format!("{}/pipes/list", server_url))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            let response: Value = response.json().await?;
            response
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| serde_json::from_value::<PipeInfo>(v.clone()).ok())
                        .collect()
                })
                .ok_or_else(|| anyhow::anyhow!("invalid response format"))?
        }
        _ => {
            println!("note: server not running, showing pipe configurations");
            pipe_manager.list_pipes().await
        }
    };

    match output {
        OutputFormat::Json => println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "data": pipes,
                "success": true
            }))?
        ),
        OutputFormat::Text => {
            println!("available pipes:");
            for pipe in pipes {
                println!("  id: {}, enabled: {}", pipe.id, pipe.enabled);
            }
        }
    }
    Ok(())
}

async fn handle_install(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    url: &str,
    output: &OutputFormat,
    port: u16,
) -> anyhow::Result<()> {
    match client
        .post(format!("{}:{}/pipes/download", server_url, port))
        .json(&json!({ "url": url }))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            let data: Value = response.json().await?;
            match output {
                OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&data)?),
                OutputFormat::Text => println!(
                    "pipe downloaded successfully. id: {}",
                    data["pipe_id"].as_str().unwrap_or("unknown")
                ),
            }
        }
        _ => match pipe_manager.download_pipe(url).await {
            Ok(pipe_id) => match output {
                OutputFormat::Json => println!(
                    "{}",
                    serde_json::to_string_pretty(&json!({
                        "data": {
                            "pipe_id": pipe_id,
                            "message": "pipe downloaded successfully"
                        },
                        "success": true
                    }))?
                ),
                OutputFormat::Text => {
                    println!("pipe downloaded successfully. id: {}", pipe_id)
                }
            },
            Err(e) => {
                let error_msg = format!("failed to download pipe: {}", e);
                match output {
                    OutputFormat::Json => println!(
                        "{}",
                        serde_json::to_string_pretty(&json!({
                            "error": error_msg,
                            "success": false
                        }))?
                    ),
                    OutputFormat::Text => eprintln!("{}", error_msg),
                }
            }
        },
    }
    Ok(())
}

async fn handle_info(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    id: &str,
    output: &OutputFormat,
    port: u16,
) -> anyhow::Result<()> {
    let info = match client
        .get(format!("{}:{}/pipes/info/{}", server_url, port, id))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response.json().await?,
        _ => {
            println!("note: server not running, showing pipe configuration");
            pipe_manager
                .get_pipe_info(id)
                .await
                .ok_or_else(|| anyhow::anyhow!("pipe not found"))?
        }
    };

    match output {
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&info)?),
        OutputFormat::Text => println!("pipe info: {:?}", info),
    }
    Ok(())
}

async fn handle_enable(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    id: &str,
    port: u16,
) -> anyhow::Result<()> {
    match client
        .post(format!("{}:{}/pipes/enable", server_url, port))
        .json(&json!({ "pipe_id": id }))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            println!("pipe {} enabled in running server", id);
        }
        _ => {
            pipe_manager
                .update_config(id, json!({"enabled": true}))
                .await?;
            println!("note: server not running, updated config only. pipe will start on next server launch");
        }
    }
    Ok(())
}

async fn handle_disable(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    id: &str,
    port: u16,
) -> anyhow::Result<()> {
    match client
        .post(format!("{}:{}/pipes/disable", server_url, port))
        .json(&json!({ "pipe_id": id }))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            println!("pipe {} disabled in running server", id);
        }
        _ => {
            pipe_manager
                .update_config(id, json!({"enabled": false}))
                .await?;
            println!("note: server not running, updated config only");
        }
    }
    Ok(())
}

async fn handle_update(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    id: &str,
    config: &str,
    port: u16,
) -> anyhow::Result<()> {
    let config: Value =
        serde_json::from_str(config).map_err(|e| anyhow::anyhow!("invalid json: {}", e))?;

    match client
        .post(format!("{}:{}/pipes/update", server_url, port))
        .json(&json!({
            "pipe_id": id,
            "config": config
        }))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            println!("pipe {} config updated in running server", id);
        }
        _ => {
            pipe_manager.update_config(id, config).await?;
            println!("note: server not running, updated config only");
        }
    }
    Ok(())
}

async fn handle_delete(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    id: &str,
    yes: bool,
    port: u16,
) -> anyhow::Result<()> {
    if !yes {
        print!("are you sure you want to delete pipe '{}'? [y/N] ", id);
        std::io::stdout().flush()?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if !input.trim().eq_ignore_ascii_case("y") {
            println!("pipe deletion cancelled");
            return Ok(());
        }
    }

    match client
        .delete(format!("{}:{}/pipes/delete/{}", server_url, port, id))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            println!("pipe '{}' deleted from running server", id);
        }
        _ => match pipe_manager.delete_pipe(id).await {
            Ok(_) => println!("pipe '{}' deleted from local files", id),
            Err(e) => println!("failed to delete pipe: {}", e),
        },
    }
    Ok(())
}

async fn handle_purge(
    client: &reqwest::Client,
    server_url: &str,
    pipe_manager: &Arc<PipeManager>,
    yes: bool,
    port: u16,
) -> anyhow::Result<()> {
    if !yes {
        print!("are you sure you want to purge all pipes? this action cannot be undone. (y/N): ");
        std::io::stdout().flush()?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if !input.trim().eq_ignore_ascii_case("y") {
            println!("pipe purge cancelled");
            return Ok(());
        }
    }

    match client
        .post(format!("{}:{}/pipes/purge", server_url, port))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            println!("all pipes purged from running server");
        }
        _ => match pipe_manager.purge_pipes().await {
            Ok(_) => println!("all pipes purged from local files"),
            Err(e) => println!("failed to purge pipes: {}", e),
        },
    }
    Ok(())
}
