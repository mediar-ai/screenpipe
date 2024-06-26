use chrono::Local;
use clap::Parser;
use crossbeam::channel;
use reqwest::Client;
use serde_json::json;
use std::fs::{create_dir_all, File};
use std::io::Read;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, sleep};
use std::time::Duration;
use tokio::runtime::Runtime;
use tokio::task;
use xcap::image::{ImageBuffer, Rgba};
use xcap::Monitor;
const DISPLAY: &str = r"
      ___         ___         ___         ___         ___         ___                   ___                 ___      ___     
     /  /\       /  /\       /  /\       /  /\       /  /\       /__/\                 /  /\    ___        /  /\    /  /\    
    /  /:/_     /  /:/      /  /::\     /  /:/_     /  /:/_      \  \:\               /  /::\  /  /\      /  /::\  /  /:/_   
   /  /:/ /\   /  /:/      /  /:/\:\   /  /:/ /\   /  /:/ /\      \  \:\             /  /:/\:\/  /:/     /  /:/\:\/  /:/ /\  
  /  /:/ /::\ /  /:/  ___ /  /:/~/:/  /  /:/ /:/_ /  /:/ /:/_ _____\__\:\           /  /:/~/:/__/::\    /  /:/~/:/  /:/ /:/_ 
 /__/:/ /:/\:/__/:/  /  //__/:/ /:/__/__/:/ /:/ //__/:/ /:/ //__/::::::::\         /__/:/ /:/\__\/\:\__/__/:/ /:/__/:/ /:/ /\
 \  \:\/:/~/:\  \:\ /  /:\  \:\/:::::\  \:\/:/ /:\  \:\/:/ /:\  \:\~~\~~\/         \  \:\/:/    \  \:\/\  \:\/:/\  \:\/:/ /:/
  \  \::/ /:/ \  \:\  /:/ \  \::/~~~~ \  \::/ /:/ \  \::/ /:/ \  \:\  ~~~           \  \::/      \__\::/\  \::/  \  \::/ /:/ 
   \__\/ /:/   \  \:\/:/   \  \:\      \  \:\/:/   \  \:\/:/   \  \:\                \  \:\      /__/:/  \  \:\   \  \:\/:/  
     /__/:/     \  \::/     \  \:\      \  \::/     \  \::/     \  \:\                \  \:\     \__\/    \  \:\   \  \::/   
     \__\/       \__\/       \__\/       \__\/       \__\/       \__\/                 \__\/               \__\/    \__\/    

";

#[derive(Parser)]
#[command(name = "screenpipe")]
#[command(about = "A tool to capture screenshots at regular intervals", long_about = None)]
struct Cli {
    /// Path to save screenshots
    #[arg(short, long, default_value = "target/screenshots")]
    path: String,

    /// Interval in seconds between screenshots (can be float, by default no delay)
    #[arg(short, long, default_value_t = 0.0)]
    interval: f32,
}

fn normalized(filename: &str) -> String {
    filename
        .replace("|", "")
        .replace("\\", "")
        .replace(":", "")
        .replace("/", "")
}

async fn call_ocr_api(image_path: &str) -> Result<String, reqwest::Error> {
    let client = Client::new();
    let mut file = File::open(image_path).expect("Failed to open image file");
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .expect("Failed to read image file");

    let part = reqwest::multipart::Part::bytes(buffer).file_name(image_path.to_string());
    let form = reqwest::multipart::Form::new().part("file", part);

    let response = client
        .post("http://127.0.0.1:8000/ocr/")
        .multipart(form)
        .send()
        .await?;

    let text = response.text().await?;
    Ok(text)
}


// ! HACK - in practice these pipes shouldn't be hard coded like shit here - just iterating quickly on ideas

async fn first_pipe(filename: String) -> (serde_json::Value, Option<String>) {
    // Example async post-processing function
    // Perform tasks like extracting text or making API calls here
    println!("First pipe: {}", filename);
    let text = call_ocr_api(&filename).await.unwrap();
    // println!("OCR result: {}", text);

    // Create a JSON object
    let json = serde_json::json!({ "text": text });
    let new_filename = filename.replace(".png", ".json");
    let mut file = File::create(new_filename).unwrap();
    file.write_all(json.to_string().as_bytes()).unwrap();

    // Return JSON and optionally the image path
    (json, Some(filename))
}

