use crate::cli::{OutputFormat, PipeCommand};
use crate::pipe_manager::{PipeInfo, PipeManager};
use serde_json::{json, Value};
use std::io::Write;
use std::sync::Arc;

pub async fn handle_pipe_command(cmd: &PipeCommand, pm: &Arc<PipeManager>, enabled: bool) -> anyhow::Result<()> {
    if !enabled { println!("pipe functionality disabled"); return Ok(()); }

    let client = reqwest::Client::new();
    let base = "http://localhost";

    match cmd {
        PipeCommand::List { output, port } => {
            let pipes: Vec<PipeInfo> = match client.get(format!("{}:{}/pipes/list", base, port)).send().await {
                Ok(r) if r.status().is_success() => {
                    let v: Value = r.json().await?;
                    v.get("data").and_then(|d| d.as_array())
                        .map(|a| a.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
                        .unwrap_or_default()
                }
                _ => { println!("server not running, showing local config"); pm.list_pipes().await }
            };
            match output {
                OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&json!({"data": pipes, "success": true}))?),
                OutputFormat::Text => { println!("pipes:"); for p in pipes { println!("  {} ({})", p.id, if p.enabled {"on"} else {"off"}); } }
            }
        }
        #[allow(deprecated)]
        PipeCommand::Download { url, output, port } | PipeCommand::Install { url, output, port } => {
            match client.post(format!("{}:{}/pipes/download", base, port)).json(&json!({"url": url})).send().await {
                Ok(r) if r.status().is_success() => {
                    let d: Value = r.json().await?;
                    match output {
                        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&d)?),
                        OutputFormat::Text => println!("installed: {}", d["pipe_id"].as_str().unwrap_or("?")),
                    }
                }
                _ => match pm.download_pipe(url).await {
                    Ok(id) => match output {
                        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&json!({"data": {"pipe_id": id}, "success": true}))?),
                        OutputFormat::Text => println!("installed: {}", id),
                    },
                    Err(e) => match output {
                        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&json!({"error": e.to_string(), "success": false}))?),
                        OutputFormat::Text => eprintln!("failed: {}", e),
                    }
                }
            }
        }
        PipeCommand::Info { id, output, port } => {
            let info: PipeInfo = match client.get(format!("{}:{}/pipes/info/{}", base, port, id)).send().await {
                Ok(r) if r.status().is_success() => r.json().await?,
                _ => pm.get_pipe_info(id).await.ok_or_else(|| anyhow::anyhow!("not found"))?
            };
            match output {
                OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&info)?),
                OutputFormat::Text => println!("{:?}", info),
            }
        }
        PipeCommand::Enable { id, port } => {
            match client.post(format!("{}:{}/pipes/enable", base, port)).json(&json!({"pipe_id": id})).send().await {
                Ok(r) if r.status().is_success() => println!("{} enabled", id),
                _ => { pm.update_config(id, json!({"enabled": true})).await?; println!("config updated (server not running)"); }
            }
        }
        PipeCommand::Disable { id, port } => {
            match client.post(format!("{}:{}/pipes/disable", base, port)).json(&json!({"pipe_id": id})).send().await {
                Ok(r) if r.status().is_success() => println!("{} disabled", id),
                _ => { pm.update_config(id, json!({"enabled": false})).await?; println!("config updated"); }
            }
        }
        PipeCommand::Update { id, config, port } => {
            let cfg: Value = serde_json::from_str(config)?;
            match client.post(format!("{}:{}/pipes/update", base, port)).json(&json!({"pipe_id": id, "config": cfg})).send().await {
                Ok(r) if r.status().is_success() => println!("updated"),
                _ => { pm.update_config(id, cfg).await?; println!("config updated"); }
            }
        }
        PipeCommand::Delete { id, yes, port } => {
            if !yes { print!("delete '{}'? [y/N] ", id); std::io::stdout().flush()?; let mut s = String::new(); std::io::stdin().read_line(&mut s)?; if !s.trim().eq_ignore_ascii_case("y") { println!("cancelled"); return Ok(()); } }
            match client.delete(format!("{}:{}/pipes/delete/{}", base, port, id)).send().await {
                Ok(r) if r.status().is_success() => println!("deleted"),
                _ => { pm.delete_pipe(id).await?; println!("deleted locally"); }
            }
        }
        PipeCommand::Purge { yes, port } => {
            if !yes { print!("purge all? [y/N] "); std::io::stdout().flush()?; let mut s = String::new(); std::io::stdin().read_line(&mut s)?; if !s.trim().eq_ignore_ascii_case("y") { println!("cancelled"); return Ok(()); } }
            match client.post(format!("{}:{}/pipes/purge", base, port)).send().await {
                Ok(r) if r.status().is_success() => println!("purged"),
                _ => { pm.purge_pipes().await?; println!("purged locally"); }
            }
        }
    }
    Ok(())
}
