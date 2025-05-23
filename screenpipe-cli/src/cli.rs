use std::path::PathBuf;
use anyhow::Result;
use tokio::process::Command;

pub struct FfmpegCommand {
    binary_path: PathBuf,
}

impl FfmpegCommand {
    pub async fn new() -> Result<Self> {
        // Try bundled ffmpeg first
        let bundled_path = if cfg!(windows) {
            tauri::utils::platform::resource_dir()?
                .join("binaries")
                .join("ffmpeg.exe")
        } else {
            tauri::utils::platform::resource_dir()?
                .join("binaries")
                .join("ffmpeg")
        };

        if bundled_path.exists() {
            return Ok(Self {
                binary_path: bundled_path,
            });
        }

        // Fallback to sidecar
        let sidecar_path = if cfg!(windows) {
            PathBuf::from("ffmpeg.exe")
        } else {
            PathBuf::from("ffmpeg")
        };

        Ok(Self {
            binary_path: sidecar_path,
        })
    }

    pub async fn run(&self, args: &[&str]) -> Result<()> {
        let status = Command::new(&self.binary_path)
            .args(args)
            .status()
            .await?;

        if !status.success() {
            anyhow::bail!("ffmpeg command failed");
        }

        Ok(())
    }
}

#[derive(Parser)]
pub enum Commands {
    /// Setup and manage MCP server
    Mcp {
        #[clap(subcommand)]
        command: McpCommands,
    },
}

#[derive(Parser)]
pub enum McpCommands {
    /// Setup MCP server configuration
    Setup {
        /// Port to run the MCP server on
        #[clap(long, default_value = "3000")]
        port: u16,
        
        /// Host address for the MCP server
        #[clap(long, default_value = "127.0.0.1")]
        host: String,
    },
} 