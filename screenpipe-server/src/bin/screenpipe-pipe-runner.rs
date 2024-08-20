use clap::Parser;
use log::LevelFilter;
#[cfg(feature = "pipes")]
use screenpipe_core::run_js;
use screenpipe_server::Cli;
use std::path::Path;

#[cfg(feature = "pipes")]
fn main() {
    let cli = Cli::parse(); // Parse CLI arguments

    if cli.pipe.is_empty() {
        eprintln!("No pipe specified. Use --pipe to specify the pipe.");
        std::process::exit(1);
    }

    let mut builder = env_logger::Builder::new();
    builder
        .filter(None, LevelFilter::Info)
        .format_timestamp_secs()
        .init();

    let path_to_main_module = Path::new(cli.pipe[0].as_str()).canonicalize().unwrap();

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    if let Err(error) = runtime.block_on(run_js(&path_to_main_module.to_string_lossy())) {
        eprintln!("error: {error}");
    }
}

#[cfg(not(feature = "pipes"))]
fn main() {
    eprintln!("Pipes support is not enabled. Compile with --features pipes to enable it.");
    std::process::exit(1);
}
