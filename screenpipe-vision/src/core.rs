use image::DynamicImage;
use log::{debug, error, info};
use rusty_tesseract::{Args, Image, DataOutput};
use tokio::sync::broadcast;
use tokio::sync::broadcast::error::RecvError;
use xcap::Monitor;

use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::Mutex;
use tokio::task;
use serde_json;
use image_compare::{Algorithm, Metric, Similarity}; // Added import for Similarity
use strsim::levenshtein; // Added import for strsim
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::utils::{calculate_hash, save_json_to_file, compare_images_histogram, compare_images_ssim, perform_ocr}; // Import the functions

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

const MAX_THREADS: usize = 1; // Adjust based on your needs
// const MAX_QUEUE_SIZE: usize = 1; // Maximum number of frames to keep in the queue. 64/8 o
                                 // seems kinda counter intuitive but less threads for OCR = more CPU usage = less frame dropping

pub async fn continuous_capture(
    control_rx: &mut Receiver<ControlMessage>,
    result_tx: Sender<CaptureResult>,
    interval: Duration,
) {
    let monitors = Monitor::all().unwrap();
    let monitor = monitors.first().unwrap();
    let cpu_count = num_cpus::get();
    let pool_size = (cpu_count as f32 * 1.2) as usize;
    let pool_size = std::cmp::min(pool_size, MAX_THREADS);

    info!("Will use {} tasks for OCR", pool_size);
    let is_paused = Arc::new(Mutex::new(false));
    let should_stop = Arc::new(Mutex::new(false));
    let cache = Arc::new(Mutex::new(HashMap::<u64, String>::new()));

    let (ocr_tx, _) =
        broadcast::channel::<(Arc<DynamicImage>, u64, u64, Instant, Sender<CaptureResult>)>(3);
    let ocr_tx = Arc::new(ocr_tx);

    let previous_text_json = Arc::new(Mutex::new(None));

    let is_active = Arc::new(Mutex::new(false));

    // Spawn OCR tasks
    let ocr_handles: Vec<_> = (0..pool_size)
        .map(|id| {
            let mut ocr_rx = ocr_tx.subscribe();
            let cache = Arc::clone(&cache);
            let should_stop = Arc::clone(&should_stop);
            let previous_text_json = Arc::clone(&previous_text_json);
            let is_active = Arc::clone(&is_active);
            task::spawn(async move {
                debug!("OCR task {} started", id);
                while !*should_stop.lock().await {
                    match ocr_rx.recv().await {
                        Ok((image_arc, image_hash, frame_number, timestamp, result_tx)) => {
                            debug!("OCR task {} received frame {}", id, frame_number);
                            // Only process if the frame number modulo pool_size equals this task's id
                            // if frame_number % pool_size as u64 == id as u64 {
                            let start_time = Instant::now();
                            let mut cache = cache.lock().await;
                            let (text, data_output, json_output) = if let Some(cached_text) = cache.get(&image_hash) {
                                debug!("Using cached text for frame {}", frame_number);
                                (cached_text.clone(), DataOutput { output: String::new(), data: vec![] }, String::new())
                            } else {
                                // Set is_active to true before performing OCR
                                *is_active.lock().await = true;

                                debug!("Performing OCR for frame {}", frame_number);
                                let (new_text, data_output, new_json_output) = perform_ocr(&image_arc);
                                cache.insert(image_hash, new_text.clone());

                                // Set is_active to false after performing OCR
                                *is_active.lock().await = false;

                                (new_text, data_output, new_json_output)
                            };

                            let current_text_json: Vec<HashMap<String, String>> = serde_json::from_str(&json_output).unwrap();
                            let mut previous_text_json = previous_text_json.lock().await;

                            // Debug logging for current and previous text_json
                            let current_text_json_len: usize = current_text_json.iter().map(|s| s.len()).sum();
                            let previous_text_json_len: usize = previous_text_json.as_ref().map_or(0, |v: &Vec<HashMap<String, String>>| v.iter().map(|s| s.len()).sum());

                            debug!("JSON length Current: {} Previous: {}", current_text_json_len, previous_text_json_len);

                            // Compare current and previous text_json to create new_text_json
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

                            // Save text files
                            let id = frame_number; // Use frame_number as the incremental ID
                            debug!("Saving text files for frame {}", frame_number);

                            // Extract raw text lines from new_text_json
                            let new_text_lines: Vec<String> = new_text_json.iter().map(|record| {
                                record.get("text").cloned().unwrap_or_default()
                            }).collect();

                            // Extract raw text lines from current_text_json
                            let current_text_lines: Vec<String> = current_text_json.iter().map(|record| {
                                record.get("text").cloned().unwrap_or_default()
                            }).collect();

                            // Save new text lines to file
                            let new_text_file_path = format!("text_json/new_text_{}.txt", id);
                            let mut new_text_file = File::create(&new_text_file_path).unwrap();
                            for line in new_text_lines {
                                writeln!(new_text_file, "{}", line).unwrap();
                            }

                            // Save current text lines to file
                            let current_text_file_path = format!("text_json/current_text_{}.txt", id);
                            let mut current_text_file = File::create(&current_text_file_path).unwrap();
                            for line in current_text_lines {
                                writeln!(current_text_file, "{}", line).unwrap();
                            }

                            // Save previous text lines to file if available
                            if let Some(prev_json) = &*previous_text_json {
                                let prev_text_lines: Vec<String> = prev_json.iter().map(|record| {
                                    record.get("text").cloned().unwrap_or_default()
                                }).collect();
                                let prev_text_file_path = format!("text_json/previous_text_{}.txt", id);
                                let mut prev_text_file = File::create(&prev_text_file_path).unwrap();
                                for line in prev_text_lines {
                                    writeln!(prev_text_file, "{}", line).unwrap();
                                }
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
                            }
                            let _duration = start_time.elapsed();
                            debug!(
                                "OCR task {} processed frame {} in {:?}",
                                id, frame_number, _duration
                            );
                            // }
                        }
                        Err(e) => match e {
                            RecvError::Lagged(_) => {
                                debug!("OCR task {} lagged behind: {}", id, e);
                            }
                            _ => {
                                error!("OCR channel error for task {}: {}", id, e);
                                break;
                            }
                        },
                    }
                }
                debug!("OCR task {} stopped", id);
            })
        })
        .collect();

    let mut frame_counter: u64 = 0;
    let start_time = Instant::now();
    let mut last_processed_frame = 0;

    let mut previous_image: Option<Arc<DynamicImage>> = None;

    // Struct to hold the max average frame data
    struct MaxAverageFrame {
        image: Arc<DynamicImage>,
        image_hash: u64,
        frame_number: u64,
        timestamp: Instant,
        result_tx: Sender<CaptureResult>,
        average: f64,
    }

    let mut max_average: Option<MaxAverageFrame> = None;
    let mut max_avg_frame: Option<MaxAverageFrame> = None;

    let mut max_avg_value = 0.0;

    while !*should_stop.lock().await {
        // Check for control messages
        if let Ok(message) = control_rx.try_recv() {
            match message {
                ControlMessage::Pause => *is_paused.lock().await = true,
                ControlMessage::Resume => *is_paused.lock().await = false,
                ControlMessage::Stop => {
                    *should_stop.lock().await = true;
                    break;
                }
            }
        }

        if *is_paused.lock().await {
            tokio::time::sleep(Duration::from_millis(100)).await;
            continue;
        }

        // Capture screenshot
        let capture_start = Instant::now();
        let buffer = monitor.capture_image().unwrap();
        let image = DynamicImage::ImageRgba8(buffer);
        let image_hash = calculate_hash(&image);        // Generate hash for the image
        let capture_duration = capture_start.elapsed();

        // Initialize current_average
        let mut current_average = 0.0;

        // Compare with previous image and print the differences
        if let Some(prev_image) = &previous_image {
            let histogram_diff = compare_images_histogram(prev_image, &image);
            let ssim_diff = 1.0 - compare_images_ssim(prev_image, &image);
            current_average = (histogram_diff + ssim_diff) / 2.0;
            max_avg_value = max_average.as_ref().map_or(0.0, |frame| frame.average);
            debug!(
                "Frame {}: Histogram diff: {:.3}, SSIM diff: {:.3}, Current Average: {:.3}, Max Average: {:.3}",
                frame_counter, histogram_diff, ssim_diff, current_average, max_avg_value
            );
            if current_average < max_avg_value {
                // debug!("Dropping frame {} due to lower average", frame_counter);
                frame_counter += 1;
                tokio::time::sleep(interval).await;
                continue;
            } else {
                debug!("Storing frame {} as max_average {}", frame_counter, current_average);
                max_average = Some(MaxAverageFrame {
                    image: Arc::new(image.clone()),
                    image_hash,
                    frame_number: frame_counter, 
                    timestamp: capture_start,
                    result_tx: result_tx.clone(),
                    average: current_average,
                });
            }
        } else {
            debug!("No previous image to compare for frame {}", frame_counter);
        }

        // Set max_average if it is None
        if max_average.is_none() {
            debug!("Setting frame {} as initial max_average {}", frame_counter, current_average);
            max_average = Some(MaxAverageFrame {
                image: Arc::new(image.clone()),
                image_hash,
                frame_number: frame_counter,
                timestamp: capture_start,
                result_tx: result_tx.clone(),
                average: current_average,
            });
        }

        previous_image = Some(Arc::new(image.clone()));


        // let queue_size = ocr_tx.receiver_count() as u64;
        // debug!("OCR queue size: {}", queue_size);
        // if queue_size >= MAX_QUEUE_SIZE as u64 {
        //     let is_active = *is_active.lock().await;
        //     debug!("Dropping frame {} due to OCR backlog", frame_counter);
        //     frame_counter += 1;
        //     tokio::time::sleep(interval).await;
        //     continue;
        // }

        // Clone necessary values for the OCR task
        let result_tx_clone = result_tx.clone();
        // Send max_average frame for OCR processing
        if let Some(max_avg_frame) = &max_average {
            let is_active = *is_active.lock().await;
            if !is_active {
                let send_start = Instant::now();
                if let Err(e) = ocr_tx.send((
                    max_avg_frame.image.clone(),
                    max_avg_frame.image_hash,
                    max_avg_frame.frame_number,
                    max_avg_frame.timestamp,
                    result_tx_clone,
                )) {
                    error!("Failed to send image for OCR processing: {}", e);
                    // Handle channel closure gracefully
                    *should_stop.lock().await = true;
                    break;
                } else {
                    last_processed_frame = frame_counter;
                    max_average = None; // Reset max_average after sending
                    max_avg_value = 0.0; // Reset max_avg_value after sending
                }
                let send_duration = send_start.elapsed();

                frame_counter += 1;
                debug!(
                    "Frame {}: Capture time: {:?}, Send time: {:?}, Receiver count: {}",
                    frame_counter,
                    capture_duration,
                    send_duration,
                    ocr_tx.receiver_count()
                );
            }
        }

        tokio::time::sleep(interval).await;
    }

    // Signal OCR tasks to stop
    *should_stop.lock().await = true;

    // Wait for all OCR tasks to complete
    for handle in ocr_handles {
        handle.await.unwrap();
    }

    let total_duration = start_time.elapsed();
    info!(
        "Capture completed. Total frames: {}, Total time: {:.1?}, Avg FPS: {:.2}",
        frame_counter,
        total_duration,
        frame_counter as f64 / total_duration.as_secs_f64()
    );
}