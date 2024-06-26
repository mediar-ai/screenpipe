use chrono::Local;
use clap::Parser;
use crossbeam::channel;
use std::fs::create_dir_all;
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

async fn process_image(filename: String) {
    // Example async post-processing function
    // Perform tasks like extracting text or making API calls here
    println!("Processing image asynchronously: {}", filename);
    // Simulate async work
    tokio::time::sleep(Duration::from_secs(1)).await;
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
    let post_tx_clone = post_tx.clone();
    // Thread for saving images
    let save_thread = thread::spawn(move || {
        while let Ok((image, filename)) = rx.recv() {
            image.save(&filename).unwrap();
            post_tx_clone.send(filename).unwrap(); // Send filename to post-processing
        }
    });

    // Async task for post-processing
    let post_processing_thread = thread::spawn(move || {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            while let Ok(filename) = post_rx.recv() {
                task::spawn(async move {
                    // Perform async post-processing here
                    println!("Post-processing image: {}", filename);
                    // Example: Call an async function to process the image
                    process_image(filename).await;
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
        println!("Captured screens. Frame: {}", frame_count);
        sleep(Duration::from_secs_f32(interval));
        frame_count += 1;
    }
    drop(tx); // Close the channel
    save_thread.join().unwrap(); // Wait for the saving thread to finish
    drop(post_tx); // Close the post-processing channel
    post_processing_thread.join().unwrap(); // Wait for the post-processing thread to finish
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
