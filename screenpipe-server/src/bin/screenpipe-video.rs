use chrono::Utc;
use image::GenericImageView;
use screenpipe_server::VideoCapture;
use serde_json::{json, Value};
use std::fs::File;
use std::io::Write;
use std::sync::mpsc::channel;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

fn main() {
    let time = Utc::now();
    let output_path = format!("data/{}.mp4", time);
    let json_output_path = format!("data/{}.json", time);
    // create dir if not exists
    std::fs::create_dir_all("data").unwrap_or_default();
    let fps = 10.0;

    let video_capture = VideoCapture::new(&output_path, fps);
    let (tx, rx): (Sender<()>, Receiver<()>) = channel();
    let rx = Arc::new(Mutex::new(rx));
    let rx_thread = rx.clone();

    thread::spawn(move || loop {
        if let Ok(_) = rx_thread.lock().unwrap().try_recv() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    });

    println!("Press Ctrl+C to stop recording...");

    let mut json_data = Vec::new();
    let mut frame_count = 0;

    loop {
        if let Some(frame) = video_capture.get_latest_frame() {
            println!("Captured frame size: {:?}", frame.image.dimensions());
            println!("OCR Text: {}", frame.text);

            // Add frame data to JSON
            let frame_data = json!({
                "frame": frame_count,
                "timestamp": frame_count as f64 / fps,
                "ocr_text": frame.text
            });
            json_data.push(frame_data);

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

    video_capture.stop();
    println!("Video capture completed. Output saved to: {}", output_path);

    // Save JSON data
    let json_output = json!({
        "video_path": output_path,
        "fps": fps,
        "frames": json_data
    });

    let mut file = File::create(json_output_path.clone()).expect("Failed to create JSON file");
    file.write_all(
        serde_json::to_string_pretty(&json_output)
            .unwrap()
            .as_bytes(),
    )
    .expect("Failed to write JSON data");

    println!("JSON data saved to: {}", json_output_path);
}
