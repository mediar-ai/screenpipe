use chrono::Utc;
use clap::Parser;
use env_logger::Env;
use image::GenericImageView;
use log::info;
use screenpipe_server::core::DataOutputWrapper;
use screenpipe_server::VideoCapture;
use screenpipe_vision::OcrEngine;
use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tokio::sync::mpsc::{channel, Receiver, Sender}; // Correct import

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Save text files
    #[arg(long, default_value_t = false)]
    save_text_files: bool,

    /// Disable cloud OCR processing
    #[arg(long, default_value_t = false)]
    cloud_ocr_off: bool, // Add this flag
}

fn write_json_frame(writer: &mut BufWriter<File>, frame_data: &Value) -> std::io::Result<()> {
    serde_json::to_writer(writer.by_ref(), frame_data)?;
    writeln!(writer)?;
    writer.flush()
}

// ! not well maintained code

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let cli = Cli::parse();
    let save_text_files = cli.save_text_files;

    let time = Utc::now();
    let formatted_time = time.format("%Y-%m-%d_%H-%M-%S").to_string();
    let output_path = "data";
    let json_output_path = format!("data/{}.json", formatted_time);

    // create dir if not exists
    std::fs::create_dir_all("data").unwrap_or_default();
    info!("Created data directory {}", output_path);
    let fps = 10.0;

    let new_chunk_callback = {
        move |file_path: &str| {
            info!("New chunk: {}", file_path);
        }
    };

    let video_capture = VideoCapture::new(
        output_path,
        fps,
        new_chunk_callback,
        save_text_files,
        Arc::new(OcrEngine::Tesseract),
    ); // Pass the cloud_ocr flag
    let (_tx, rx): (Sender<()>, Receiver<()>) = channel(32);
    let rx = Arc::new(Mutex::new(rx));
    let rx_thread = rx.clone();

    thread::spawn(move || loop {
        if let Ok(_) = rx_thread.lock().unwrap().try_recv() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    });

    println!("Press Ctrl+C to stop recording...");

    let json_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&json_output_path)
        .expect("Failed to create JSON file");
    let mut json_writer = BufWriter::new(json_file);

    let mut frame_count = 0;

    loop {
        if let Some(frame) = video_capture.get_latest_frame().await {
            info!("Captured frame size: {:?}", frame.image.dimensions());
            info!("OCR Text len: {}", frame.text.len());

            let frame_data = json!({
                "frame": frame_count,
                "timestamp": frame_count as f64 / fps,
                "ocr_text": frame.text,
                "text_json": frame.text_json,
                "new_text_json": frame.new_text_json,
                "data_output": DataOutputWrapper { data_output: frame.data_output }.to_json(),
            });

            write_json_frame(&mut json_writer, &frame_data).expect("Failed to write JSON frame");

            frame_count += 1;
        }

        if let Err(_) = rx.lock().unwrap().try_recv() {
            // Channel is empty, continue recording
            thread::sleep(Duration::from_millis(33)); // ~30 fps
        } else {
            // Received stop signal
            break;
        }
    }

    println!("Video capture completed. Output saved to: {}", output_path);
    println!("JSON data saved to: {}", json_output_path);
}
