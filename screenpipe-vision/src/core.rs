use image::DynamicImage;
use log::info;
use rusty_tesseract::{Args, Image};
use threadpool::ThreadPool;
use xcap::Monitor;

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
    pub image: DynamicImage,
    pub text: String,
}

const MAX_THREADS: usize = 16; // Adjust based on your needs

pub fn continuous_capture(
    control_rx: Receiver<ControlMessage>,
    result_tx: Sender<CaptureResult>,
    interval: Duration,
) {
    let monitor = Monitor::all().unwrap().first().unwrap().clone();
    let cpu_count = num_cpus::get();
    let pool_size = (cpu_count as f32 * 1.2) as usize;
    let pool_size = std::cmp::min(pool_size, MAX_THREADS);

    info!("Will use {} threads for OCR", pool_size);

    let ocr_pool = ThreadPool::new(pool_size);
    let is_paused = Arc::new(Mutex::new(false));
    let should_stop = Arc::new(Mutex::new(false));
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

        // Clone necessary values for the OCR thread
        let result_tx_clone = result_tx.clone();
        let image_clone = image.clone();

        // Perform OCR in a separate thread
        ocr_pool.execute(move || {
            let text = perform_ocr(&image_clone);
            result_tx_clone
                .send(CaptureResult {
                    image: image_clone,
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

fn perform_ocr(image: &DynamicImage) -> String {
    let args = Args::default();
    let ocr_image = Image::from_dynamic_image(image).unwrap();
    rusty_tesseract::image_to_string(&ocr_image, &args)
        .unwrap_or_else(|_| String::from("OCR failed"))
}