async fn second_pipe(mut json: serde_json::Value, image_path: Option<String>) {
    // Implement your magic here
    let client = Client::new();
    let response = client
        .post("http://localhost:11434/api/chat")
        .json(&json!({
            "model": "llama3",
            "stream": false,
            "messages": [
                { 
                    "role": "user", 
                    "content": format!("what is the user doing based on this OCR from his screen: {}. BE CONCISE AS FUCK, ONE LINER", json.to_string()) 
                }
            ]
        }))
        .send()
        .await
        .unwrap();
    let text: serde_json::Value = response.json().await.unwrap();
    let llm_response = text["message"]["content"].to_string();
    println!("Second pipe result: {}", llm_response);
    // update the json file by adding the LLM response 
    json["llm"] = serde_json::Value::String(llm_response);
    let new_filename = image_path.unwrap().replace(".png", ".json");
    let mut file = File::create(new_filename).unwrap();
    file.write_all(json.to_string().as_bytes()).unwrap();
}
fn screenpipe(path: &str, interval: f32, running: Arc<AtomicBool>) {
    // delete and recreate the directory
    println!("Deleting and recreating directory {}", path);
    if std::fs::metadata(path).is_ok() {
        std::fs::remove_dir_all(path).unwrap();
    }
    create_dir_all(path).unwrap();
    let monitors = Monitor::all().unwrap();
    let mut frame_count = 0;
    println!("Found {} monitors", monitors.len());
    println!("Screenshots will be saved to {}", path);
    println!("Interval: {} seconds", interval);
    println!("Press Ctrl+C to stop");
    println!("{}", DISPLAY);

    let (tx, rx) = channel::unbounded::<(ImageBuffer<Rgba<u8>, Vec<u8>>, String)>();
    let (post_tx, post_rx) = channel::unbounded::<String>();
    let (additional_tx, additional_rx) =
        channel::unbounded::<(serde_json::Value, Option<String>)>();
    let post_tx_clone = post_tx.clone();
    let additional_tx_clone = additional_tx.clone();

    // Thread for saving images
    let save_thread = thread::spawn(move || {
        while let Ok((image, filename)) = rx.recv() {
            image.save(&filename).unwrap();
            post_tx_clone.send(filename).unwrap(); // Send filename to post-processing
        }
    });

    // Async task for post-processing
    let first_pipe_thread = thread::spawn(move || {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            while let Ok(filename) = post_rx.recv() {
                let additional_tx_clone = additional_tx_clone.clone();
                task::spawn(async move {
                    // Perform async post-processing here
                    println!("Sending image to first pipe: {}", filename);
                    // Example: Call an async function to process the image
                    let (json, image_path) = first_pipe(filename).await;
                    additional_tx_clone.send((json, image_path)).unwrap();
                })
                .await
                .unwrap();
            }
        });
    });

    // Async task for additional processing
    let second_pipe_thread = thread::spawn(move || {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            while let Ok((json, image_path)) = additional_rx.recv() {
                task::spawn(async move {
                    // Perform async additional processing here
                    second_pipe(json, image_path).await;
                })
                .await
                .unwrap();
            }
        });
    });

    while running.load(Ordering::SeqCst) {
        let day_dir = format!("{}/{}", path, Local::now().format("%Y-%m-%d"));
        create_dir_all(&day_dir).unwrap();

        let sub_dir = format!("{}/{}", day_dir, frame_count / 60);
        create_dir_all(&sub_dir).unwrap();

        for monitor in &monitors {
            let image = monitor.capture_image().unwrap();
            let filename = format!(
                "{}/monitor-{}-{}.png",
                sub_dir,
                normalized(monitor.name()),
                frame_count
            );
            tx.send((image, filename)).unwrap();
        }
        // println!("Captured screens. Frame: {}", frame_count);
        sleep(Duration::from_secs_f32(interval));
        frame_count += 1;
    }
    drop(tx); // Close the channel
    save_thread.join().unwrap(); // Wait for the saving thread to finish
    drop(post_tx); // Close the post-processing channel
    first_pipe_thread.join().unwrap(); // Wait for the post-processing thread to finish
    drop(additional_tx); // Close the additional processing channel
    second_pipe_thread.join().unwrap(); // Wait for the additional processing thread to finish
}

fn main() {
    let cli = Cli::parse();
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    ctrlc::set_handler(move || {
        r.store(false, Ordering::SeqCst);
    })
    .expect("Error setting Ctrl-C handler");

    screenpipe(&cli.path, cli.interval, running);
}
