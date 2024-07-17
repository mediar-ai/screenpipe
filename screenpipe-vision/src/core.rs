use image::DynamicImage;
use log::{debug, error, info};
use rusty_tesseract::{Args, Image};
use tokio::sync::broadcast;
use tokio::sync::broadcast::error::RecvError;
use xcap::Monitor;

use std::collections::HashMap;
use std::convert::TryInto;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::Mutex;
use tokio::task;
use serde_json;

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
    pub tsv_output: String,
}

const MAX_THREADS: usize = 4; // Adjust based on your needs
const MAX_QUEUE_SIZE: usize = 6; // Maximum number of frames to keep in the queue. 64/8 o
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
        broadcast::channel::<(Arc<DynamicImage>, u64, u64, Instant, Sender<CaptureResult>)>(64);
    let ocr_tx = Arc::new(ocr_tx);

    // Spawn OCR tasks
    let ocr_handles: Vec<_> = (0..pool_size)
        .map(|id| {
            let mut ocr_rx = ocr_tx.subscribe();
            let cache = Arc::clone(&cache);
            let should_stop = Arc::clone(&should_stop);
            task::spawn(async move {
                // info!("OCR task {} started", id);
                while !*should_stop.lock().await {
                    match ocr_rx.recv().await {
                        Ok((image_arc, image_hash, frame_number, timestamp, result_tx)) => {
                            // Only process if the frame number modulo pool_size equals this task's id
                            if frame_number % pool_size as u64 == id as u64 {
                                let start_time = Instant::now();
                                let mut cache = cache.lock().await;
                                let (text, tsv_output) = if let Some(cached_text) = cache.get(&image_hash) {
                                    (cached_text.clone(), String::new())
                                } else {
                                    let (new_text, new_tsv_output) = perform_ocr(&image_arc);
                                    cache.insert(image_hash, new_text.clone());
                                    (new_text, new_tsv_output)
                                };

                                if let Err(e) = result_tx
                                    .send(CaptureResult {
                                        image: image_arc.into(),
                                        text: text.clone(),
                                        text_json: text.lines().map(String::from).collect(),
                                        frame_number,
                                        timestamp,
                                        tsv_output,
                                    })
                                    .await
                                {
                                    error!("Failed to send OCR result: {}", e);
                                }
                                let _duration = start_time.elapsed();
                                // debug!(
                                //     "OCR task {} processed frame {} in {:?}",
                                //     id, frame_number, duration
                                // );
                            }
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
                // info!("OCR task {} stopped", id);
            })
        })
        .collect();

    let mut frame_counter: u64 = 0;
    let start_time = Instant::now();
    let mut last_processed_frame = 0;

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
        let capture_duration = capture_start.elapsed();

        // Generate hash for the image
        let image_hash = calculate_hash(&image);

        // Clone necessary values for the OCR task
        let result_tx_clone = result_tx.clone();
        let image_arc = Arc::new(image);

        // Check if we need to drop this frame
        let queue_size = ocr_tx.receiver_count() as u64;
        // debug!("OCR queue size: {}", queue_size);
        if queue_size >= MAX_QUEUE_SIZE as u64 {
            let frames_to_skip = queue_size - MAX_QUEUE_SIZE as u64 + 1;
            if frame_counter - last_processed_frame <= frames_to_skip {
                debug!("Dropping frame {} due to OCR backlog", frame_counter);
                frame_counter += 1;
                continue;
            }
        }

        // Send image for OCR processing
        let send_start = Instant::now();
        if let Err(e) = ocr_tx.send((
            image_arc,
            image_hash,
            frame_counter,
            capture_start,
            result_tx_clone,
        )) {
            error!("Failed to send image for OCR processing: {}", e);
        } else {
            last_processed_frame = frame_counter;
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
        "Capture completed. Total frames: {}, Total time: {:?}, Avg FPS: {:.2}",
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

pub fn perform_ocr(image: &DynamicImage) -> (String, String) {
    let args = Args {
        lang: "eng".to_string(),
        config_variables: HashMap::from([
            ("tessedit_create_tsv".into(), "1".into()),
        ]),
        dpi: Some(150),
        psm: Some(3),
        oem: Some(3),
    };
    let ocr_image = Image::from_dynamic_image(image).unwrap();
    
    let tsv_output = match rusty_tesseract::image_to_string(&ocr_image, &args) {
        Ok(result) => {result},
        Err(e) => {
            eprintln!("Error during image_to_string: {}", e);
            String::from("OCR_TSV failed")
        }
    };

    // Extract text from TSV output
    let text = tsv_output.lines()
        .skip(1) // Skip the header line
        .filter_map(|line| line.rsplit_once('\t').map(|(_, text)| text)) // Get the text after the last tab
        .collect::<Vec<&str>>()
        .join(" "); // Join all text parts with a space

    // Define my_args for image_to_boxes
    let my_args = Args {
        lang: "eng".to_string(),
        config_variables: HashMap::new(),
        dpi: Some(150),
        psm: Some(3),
        oem: Some(3),
    };

    let data_output = rusty_tesseract::image_to_data(&ocr_image, &my_args).unwrap();
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
    println!("{}", json_output);

    (text, tsv_output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::DynamicImage;
    use std::path::PathBuf;

    #[test]
    fn test_perform_ocr() {
        // Use the correct path to the testing_OCR.png file
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("tests/testing_OCR.png");
        let image = image::open(path).expect("Failed to open image");
        let (text, tsv_output) = perform_ocr(&image);

        // Generate text_json
        // let text_json: Vec<String> = text.lines().map(String::from).collect();

        // Print the results
        // println!("OCR Text: {}", text);
        // println!("TSV Output: {}", tsv_output);
        // println!("Text JSON: {:?}", text_json);

        assert!(!text.is_empty(), "OCR text should not be empty");
        assert!(!tsv_output.is_empty(), "TSV output should not be empty");
        assert!(!text_json.is_empty(), "Text JSON should not be empty");
    }
}