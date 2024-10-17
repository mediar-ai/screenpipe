use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use image::ImageEncoder;
use screenpipe_vision::{
    continuous_capture, monitor::get_default_monitor, CaptureResult, OcrEngine,
};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::channel;
use tokio_tungstenite::tungstenite::Message;
use tracing_subscriber::{fmt::format::FmtSpan, EnvFilter};

#[derive(Clone, Serialize)]
struct SimplifiedResult {
    windows: Vec<SimplifiedWindowResult>,
    timestamp: u64,
}

#[derive(Clone, Serialize)]
pub struct SimplifiedWindowResult {
    // pub image: String,
    pub window_name: String,
    pub app_name: String,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>, // Change this line
    pub focused: bool,
    pub confidence: f64,
}

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Save text files
    #[arg(long, default_value_t = false)]
    save_text_files: bool,

    /// FPS for continuous recording
    /// 1 FPS = 30 GB / month
    /// 5 FPS = 150 GB / month
    /// Optimise based on your needs.
    /// Your screen rarely change more than 1 times within a second, right?
    #[cfg_attr(not(target_os = "macos"), arg(short, long, default_value_t = 1.0))]
    #[cfg_attr(target_os = "macos", arg(short, long, default_value_t = 0.2))]
    fps: f64,

    /// WebSocket port
    #[arg(long, default_value_t = 8080)]
    ws_port: u16,

    /// List of windows to ignore (by title) for screen recording
    #[arg(long)]
    ignored_windows: Vec<String>,

    /// List of windows to include (by title) for screen recording
    #[arg(long)]
    included_windows: Vec<String>,
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

    let (result_tx, result_rx) = channel(512);

    let save_text_files = cli.save_text_files;
    let ws_port = cli.ws_port;

    let monitor = get_default_monitor().await;
    let id = monitor.id();

    tokio::spawn(async move {
        continuous_capture(
            result_tx,
            Duration::from_secs_f64(1.0 / cli.fps),
            save_text_files,
            // if apple use apple otherwise if windows use windows native otherwise use tesseract
            if cfg!(target_os = "macos") {
                OcrEngine::AppleNative
            } else if cfg!(target_os = "windows") {
                OcrEngine::WindowsNative
            } else {
                OcrEngine::Tesseract
            },
            id,
            &cli.ignored_windows,
            &cli.included_windows,
            vec![],
        )
        .await
    });

    // Start WebSocket server
    tokio::spawn(async move { run_websocket_server(ws_port, result_rx).await });

    // Keep the main thread alive
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn run_websocket_server(
    port: u16,
    mut result_rx: tokio::sync::mpsc::Receiver<CaptureResult>,
) -> Result<()> {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    println!("websocket server listening on: {}", addr);

    let (tx, _) = tokio::sync::broadcast::channel::<SimplifiedResult>(2);
    let tx = Arc::new(tx);

    let tx_clone = tx.clone();
    tokio::spawn(async move {
        while let Some(result) = result_rx.recv().await {
            let simplified = SimplifiedResult {
                windows: result
                    .window_ocr_results
                    .into_iter()
                    .map(|window| {
                        let mut buffer = Vec::new();
                        let encoder = image::codecs::png::PngEncoder::new(&mut buffer);
                        encoder
                            .write_image(
                                window.image.as_bytes(),
                                window.image.width(),
                                window.image.height(),
                                window.image.color().into(),
                            )
                            .expect("Failed to encode image");
                        let _base64_image = general_purpose::STANDARD.encode(buffer);

                        SimplifiedWindowResult {
                            // image: base64_image,
                            window_name: window.window_name,
                            app_name: window.app_name,
                            text: window.text,
                            text_json: window.text_json, // Add this line
                            focused: window.focused,
                            confidence: window.confidence,
                        }
                    })
                    .collect(),
                timestamp: result.timestamp.elapsed().as_secs(),
            };
            let _ = tx_clone.send(simplified);

            // resubscribe to get only the latest message
            let _ = tx_clone.subscribe().resubscribe();
        }
    });

    while let Ok((stream, _)) = listener.accept().await {
        let rx = tx.subscribe();
        tokio::spawn(handle_connection(stream, rx));
    }

    Ok(())
}

async fn handle_connection(
    stream: TcpStream,
    mut result_rx: tokio::sync::broadcast::Receiver<SimplifiedResult>,
) {
    let ws_stream = tokio_tungstenite::accept_async(stream)
        .await
        .expect("Error during WebSocket handshake");
    println!("New WebSocket connection");

    let (mut ws_sender, _) = ws_stream.split();

    while let Ok(result) = result_rx.recv().await {
        let message = serde_json::to_string(&result).expect("Failed to serialize result");
        if let Err(e) = ws_sender.send(Message::Text(message)).await {
            eprintln!("WebSocket send error: {:?}", e);
            break;
        }
    }
}

/*

first: cargo run --example screenpipe-vision-websocket


Python one-liner to connect and print WebSocket data:
virtualenv /tmp/screenpipe-vision
source /tmp/screenpipe-vision/bin/activate
pip install websockets

# open python3 and copy paste the code and press enter
python3

import asyncio
import websockets

async def main():
    async with websockets.connect('ws://localhost:8080') as ws:
        print(await ws.recv())

asyncio.run(main())

*/

/*

or npm i ws

node and paste this

const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', function open() {
  console.log('Connected to WebSocket server');
});

ws.on('message', function incoming(data) {
  console.log('Received:', data.toString());
  ws.close();
});

ws.on('close', function close() {
  console.log('Disconnected from WebSocket server');
});

*/
