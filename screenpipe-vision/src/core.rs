use image::DynamicImage;
use log::info;
use rusty_tesseract::{Args, Image};
use threadpool::ThreadPool;
use xcap::Monitor;

use std::collections::HashMap;
use std::hash::DefaultHasher;
use std::hash::Hash;
use std::hash::Hasher;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
pub enum ControlMessage {
    Pause,
    Resume,
    Stop,
}

pub struct CaptureResult {
    pub image: Arc<DynamicImage>,
    pub text: String,
}

const MAX_THREADS: usize = 8; // Adjust based on your needs

pub fn continuous_capture(
    control_rx: Receiver<ControlMessage>,
    result_tx: Sender<CaptureResult>,
    interval: Duration,
) {
    let monitors = Monitor::all().unwrap();
    let monitor = monitors.first().unwrap();
    let cpu_count = num_cpus::get();
    let pool_size = (cpu_count as f32 * 1.2) as usize;
    let pool_size = std::cmp::min(pool_size, MAX_THREADS);

    info!("Will use {} threads for OCR", pool_size);

    let ocr_pool = ThreadPool::new(pool_size);
    let is_paused = Arc::new(Mutex::new(false));
    let should_stop = Arc::new(Mutex::new(false));
    let cache = Arc::new(Mutex::new(HashMap::<u64, String>::new()));
    loop {
        // Check for control messages
        if let Ok(message) = control_rx.try_recv() {
            match message {
                ControlMessage::Pause => *is_paused.lock().unwrap() = true,
                ControlMessage::Resume => *is_paused.lock().unwrap() = false,
                ControlMessage::Stop => {
                    *should_stop.lock().unwrap() = true;
                    break;
                }
            }
        }

        if *is_paused.lock().unwrap() {
            thread::sleep(Duration::from_millis(100));
            continue;
        }

        // Capture screenshot
        let buffer = monitor.capture_image().unwrap();
        let image = DynamicImage::ImageRgba8(buffer);

        // Generate hash for the image
        let image_hash = calculate_hash(&image);

        // Clone necessary values for the OCR thread
        let result_tx_clone = result_tx.clone();
        let image_arc = Arc::new(image);
        let cache_clone = Arc::clone(&cache);

        // Perform OCR in a separate thread
        ocr_pool.execute(move || {
            let mut cache = cache_clone.lock().unwrap();
            let text = if let Some(cached_text) = cache.get(&image_hash) {
                cached_text.clone()
            } else {
                let new_text = perform_ocr(&image_arc);
                cache.insert(image_hash, new_text.clone());
                new_text
            };

            result_tx_clone
                .send(CaptureResult {
                    image: image_arc,
                    text,
                })
                .unwrap();
        });

        thread::sleep(interval);

        if *should_stop.lock().unwrap() {
            break;
        }
    }

    ocr_pool.join();
}

fn calculate_hash(image: &DynamicImage) -> u64 {
    let mut hasher = DefaultHasher::new();
    image.as_bytes().hash(&mut hasher);
    hasher.finish()
}

fn perform_ocr(image: &DynamicImage) -> String {
    let args = Args::default();
    let ocr_image = Image::from_dynamic_image(image).unwrap();
    rusty_tesseract::image_to_string(&ocr_image, &args)
        .unwrap_or_else(|_| String::from("OCR failed"))
}
