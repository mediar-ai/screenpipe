use image::DynamicImage;
use log::{debug, error};
use serde_json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::mpsc::Sender;

#[cfg(target_os = "macos")]
use crate::apple::perform_ocr_apple;
use crate::monitor::{get_focused_window, get_monitor_by_id};
#[cfg(target_os = "windows")]
use crate::utils::perform_ocr_windows;
use crate::utils::OcrEngine;
use crate::utils::{
    capture_screenshot, compare_with_previous_image, perform_ocr_tesseract, save_text_files,
};
use rusty_tesseract::{Data, DataOutput};
use screenpipe_integrations::unstructured_ocr::perform_ocr_cloud;

pub struct DataOutputWrapper {
    pub data_output: rusty_tesseract::tesseract::output_data::DataOutput,
}

impl DataOutputWrapper {
    pub fn to_json(&self) -> String {
        let data_json: Vec<String> = self.data_output.data.iter().map(|d| {
            format!(
                r#"{{"level": {}, "page_num": {}, "block_num": {}, "par_num": {}, "line_num": {}, "word_num": {}, "left": {}, "top": {}, "width": {}, "height": {}, "conf": {}, "text": "{}"}}"#,
                d.level, d.page_num, d.block_num, d.par_num, d.line_num, d.word_num, d.left, d.top, d.width, d.height, d.conf, d.text
            )
        }).collect();
        format!(
            r#"{{"output": "{}", "data": [{}]}}"#,
            self.data_output.output,
            data_json.join(", ")
        )
    }
}

pub struct CaptureResult {
    pub image: Arc<DynamicImage>,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub data_output: DataOutput,
    pub app_name: String,
}

impl Clone for CaptureResult {
    fn clone(&self) -> Self {
        CaptureResult {
            image: Arc::clone(&self.image),
            text: self.text.clone(),
            text_json: self.text_json.clone(),
            frame_number: self.frame_number,
            timestamp: self.timestamp,
            data_output: DataOutput {
                output: self.data_output.output.clone(),
                data: self
                    .data_output
                    .data
                    .iter()
                    .map(|d| Data {
                        level: d.level,
                        page_num: d.page_num,
                        block_num: d.block_num,
                        par_num: d.par_num,
                        line_num: d.line_num,
                        word_num: d.word_num,
                        left: d.left,
                        top: d.top,
                        width: d.width,
                        height: d.height,
                        conf: d.conf,
                        text: d.text.clone(),
                    })
                    .collect(),
            },
            app_name: self.app_name.clone(),
        }
    }
}

pub struct OcrTaskData {
    pub image: Arc<DynamicImage>,
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
    let ocr_task_running = Arc::new(AtomicBool::new(false));
    let mut frame_counter: u64 = 0;
    let mut previous_image: Option<Arc<DynamicImage>> = None;
    let mut max_average: Option<MaxAverageFrame> = None;
    let mut max_avg_value = 0.0;

    let monitor = get_monitor_by_id(monitor_id).await.unwrap();
    let arc_monitor = Arc::new(monitor.clone());

    loop {
        let arc_monitor_one = arc_monitor.clone();

        let app_name = Arc::new(
            get_focused_window(arc_monitor_one)
                .await
                .map(|window| window.app_name().to_lowercase().to_string())
                .unwrap_or_else(|| String::from("unknown")),
        );
        let arc_monitor = arc_monitor.clone();
        let (image, image_hash, _capture_duration) = capture_screenshot(arc_monitor).await;
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
                image_hash,
                frame_number: frame_counter,
                timestamp: Instant::now(),
                result_tx: result_tx.clone(),
                average: current_average,
            });
            max_avg_value = current_average;
        }

        previous_image = Some(Arc::new(image.clone()));

        if !ocr_task_running.load(Ordering::SeqCst) {
            if let Some(max_avg_frame) = max_average.take() {
                let ocr_task_data = OcrTaskData {
                    image: max_avg_frame.image.clone(),
                    frame_number: max_avg_frame.frame_number,
                    timestamp: max_avg_frame.timestamp,
                    result_tx: result_tx.clone(),
                };

                let ocr_task_running_clone = ocr_task_running.clone();

                ocr_task_running.store(true, Ordering::SeqCst);
                let ocr_engine_clone = ocr_engine.clone();

                let app_name_clone = app_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = process_ocr_task(
                        ocr_task_data.image,
                        ocr_task_data.frame_number,
                        ocr_task_data.timestamp,
                        ocr_task_data.result_tx,
                        save_text_files_flag,
                        ocr_engine_clone,
                        app_name_clone.to_string(),
                    )
                    .await
                    {
                        error!("Error processing OCR task: {}", e);
                    }
                    ocr_task_running_clone.store(false, Ordering::SeqCst);
                });

                frame_counter = 0;
                max_avg_value = 0.0;
            }
        }

        frame_counter += 1;
        tokio::time::sleep(interval).await;
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

pub async fn process_ocr_task(
    image_arc: Arc<DynamicImage>,
    frame_number: u64,
    timestamp: Instant,
    result_tx: Sender<CaptureResult>,
    save_text_files_flag: bool,
    ocr_engine: Arc<OcrEngine>,
    app_name: String,
) -> Result<(), std::io::Error> {
    let start_time = Instant::now();

    debug!(
        "Performing OCR for frame number since beginning of program {}",
        frame_number
    );
    let (text, data_output, json_output) = match &*ocr_engine {
        OcrEngine::Unstructured => {
            debug!("Cloud Unstructured OCR");
            match perform_ocr_cloud(&image_arc).await {
                Ok(result) => result,
                Err(e) => {
                    error!("Error performing cloud OCR: {}", e);
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Error performing cloud OCR: {}", e),
                    ));
                }
            }
        }
        OcrEngine::Tesseract => {
            debug!("Local Tesseract OCR");
            perform_ocr_tesseract(&image_arc)
        }
        #[cfg(target_os = "windows")]
        OcrEngine::WindowsNative => {
            debug!("Windows Native OCR");
            perform_ocr_windows(&image_arc).await
        }
        #[cfg(target_os = "macos")]
        OcrEngine::AppleNative => {
            debug!("Apple Native OCR");
            let text = perform_ocr_apple(&image_arc);
            (
                text.clone(),
                DataOutput {
                    output: String::new(),
                    data: vec![],
                },
                serde_json::json!([{
                    "text": text,
                    "confidence": "1.0",
                }])
                .to_string(),
            )
        }
        _ => {
            error!("Unsupported OCR engine");
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Unsupported OCR engine",
            ));
        }
    };

    let current_text_json: Vec<HashMap<String, String>> = serde_json::from_str(&json_output)
        .unwrap_or_else(|e| {
            error!("Failed to parse JSON output: {}", e);
            Vec::new()
        });

    if save_text_files_flag {
        save_text_files(frame_number, &current_text_json, &current_text_json, &None).await;
    }

    if let Err(e) = result_tx
        .send(CaptureResult {
            image: image_arc.into(),
            text: text.clone(),
            text_json: current_text_json,
            frame_number,
            timestamp,
            data_output,
            app_name,
        })
        .await
    {
        error!("Failed to send OCR result: {}", e);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to send OCR result",
        ));
    }
    let _duration = start_time.elapsed();
    debug!(
        "OCR task processed frame {} in {:?}",
        frame_number, _duration
    );
    Ok(())
}
