use clap::Parser;
use screenpipe_core::Language;
use screenpipe_vision::{
    continuous_capture, core::CaptureSource, monitor::get_default_monitor, OcrEngine,
};
use std::time::Duration;
use tokio::sync::mpsc::channel;
use tracing_subscriber::{fmt::format::FmtSpan, EnvFilter};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Save text files
    #[arg(long, default_value_t = false)]
    save_text_files: bool,

    /// FPS
    #[arg(long, default_value_t = 1.0)]
    fps: f32,

    #[arg(short = 'l', long, value_enum)]
    language: Vec<Language>,

    #[arg(long)]
    rdp_session_id: Option<String>,

    #[arg(long)]
    monitor_id: Option<u32>,
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

    let save_text_files = cli.save_text_files;
    let languages = cli.language;

    tokio::spawn(async move {
        let capture_source = if let Some(session_id) = cli.rdp_session_id {
            CaptureSource::RdpSession(Box::leak(session_id.into_boxed_str()))
        } else if let Some(monitor_id) = cli.monitor_id {
            CaptureSource::LocalMonitor(monitor_id)
        } else {
            CaptureSource::LocalMonitor(get_default_monitor().await.id())
        };

        continuous_capture(
            result_tx,
            Duration::from_secs_f32(1.0 / cli.fps),
            save_text_files,
            OcrEngine::AppleNative,
            capture_source,
            &[],
            &[],
            languages,
        )
        .await
    });

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
