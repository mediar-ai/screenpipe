use anyhow::Result;
use clap::Parser;
use screenpipe_vision::{
    continuous_capture,capture_screenshot_by_window::WindowFilters, monitor::get_default_monitor, CaptureResult, OcrEngine,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::channel;
use tracing_subscriber::{fmt::format::FmtSpan, EnvFilter};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Windows to ignore (can be specified multiple times)
    #[arg(long)]
    ignore: Vec<String>,
    /// Windows to include (can be specified multiple times)
    #[arg(long)]
    include: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
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

    let monitor = get_default_monitor().await;
    let id = monitor.id();

    tokio::spawn(async move {

        let windows_filter = Arc::new(WindowFilters::new(
            &cli.ignore,
            &cli.include,
        ));

        continuous_capture(
            result_tx,
            Duration::from_secs(1),
            // if apple use apple otherwise if windows use windows native otherwise use tesseract
            if cfg!(target_os = "macos") {
                OcrEngine::AppleNative
            } else if cfg!(target_os = "windows") {
                OcrEngine::WindowsNative
            } else {
                OcrEngine::Tesseract
            },
            id,
            windows_filter,
            vec![],
            false,
        )
        .await
    });

    // Stream OCR results to logs
    while let Some(result) = result_rx.recv().await {
        log_capture_result(&result);
    }

    Ok(())
}

fn log_capture_result(result: &CaptureResult) {
    for window in &result.window_ocr_results {
        tracing::info!(
            "Window: '{}' (App: '{}', Focused: {})",
            window.window_name,
            window.app_name,
            window.focused
        );
        tracing::info!("Text: {}", window.text);
        tracing::info!("Confidence: {:.2}", window.confidence);
        tracing::info!("---");
    }
    tracing::info!("Timestamp: {:?}", result.timestamp);
    tracing::info!("=====================================");
}
