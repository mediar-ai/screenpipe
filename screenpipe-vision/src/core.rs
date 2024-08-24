use image::DynamicImage;
use log::{debug, error};
use screenpipe_integrations::unstructured_ocr::perform_ocr_cloud;
use serde_json;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::mpsc::Sender;

#[cfg(target_os = "macos")]
use crate::apple::parse_apple_ocr_result;
#[cfg(target_os = "macos")]
use crate::apple::perform_ocr_apple;
#[cfg(target_os = "windows")]
use crate::microsoft::perform_ocr_windows;
use crate::monitor::get_monitor_by_id;
use crate::tesseract::perform_ocr_tesseract;
use crate::utils::OcrEngine;
use crate::utils::{capture_screenshot, compare_with_previous_image, save_text_files};
#[derive(Clone)]
pub struct CaptureResult {
    pub image: Arc<DynamicImage>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub window_ocr_results: Vec<WindowOcrResult>,
}

#[derive(Clone)]
pub struct WindowOcrResult {
    pub window_name: String,
    pub app_name: String,
    pub image: Arc<DynamicImage>,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>,
    pub focused: bool,
    pub confidence: f64,
}

pub struct OcrTaskData {
    pub image: Arc<DynamicImage>,
    pub window_images: Vec<(DynamicImage, String, String, bool)>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
}

pub async fn continuous_capture(
    result_tx: Sender<CaptureResult>,
    interval: Duration,
    save_text_files_flag: bool,
    ocr_engine: Arc<OcrEngine>,
    monitor_id: u32,
) {
    debug!(
        "continuous_capture: Starting using monitor: {:?}",
        monitor_id
    );
    let mut frame_counter: u64 = 0;
    let mut previous_image: Option<Arc<DynamicImage>> = None;
    let mut max_average: Option<MaxAverageFrame> = None;
    let mut max_avg_value = 0.0;

    let monitor = get_monitor_by_id(monitor_id).await.unwrap();
    let arc_monitor = Arc::new(monitor.clone());

    loop {
        let arc_monitor = arc_monitor.clone();
        let capture_result = match capture_screenshot(arc_monitor).await {
            Ok((image, window_images, image_hash, _capture_duration)) => {
                Some((image, window_images, image_hash))
            }
            Err(e) => {
                error!("Failed to capture screenshot: {}", e);
                None
            }
        };

        if let Some((image, window_images, image_hash)) = capture_result {
            let current_average = match compare_with_previous_image(
                &previous_image,
                &image,
                &mut max_average,
                frame_counter,
                &mut max_avg_value,
            )
            .await
            {
                Ok(avg) => avg,
                Err(e) => {
                    error!("Error comparing images: {}", e);
                    0.0 // or some default value
                }
            };

            // Account for situation when there is no previous image
            let current_average = if previous_image.is_none() {
                1.0 // Default value to ensure the frame is processed
            } else {
                current_average
            };

            // Skip the frame if the current average difference is less than 0.006
            if current_average < 0.006 {
                debug!(
                    "Skipping frame {} due to low average difference: {:.3}",
                    frame_counter, current_average
                );
                frame_counter += 1;
                tokio::time::sleep(interval).await;
                continue;
            }

            if current_average > max_avg_value {
                max_average = Some(MaxAverageFrame {
                    image: Arc::new(image.clone()),
                    window_images: window_images.clone(),
                    image_hash,
                    frame_number: frame_counter,
                    timestamp: Instant::now(),
                    result_tx: result_tx.clone(),
                    average: current_average,
                });
                max_avg_value = current_average;
            }

            previous_image = Some(Arc::new(image.clone()));

            if let Some(max_avg_frame) = max_average.take() {
                let ocr_task_data = OcrTaskData {
                    image: max_avg_frame.image.clone(),
                    window_images: max_avg_frame.window_images.clone(),
                    frame_number: max_avg_frame.frame_number,
                    timestamp: max_avg_frame.timestamp,
                    result_tx: max_avg_frame.result_tx.clone(),
                };

                let ocr_engine_clone = ocr_engine.clone();

                if let Err(e) = process_ocr_task(
                    ocr_task_data.image,
                    ocr_task_data.window_images,
                    ocr_task_data.frame_number,
                    ocr_task_data.timestamp,
                    ocr_task_data.result_tx,
                    save_text_files_flag,
                    ocr_engine_clone,
                )
                .await
                {
                    error!("Error processing OCR task: {}", e);
                }

                frame_counter = 0;
                max_avg_value = 0.0;
            }
        } else {
            // Skip this iteration if capture failed
            debug!("Skipping frame {} due to capture failure", frame_counter);
        }

        frame_counter += 1;
        tokio::time::sleep(interval).await;
    }
}
pub struct MaxAverageFrame {
    pub image: Arc<DynamicImage>,
    pub window_images: Vec<(DynamicImage, String, String, bool)>,
    pub image_hash: u64,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
    pub average: f64,
}

