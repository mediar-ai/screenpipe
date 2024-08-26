use clap::Parser;
use log::{info, warn, LevelFilter};
use reqwest;
#[cfg(feature = "pipes")]
use screenpipe_core::run_js;
use screenpipe_server::Cli;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;
use url::Url;

#[cfg(feature = "pipes")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    if cli.pipe.is_empty() {
        eprintln!("No pipe specified. Use --pipe to specify the pipe.");
        std::process::exit(1);
    }

    let mut builder = env_logger::Builder::new();
    builder
        .filter(None, LevelFilter::Info)
        .format_timestamp_secs()
        .init();

    warn!("Warning: only 1 pipe is supported right now. This will change in the future.");

    let pipe_input = &cli.pipe[0];
    let path_to_main_module = if Url::parse(pipe_input).is_ok() {
        download_pipe(pipe_input).await?
    } else {
        Path::new(pipe_input).canonicalize()?
    };

    if let Err(error) = run_js(&path_to_main_module.to_string_lossy()).await {
        eprintln!("error: {error}");
    }

    Ok(())
}

fn get_raw_github_url(url: &str) -> Result<String, Box<dyn std::error::Error>> {
    let parsed_url = Url::parse(url)?;
    if parsed_url.host_str() == Some("github.com") {
        let path_segments: Vec<&str> = parsed_url.path_segments().unwrap().collect();
        if path_segments.len() >= 3 {
            let (owner, repo, _, branch) = (
                path_segments[0],
                path_segments[1],
                path_segments[2],
                path_segments[3],
            );
            let raw_path = path_segments[4..].join("/");
            return Ok(format!(
                "https://raw.githubusercontent.com/{}/{}/{}/{}",
                owner, repo, branch, raw_path
            ));
        }
    }
    Ok(url.to_string())
}

async fn download_pipe(url: &str) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    info!("Downloading pipe from URL: {}", url);

    let raw_url = get_raw_github_url(url)?;
    let parsed_url = Url::parse(&raw_url)?;
    if parsed_url.host_str() != Some("raw.githubusercontent.com") {
        return Err(
            "Only public GitHub URLs or raw.githubusercontent.com URLs are supported".into(),
        );
    }

    info!("Downloading... ");
    std::io::stdout().flush()?;

    let response = reqwest::get(&raw_url).await?;
    let content = response.text().await?;

    let mut temp_file = NamedTempFile::new()?;
    temp_file.write_all(content.as_bytes())?;

    // Extract the file extension from the URL
    let extension = Path::new(url)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("js"); // Default to .js if no extension is found

    // Create a new temporary file with the correct extension
    let temp_path = temp_file.into_temp_path();
    let final_path = temp_path.with_extension(extension);
    std::fs::rename(temp_path, &final_path)?;

    info!("Done!");

    Ok(final_path)
}

/*

PIPE_URL=https://raw.githubusercontent.com/mediar-ai/screenpipe/main/examples/typescript/pipe-tagging-activity/main.js
ollama run phi3.5
cargo build --release --features pipes
./target/release/screenpipe --pipe $PIPE_URL --port 3035 --data-dir /tmp/sp

*/

#[cfg(not(feature = "pipes"))]
fn main() {
    eprintln!("Pipes support is not enabled. Compile with --features pipes to enable it.");
    std::process::exit(1);
}
