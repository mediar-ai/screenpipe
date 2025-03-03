use clap::Parser;
use screenpipe_core::Language;
use screenpipe_vision::{
    capture_screenshot_by_window::WindowFilters, continuous_capture, OcrEngine,
};
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc::channel;
use tracing_subscriber::{fmt::format::FmtSpan, EnvFilter};
use xcap::Monitor;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// FPS
    #[arg(long, default_value_t = 1.0)]
    fps: f32,

    #[arg(short = 'l', long, value_enum)]
    language: Vec<Language>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive(tracing::Level::DEBUG.into())
                .add_directive("tokenizers=error".parse().unwrap()),
        )
        .with_span_events(FmtSpan::CLOSE)
        .init();
    let cli = Cli::parse();

    let (result_tx, mut result_rx) = channel(512);
    let languages = cli.language;

    // Get monitor ID before spawning the task
    let monitor_id =
        tokio::task::spawn_blocking(|| Monitor::all().unwrap().first().unwrap().id().unwrap())
            .await
            .unwrap();

    let window_filters = Arc::new(WindowFilters::new(&[], &[]));

    continuous_capture(
        result_tx,
        Duration::from_secs_f32(1.0 / cli.fps),
        OcrEngine::AppleNative,
        monitor_id,
        window_filters,
        languages.clone(),
        false,
    )
    .await;

    // Example: Process results for 10 seconds, then pause for 5 seconds, then stop
    loop {
        if let Some(result) = result_rx.recv().await {
            for window_result in &result.window_ocr_results {
                println!(
                    "Window: {}\nApp: {}\nText length: {}\nJSON data: {:?}",
                    window_result.window_name,
                    window_result.app_name,
                    window_result.text.len(),
                    window_result.text_json // Use {:?} to print the JSON data
                );
            }
        }

        // tokio::time::sleep(Duration::from_secs_f32(1.0 / cli.fps)).await;
    }
}