pub async fn process_ocr_task(
    image_arc: Arc<DynamicImage>,
    window_images: Vec<(DynamicImage, String, String, bool)>,
    frame_number: u64,
    timestamp: Instant,
    result_tx: Sender<CaptureResult>,
    save_text_files_flag: bool,
    ocr_engine: Arc<OcrEngine>,
) -> Result<(), std::io::Error> {
    let start_time = Instant::now();
    debug!(
        "Performing OCR for frame number since beginning of program {}",
        frame_number
    );

    // Perform OCR on window images
    let mut window_ocr_results = Vec::new();
    let mut total_confidence = 0.0;
    let mut window_count = 0;

    for (window_image, window_app_name, window_name, focused) in window_images {
        let window_image_arc = Arc::new(window_image);
        let (window_text, window_json_output, confidence) = match &*ocr_engine {
            OcrEngine::Unstructured => perform_ocr_cloud(&window_image_arc)
                .await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?,
            OcrEngine::Tesseract => perform_ocr_tesseract(&window_image_arc),
            #[cfg(target_os = "windows")]
            OcrEngine::WindowsNative => perform_ocr_windows(&window_image_arc).await,
            #[cfg(target_os = "macos")]
            OcrEngine::AppleNative => parse_apple_ocr_result(&perform_ocr_apple(&window_image_arc)),
            _ => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "Unsupported OCR engine",
                ))
            }
        };

        if let Some(conf) = confidence {
            total_confidence += conf;
            window_count += 1;
        }

        window_ocr_results.push(WindowOcrResult {
            window_name,
            app_name: window_app_name,
            image: window_image_arc,
            text: window_text,
            text_json: parse_json_output(&window_json_output),
            focused,
            confidence: confidence.unwrap_or(0.0),
        });
    }

    if save_text_files_flag {
        // Save text files for window OCR results if needed
        for (index, window_result) in window_ocr_results.iter().enumerate() {
            save_text_files(
                frame_number * 1000 + index as u64, // Unique ID for each window
                &window_result.text_json,
                &window_result.text_json,
                &None,
            )
            .await;
        }
    }

    let capture_result = CaptureResult {
        image: image_arc,
        frame_number,
        timestamp,
        window_ocr_results: window_ocr_results.clone(),
    };

    if let Err(e) = result_tx.send(capture_result).await {
        error!("Failed to send OCR result: {}", e);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to send OCR result",
        ));
    }

    let duration = start_time.elapsed();
    let avg_confidence = if window_count > 0 { total_confidence / window_count as f64 } else { 0.0 };
    debug!(
        "OCR task processed frame {} with {} windows in {:?}, average confidence: {:.2}",
        frame_number,
        window_ocr_results.len(),
        duration,
        avg_confidence
    );
    Ok(())
}

fn parse_json_output(json_output: &str) -> Vec<HashMap<String, String>> {
    let parsed_output: Vec<HashMap<String, String>> = serde_json::from_str(json_output)
        .unwrap_or_else(|e| {
            error!("Failed to parse JSON output: {}", e);
            Vec::new()
        });

    parsed_output
}