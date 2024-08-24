use crate::utils::save_text_files;
use image::DynamicImage;
use log::{debug, error};
use scap::{
    capturer::{Capturer, Options},
    frame::Frame,
};
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
use crate::utils::OcrEngine;
use crate::{monitor::list_monitors, tesseract::perform_ocr_tesseract};
use crate::{
    monitor::{get_monitor_by_id, get_target_by_id},
    utils::compare_with_previous_image,
};
#[derive(Clone)]
pub struct CaptureResult {
    pub image: Arc<DynamicImage>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub ocr_results: String,
    pub raw_json: String,
}

pub struct OcrTaskData {
    pub image: Arc<DynamicImage>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
}
pub async fn continuous_capture(
    result_tx: Sender<CaptureResult>,
    fps: u32,
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

    if !scap::is_supported() {
        error!("Platform not supported");
        return;
    }

    if !scap::has_permission() {
        // ! TODO api /permission
        debug!("Permission not granted. Requesting permission...");
        if !scap::request_permission() {
            error!("Permission denied");
            return;
        }
    }

    let monitor = get_target_by_id(monitor_id).await.unwrap();

    let options = Options {
        fps: fps,
        target: Some(monitor.clone()),
        show_cursor: true,
        show_highlight: false,
        excluded_targets: None,
        output_type: scap::frame::FrameType::RGB,
        output_resolution: scap::capturer::Resolution::_1080p, // TODO
        ..Default::default()
    };

    let mut capturer = Capturer::new(options);
    capturer.start_capture();

    loop {
        let start_time = Instant::now();

        // debug!("Frame count: {}", frame_counter);
        if let Ok(frame) = capturer.get_next_frame() {
            // debug!("Frame:");
            let image = frame_to_dynamic_image(&frame);
            let image_arc = Arc::new(image.clone());

            let current_average = match compare_with_previous_image(
                &previous_image,
                &image_arc,
                &mut max_average,
                frame_counter,
                &mut max_avg_value,
            )
            .await
            {
                Ok(avg) => avg,
                Err(e) => {
                    error!("Error comparing images: {}", e);
                    0.0
                }
            };

            let current_average = if previous_image.is_none() {
                1.0 // Default value to ensure the frame is processed
            } else {
                current_average
            };

            if current_average < 0.006 && previous_image.is_some() {
                // debug!(
                //     "Skipping frame {} due to low average difference: {:.3}",
                //     frame_counter, current_average
                // );
                frame_counter += 1;
                // tokio::time::sleep(interval).await;
                continue;
            }

            if current_average > max_avg_value {
                max_average = Some(MaxAverageFrame {
                    image: image_arc.clone(),
                    frame_number: frame_counter,
                    timestamp: Instant::now(),
                    result_tx: result_tx.clone(),
                    average: current_average,
                });
                max_avg_value = current_average;
            }

            previous_image = Some(image_arc.clone());

            if let Some(max_avg_frame) = max_average.take() {
                let ocr_task_data = OcrTaskData {
                    image: max_avg_frame.image.clone(),
                    frame_number: max_avg_frame.frame_number,
                    timestamp: max_avg_frame.timestamp,
                    result_tx: max_avg_frame.result_tx.clone(),
                };

                let ocr_engine_clone = ocr_engine.clone();

                if let Err(e) = process_ocr_task(
                    ocr_task_data.image,
                    ocr_task_data.frame_number,
                    ocr_task_data.timestamp,
                    ocr_task_data.result_tx,
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
            error!("Failed to capture frame");
        }

        frame_counter += 1;
        let elapsed = start_time.elapsed();
        // if elapsed < interval {
        //     tokio::time::sleep(interval - elapsed).await;
        // }
    }
}

fn frame_to_dynamic_image(frame: &Frame) -> DynamicImage {
    match frame {
        Frame::RGB(rgb_frame) => {
            let width = rgb_frame.width as u32;
            let height = rgb_frame.height as u32;
            let rgb_image = image::ImageBuffer::from_raw(width, height, rgb_frame.data.clone())
                .expect("Failed to create RGBImage");
            DynamicImage::ImageRgb8(rgb_image)
        }
        // Add more cases for other frame types as needed
        _ => panic!("Unsupported frame type"),
    }
}

pub struct MaxAverageFrame { // ! this struct is 90% dead code (only avg is used)
    pub image: Arc<DynamicImage>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
    pub average: f64,
}

pub async fn process_ocr_task(
    image_arc: Arc<DynamicImage>,
    frame_number: u64,
    timestamp: Instant,
    result_tx: Sender<CaptureResult>,
    ocr_engine: Arc<OcrEngine>,
) -> Result<(), std::io::Error> {
    let start_time = Instant::now();
    // debug!(
    //     "Performing OCR for frame number since beginning of program {}",
    //     frame_number
    // );

    let (ocr, json_output, confidence) = match &*ocr_engine {
        OcrEngine::Unstructured => perform_ocr_cloud(&image_arc)
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?,
        OcrEngine::Tesseract => perform_ocr_tesseract(&image_arc),
        #[cfg(target_os = "windows")]
        OcrEngine::WindowsNative => perform_ocr_windows(&window_image_arc).await,
        #[cfg(target_os = "macos")]
        OcrEngine::AppleNative => parse_apple_ocr_result(&perform_ocr_apple(&image_arc)),
        _ => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Unsupported OCR engine",
            ))
        }
    };

    // if std::env::var("SAVE_TEXT_FILES").is_ok() {
    //     // Save text files for window OCR results if needed
    //     save_text_files(
    //         frame_number,
    //         &parse_json_output(&json_output),
    //         &parse_json_output(&json_output),
    //         &None,
    //     )
    //     .await;
    // }

    // debug!("Creating capture result");
    let capture_result = CaptureResult {
        image: image_arc,
        frame_number,
        timestamp,
        ocr_results: ocr,
        raw_json: json_output,
    };
    // debug!("Sending OCR result");
    if let Err(e) = result_tx.send(capture_result).await {
        error!("Failed to send OCR result: {}", e);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to send OCR result",
        ));
    }
    // debug!("Sent OCR result");

    let duration = start_time.elapsed();

    // debug!(
    //     "OCR task processed frame {} with {:?}, confidence: {:.2}",
    //     frame_number,
    //     duration,
    //     confidence.unwrap_or(1.0)
    // );
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
