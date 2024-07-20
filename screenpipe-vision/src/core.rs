use image::DynamicImage;
use log::{debug, error, info};
use rusty_tesseract::DataOutput;
use tokio::sync::{mpsc::{Receiver, Sender}, Mutex}; // Corrected import for Mutex
use serde_json;
use std::{collections::{HashMap, HashSet}, sync::Arc, time::{Duration, Instant}};
use xcap::Monitor;
use strsim::levenshtein;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::utils::{perform_ocr, save_text_files, capture_screenshot, compare_with_previous_image};

pub enum ControlMessage {
    Pause,
    Resume,
    Stop,
}

pub struct CaptureResult {
    pub image: Arc<DynamicImage>,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub data_output: DataOutput,
}

pub struct OcrTaskData {
    pub image: Arc<DynamicImage>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
}

const MAX_THREADS: usize = 1;

pub async fn continuous_capture(
    _control_rx: &mut Receiver<ControlMessage>,
    result_tx: Sender<CaptureResult>,
    interval: Duration,
    save_text_files_flag: bool, 
) {
    let monitor = Monitor::all().unwrap().first().unwrap().clone(); // Simplified monitor retrieval
    let cache = Arc::new(Mutex::new(HashMap::<u64, String>::new()));
    let previous_text_json = Arc::new(Mutex::new(None));
    let ocr_task_running = Arc::new(AtomicBool::new(false));
    let mut frame_counter: u64 = 0;
    // let start_time = Instant::now();
    let mut previous_image: Option<Arc<DynamicImage>> = None;
    let mut max_average: Option<MaxAverageFrame> = None;
    let mut max_avg_value = 0.0;

    loop {
        let (image, image_hash, _capture_duration) = capture_screenshot(&monitor).await;
        let current_average = compare_with_previous_image(&previous_image, &image, &mut max_average, frame_counter, &mut max_avg_value).await;
        if current_average > max_avg_value {
            max_average = Some(MaxAverageFrame {
                image: Arc::new(image.clone()),
                image_hash,
                frame_number: frame_counter,
                timestamp: Instant::now(),
                result_tx: result_tx.clone(),
                average: current_average,
            });
            max_avg_value = current_average;
        }

        previous_image = Some(Arc::new(image.clone()));
        // debug!("ocr_task_running {} BEFORE if if !ocr_task_running.load(Ordering::SeqCst)", ocr_task_running.load(Ordering::SeqCst));

        if !ocr_task_running.load(Ordering::SeqCst) {
            // debug!("max_avg_frame {} before if let Some(", max_avg_value);
            if let Some(max_avg_frame) = max_average.take() { // Use take() to move out the value
                let ocr_task_data = OcrTaskData {
                    image: max_avg_frame.image.clone(),
                    frame_number: max_avg_frame.frame_number,
                    timestamp: max_avg_frame.timestamp,
                    result_tx: result_tx.clone(),
                };

                let cache_clone = cache.clone();
                let previous_text_json_clone = previous_text_json.clone();
                let ocr_task_running_clone = ocr_task_running.clone();

                ocr_task_running.store(true, Ordering::SeqCst);
                // debug!("ocr_task_running {}", ocr_task_running.load(Ordering::SeqCst));
                tokio::spawn(async move {
                    if let Err(e) = process_ocr_task(
                        ocr_task_data.image,
                        ocr_task_data.frame_number,
                        ocr_task_data.timestamp,
                        ocr_task_data.result_tx,
                        &cache_clone,
                        &previous_text_json_clone,
                        save_text_files_flag, // Pass the flag here
                    ).await {
                        error!("Error processing OCR task: {}", e);
                    }
                    ocr_task_running_clone.store(false, Ordering::SeqCst);
                    // debug!("ocr_task_running_clone {}", ocr_task_running_clone.load(Ordering::SeqCst));
                });

                // Reset max_average and max_avg_value after spawning the OCR task
                max_avg_value = 0.0;
                // debug!("max_avg_value {}", max_avg_value);

            }
        }

        frame_counter += 1;
        // debug!("frame_counter triggered to {}, interval is {:?}", frame_counter, interval);
        // let total_duration = start_time.elapsed();
        // info!(
        //     "Capture completed. Total frames: {}, Total time: {:.1?}, Avg FPS: {:.2}",
        //     frame_counter,
        //     total_duration,
        //     frame_counter as f64 / total_duration.as_secs_f64()
        // );
        tokio::time::sleep(interval).await;
        // debug!("paseed tokio::time::sleep");
    }
}

pub struct MaxAverageFrame {
    pub image: Arc<DynamicImage>,
    pub image_hash: u64,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
    pub average: f64,
}

async fn process_ocr_task(
    image_arc: Arc<DynamicImage>,
    frame_number: u64,
    timestamp: Instant,
    result_tx: Sender<CaptureResult>,
    cache: &Arc<Mutex<HashMap<u64, String>>>,
    previous_text_json: &Arc<Mutex<Option<Vec<HashMap<String, String>>>>>,
    save_text_files_flag: bool, // Add this parameter
) -> Result<(), std::io::Error> {
    let start_time = Instant::now();

    debug!("Performing OCR for frame {}", frame_number);
    let (text, data_output, json_output) = perform_ocr(&image_arc);

    let current_text_json: Vec<HashMap<String, String>> = serde_json::from_str(&json_output).unwrap_or_else(|e| {
        error!("Failed to parse JSON output: {}", e);
        Vec::new()
    });

    let mut previous_text_json = previous_text_json.lock().await;
    let mut new_text_json = Vec::new();
    if let Some(prev_json) = &*previous_text_json {
        for current_record in &current_text_json {
            let confidence: f64 = current_record["confidence"].parse().unwrap_or(0.0);
            if confidence > 60.0 {
                let is_new = prev_json.iter().all(|prev_record| {
                    let distance = levenshtein(&current_record["text"], &prev_record["text"]);
                    let threshold = (prev_record["text"].len() as f64 * 0.1).ceil() as usize;
                    distance > threshold
                });
                if is_new {
                    new_text_json.push(current_record.clone());
                }
            }
        }
    } else {
        new_text_json = current_text_json.iter()
            .filter(|record| record["confidence"].parse::<f64>().unwrap_or(0.0) > 60.0)
            .cloned()
            .collect();
    }

    let mut seen_texts = HashSet::new();
    new_text_json.retain(|record| seen_texts.insert(record["text"].clone()));

    if save_text_files_flag {
        save_text_files(frame_number, &new_text_json, &current_text_json, &previous_text_json).await;
    }

    *previous_text_json = Some(current_text_json.clone());

    if let Err(e) = result_tx
        .send(CaptureResult {
            image: image_arc.into(),
            text: text.clone(),
            text_json: current_text_json,
            frame_number,
            timestamp,
            data_output,
        })
        .await
    {
        error!("Failed to send OCR result: {}", e);
        return Err(std::io::Error::new(std::io::ErrorKind::Other, "Failed to send OCR result"));
    }
    let _duration = start_time.elapsed();
    debug!(
        "OCR task processed frame {} in {:?}",
        frame_number, _duration
    );
    Ok(())
}