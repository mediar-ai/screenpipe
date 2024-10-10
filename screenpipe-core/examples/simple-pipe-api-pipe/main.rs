use std::path::Path;
use anyhow::Result;
use dirs::home_dir;
use screenpipe_core::{download_pipe, run_pipe};
use tracing::info;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

// ollama run nemotron-mini:4b-instruct-q4_k_m
// cargo run --package screenpipe-core --example simple-pipe-api-pipe --features metal --features pipes 

#[tokio::main]
async fn main() -> Result<()> {
    let console_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_filter(EnvFilter::new("info"));
    tracing_subscriber::registry().with(console_layer).init();

    // Set up the path to the screenpipe directory
    let screenpipe_dir = home_dir().unwrap().join(".screenpipe");

    // The name of the pipe (folder name in examples)
    let pipe_url = "screenpipe-core/examples/simple-pipe-api-pipe";
    let pipe_name = Path::new(pipe_url).file_name().unwrap().to_str().unwrap();
    info!("Starting the simple pipe API pipe...");

    // download the pipe
    download_pipe(pipe_url, screenpipe_dir.clone()).await?;

    // Run the pipe
    match run_pipe(pipe_name, screenpipe_dir).await {
        Ok(_) => println!("Pipe execution completed successfully."),
        Err(e) => eprintln!("Error executing pipe: {}", e),
    }

    Ok(())
}
