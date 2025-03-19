use anyhow::anyhow;
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::result::Result;
use tokio;

#[derive(Parser)]
pub enum Commands {
    Mcp { command: McpCommands },
}

#[derive(Parser)]
pub enum McpCommands {
    Setup {
        #[clap(long, default_value = "3000")]
        port: u16,
        
        #[clap(long, default_value = "127.0.0.1")]
        host: String,
    },
}

async fn handle_command(command: Commands) -> Result<()> {
    match command {
        Commands::Mcp { command } => match command {
            McpCommands::Setup { port, host } => {
                println!("setting up mcp server on {}:{}", host, port);
                
                let config = McpConfig {
                    port,
                    host,
                    // add other necessary config fields
                };
                
                // Save config to user's config directory
                let config_path = dirs::config_dir()
                    .ok_or_else(|| anyhow!("Could not find config directory"))?
                    .join("screenpipe")
                    .join("mcp.json");
                
                if let Some(parent) = config_path.parent() {
                    tokio::fs::create_dir_all(parent).await?;
                }
                
                let config_json = serde_json::to_string_pretty(&config)?;
                tokio::fs::write(config_path, config_json).await?;
                
                println!("mcp server configuration saved successfully");
                Ok(())
            }
        },
    }
}

// Add this struct to store MCP configuration
#[derive(Serialize, Deserialize)]
struct McpConfig {
    port: u16,
    host: String,
} 