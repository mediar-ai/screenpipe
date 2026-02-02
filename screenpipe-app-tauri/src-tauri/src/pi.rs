//! Pi CLI Integration
//!
//! Manages the pi coding agent CLI for AI-powered features.
//! Auto-installs via bun and configures to use screenpipe API proxy.

use tracing::{debug, error, info, warn};

const PI_PACKAGE: &str = "@mariozechner/pi-coding-agent";
const SCREENPIPE_API_URL: &str = "https://api.screenpi.pe/v1";
const DEFAULT_MODEL: &str = "claude-opus-4-5@20251101";

/// Ensure pi CLI is installed/updated via bun
pub async fn ensure_installed() -> Result<(), String> {
    info!("Ensuring pi CLI is installed/updated via bun...");
    
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();
    
    let bun_paths = vec![
        format!("{}/.bun/bin/bun", home),
        "/opt/homebrew/bin/bun".to_string(),
        "/usr/local/bin/bun".to_string(),
        "bun".to_string(),
    ];
    
    let bun = bun_paths
        .iter()
        .find(|p| *p == "bun" || std::path::Path::new(p).exists())
        .ok_or("Could not find bun. Install from https://bun.sh")?
        .clone();
    
    info!("Using bun at: {}", bun);
    
    let output = tokio::process::Command::new(&bun)
        .args(["add", "-g", PI_PACKAGE])
        .output()
        .await
        .map_err(|e| format!("Failed to run bun: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("bun install warning: {}", stderr);
    } else {
        info!("pi CLI installed/updated successfully");
    }
    
    Ok(())
}

/// Configure pi to use screenpipe as the AI provider
pub fn ensure_config() -> Result<(), String> {
    let config_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".pi")
        .join("agent");
    
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create pi config dir: {}", e))?;
    
    let models_path = config_dir.join("models.json");
    
    // Custom screenpipe provider with full model definitions
    let config = serde_json::json!({
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
    
    let config_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    std::fs::write(&models_path, config_str)
        .map_err(|e| format!("Failed to write pi config: {}", e))?;
    
    info!("Pi config written to {:?}", models_path);
    Ok(())
}

/// Find the pi executable path
fn find_executable() -> Result<String, String> {
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();
    
    let paths = vec![
        format!("{}/.bun/bin/pi", home),
        format!("{}/.npm-global/bin/pi", home),
        format!("{}/.nvm/versions/node/v22.11.0/bin/pi", home),
        "/opt/homebrew/bin/pi".to_string(),
        "/usr/local/bin/pi".to_string(),
        "/usr/bin/pi".to_string(),
        "pi".to_string(),
    ];
    
    paths
        .into_iter()
        .find(|p| p == "pi" || std::path::Path::new(p).exists())
        .ok_or_else(|| format!("Could not find pi. Install with: bun add -g {}", PI_PACKAGE))
}

/// Run pi with a prompt (non-interactive print mode)
pub async fn run(prompt: &str, user_token: Option<&str>) -> Result<String, String> {
    // Ensure pi is installed and configured
    ensure_installed().await?;
    ensure_config()?;
    
    let pi_cmd = find_executable()?;
    info!("Using pi at: {}", pi_cmd);
    
    let mut cmd = tokio::process::Command::new(&pi_cmd);
    cmd.arg("-p").arg(prompt);
    cmd.arg("--provider").arg("screenpipe");
    cmd.arg("--model").arg(DEFAULT_MODEL);
    
    if let Some(token) = user_token {
        info!("pi::run: setting SCREENPIPE_API_KEY env var (token length: {})", token.len());
        cmd.env("SCREENPIPE_API_KEY", token);
    } else {
        warn!("pi::run: no user_token provided!");
    }
    
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    info!("Running pi command...");
    let output = cmd.output().await
        .map_err(|e| format!("Failed to spawn pi: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if !stdout.is_empty() {
        debug!("pi stdout: {}", stdout);
    }
    if !stderr.is_empty() {
        debug!("pi stderr: {}", stderr);
    }

    if output.status.success() {
        info!("Pi completed successfully");
        Ok(stdout)
    } else {
        let error_msg = if !stderr.is_empty() {
            stderr
        } else {
            format!("Pi exited with code {:?}", output.status.code())
        };
        error!("Pi failed: {}", error_msg);
        Err(error_msg)
    }
}
