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

pub enum ControlMessage {
    Pause,
    Resume,
    Stop,
}

pub struct CaptureResult {
    pub image: Arc<DynamicImage>,
    pub text: String,
    pub text_json: Vec<String>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub data_output: DataOutput, // Corrected this line
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
        broadcast::channel::<(Arc<DynamicImage>, u64, u64, Instant, Sender<CaptureResult>)>(2);
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
                                (cached_text.clone(), DataOutput { output: String::new(), data: vec![] }, String::new())
                            } else {
                                // Set is_active to true before performing OCR
                                *is_active.lock().await = true;

                                let (new_text, data_output, new_json_output) = perform_ocr(&image_arc);
                                cache.insert(image_hash, new_text.clone());

                                // Set is_active to false after performing OCR
                                *is_active.lock().await = false;

                                (new_text, data_output, new_json_output)
                            };

                            let current_text_json: Vec<String> = serde_json::from_str(&json_output).unwrap();
                            let mut previous_text_json = previous_text_json.lock().await;

                            // Debug logging for current and previous text_json
                            let current_text_json_len: usize = current_text_json.iter().map(|s| s.len()).sum();
                            let previous_text_json_len: usize = previous_text_json.as_ref().map_or(0, |v: &Vec<String>| v.iter().map(|s| s.len()).sum());

                            debug!("JSON length Current: {} Previous: {}", current_text_json_len, previous_text_json_len);

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

    // Function to calculate the 50:50 weighted average of Histogram and SSIM
    fn calculate_weighted_average(histogram: f64, ssim: f64) -> f64 {
        (histogram + ssim) / 2.0
    }

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
            debug!("Frame {}: Histogram diff: {:.3}, SSIM diff: {:.3}, Average: {:.3}", frame_counter, histogram_diff, ssim_diff, current_average);

            if let Some(max_avg_frame) = &max_average {
                if current_average < max_avg_frame.average {
                    debug!("Dropping frame {} due to lower average", frame_counter);
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


        // Check if we need to store this frame as max_average based on queue size
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
                // queue_size.fetch_add(1, Ordering::SeqCst); // Increment the counter
                if let Err(e) = ocr_tx.send((
                    max_avg_frame.image.clone(),
                    max_avg_frame.image_hash,
                    max_avg_frame.frame_number,
                    max_avg_frame.timestamp,
                    result_tx_clone,
                )) {
                    error!("Failed to send image for OCR processing: {}", e);
                    // queue_size.fetch_sub(1, Ordering::SeqCst); // Decrement the counter on error
                } else {
                    last_processed_frame = frame_counter;
                    max_average = None; // Reset max_average after sending
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
fn calculate_hash(image: &DynamicImage) -> u64 {
    let mut hasher = DefaultHasher::new();
    image.as_bytes().hash(&mut hasher);
    hasher.finish()
}

pub fn perform_ocr(image: &DynamicImage) -> (String, DataOutput, String) {
    let args = Args {
        lang: "eng".to_string(),
        config_variables: HashMap::from([
            ("tessedit_create_tsv".into(), "1".into()),
        ]),
        dpi: Some(600), // 150 is a balanced option, 600 seems faster surprisingly, the more the more granualar
        psm: Some(1), // PSM 1: Automatic page segmentation with OSD. PSM 3: Automatic page segmentation with OSD
        oem: Some(1), //1: Neural nets LSTM engine only,    3: Default, based on what is available. (Default)
    };

    let ocr_image = Image::from_dynamic_image(image).unwrap();

    // Extract data output
    let data_output = rusty_tesseract::image_to_data(&ocr_image, &args).unwrap();
    // let tsv_output = data_output_to_tsv(&data_output);

    // Extract text from data output
    let text = data_output_to_text(&data_output);

    // Extract JSON output
    let mut lines: Vec<String> = Vec::new();
    let mut current_line = String::new();
    let mut last_word_num = 0;

    for record in &data_output.data {
        if record.word_num == 0 {
            if !current_line.is_empty() {
                lines.push(current_line.clone());
                current_line.clear();
            }
        }
        if record.word_num > last_word_num {
            if !current_line.is_empty() {
                current_line.push(' ');
            }
            current_line.push_str(&record.text);
        }
        last_word_num = record.word_num;
    }
    if !current_line.is_empty() {
        lines.push(current_line);
    }

    let json_output = serde_json::to_string_pretty(&lines).unwrap();

    (text, data_output, json_output)
}

fn data_output_to_text(data_output: &DataOutput) -> String {
    let mut text = String::new();
    for record in &data_output.data {
        if !record.text.is_empty() {
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(&record.text);
        }
    }
    text
}

fn compare_images_histogram(image1: &DynamicImage, image2: &DynamicImage) -> f64 {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    let result = image_compare::gray_similarity_histogram(Metric::Hellinger, &image_one, &image_two)
        .expect("Images had different dimensions");
    result
}

fn compare_images_ssim(image1: &DynamicImage, image2: &DynamicImage) -> f64 {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    let result: Similarity = image_compare::gray_similarity_structure(&Algorithm::MSSIMSimple, &image_one, &image_two)
        .expect("Images had different dimensions");
    result.score
}