#[cfg(target_os = "macos")]
use crate::apple::perform_ocr_apple;
use crate::capture_screenshot_by_window::CapturedWindow;
use crate::capture_screenshot_by_window::WindowFilters;
#[cfg(target_os = "windows")]
use crate::microsoft::perform_ocr_windows;
use crate::monitor::get_monitor_by_id;
use crate::tesseract::perform_ocr_tesseract;
use crate::utils::OcrEngine;
use crate::utils::{capture_screenshot, compare_with_previous_image};
use anyhow::{anyhow, Result};
#[cfg(target_os = "macos")]
use cidre::ns;
use image::DynamicImage;
use log::{debug, error};
use screenpipe_core::Language;
use screenpipe_integrations::unstructured_ocr::perform_ocr_cloud;
use serde_json;
use std::sync::Arc;
use std::{
    collections::HashMap,
    time::{Duration, Instant},
    sync::OnceLock,
};
use tokio::sync::mpsc::Sender;
use tokio::time::sleep;

#[cfg(target_os = "macos")]
use xcap_macos::Monitor;

#[cfg(not(target_os = "macos"))]
use xcap::Monitor;

#[cfg(target_os = "macos")]
static APPLE_LANGUAGE_MAP: OnceLock<HashMap<Language, &'static str>> = OnceLock::new();

pub struct CaptureResult {
    pub image: DynamicImage,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub window_ocr_results: Vec<WindowOcrResult>,
}

pub struct WindowOcrResult {
    pub image: DynamicImage,
    pub window_name: String,
    pub app_name: String,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>, // Change this line
    pub focused: bool,
    pub confidence: f64,
}

pub struct OcrTaskData {
    pub image: DynamicImage,
    pub window_images: Vec<CapturedWindow>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
}

pub async fn continuous_capture(
    result_tx: Sender<CaptureResult>,
    interval: Duration,
    ocr_engine: OcrEngine,
    monitor_id: u32,
    window_filters: Arc<WindowFilters>,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
) {
    let mut frame_counter: u64 = 0;
    let mut previous_image: Option<DynamicImage> = None;
    let mut max_average: Option<MaxAverageFrame> = None;
    let mut max_avg_value = 0.0;

    debug!(
        "continuous_capture: Starting using monitor: {:?}",
        monitor_id
    );

    loop {
        let monitor = match get_monitor_by_id(monitor_id).await {
            Some(m) => m,
            None => {
                sleep(Duration::from_secs(1)).await;
                continue;
            }
        };
        let capture_result =
            match capture_screenshot(&monitor, &window_filters, capture_unfocused_windows).await {
                Ok((image, window_images, image_hash, _capture_duration)) => {
                    debug!(
                        "Captured screenshot on monitor {} with hash: {}",
                        monitor_id, image_hash
                    );
                    Some((image, window_images, image_hash))
                }
                Err(e) => {
                    error!("Failed to capture screenshot: {}", e);
                    None
                }
            };

        if let Some((image, window_images, image_hash)) = capture_result {
            let current_average = match compare_with_previous_image(
                previous_image.as_ref(),
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
                    0.0
                }
            };

            let current_average = if previous_image.is_none() {
                1.0
            } else {
                current_average
            };

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
                    image: image.clone(),
                    window_images: window_images.clone(),
                    image_hash,
                    frame_number: frame_counter,
                    timestamp: Instant::now(),
                    result_tx: result_tx.clone(),
                    average: current_average,
                });
                max_avg_value = current_average;
            }

            previous_image = Some(image);

            if let Some(max_avg_frame) = max_average.take() {
                let ocr_task_data = OcrTaskData {
                    image: max_avg_frame.image,
                    window_images: max_avg_frame.window_images,
                    frame_number: max_avg_frame.frame_number,
                    timestamp: max_avg_frame.timestamp,
                    result_tx: max_avg_frame.result_tx,
                };

                if let Err(e) =
                    process_ocr_task(ocr_task_data, &ocr_engine, languages.clone()).await
                {
                    error!("Error processing OCR task: {}", e);
                }

                frame_counter = 0;
                max_avg_value = 0.0;
            }
        } else {
            debug!("Skipping frame {} due to capture failure", frame_counter);
        }

        frame_counter += 1;
        tokio::time::sleep(interval).await;
    }
}

pub struct MaxAverageFrame {
    pub image: DynamicImage,
    pub window_images: Vec<CapturedWindow>,
    pub image_hash: u64,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
    pub average: f64,
}

pub async fn process_ocr_task(
    ocr_task_data: OcrTaskData,
    ocr_engine: &OcrEngine,
    languages: Vec<Language>,
) -> Result<(), std::io::Error> {
    let OcrTaskData {
        image,
        window_images,
        frame_number,
        timestamp,
        result_tx,
    } = ocr_task_data;

    let start_time = Instant::now();
    debug!(
        "Performing OCR for frame number since beginning of program {}",
        frame_number
    );

    let mut window_ocr_results = Vec::new();
    let mut total_confidence = 0.0;
    let mut window_count = 0;

    #[cfg(target_os = "macos")]
    let languages_slice = {
        use ns;
        let apple_languages = get_apple_languages(languages.clone());
        let mut slice = ns::ArrayMut::<ns::String>::with_capacity(apple_languages.len());
        apple_languages.iter().for_each(|language| {
            slice.push(&ns::String::with_str(language.as_str()));
        });
        slice
    };

    for captured_window in window_images {
        let (window_text, window_json_output, confidence) = match ocr_engine {
            OcrEngine::Unstructured => perform_ocr_cloud(&captured_window.image, languages.clone())
                .await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?,
            OcrEngine::Tesseract => {
                perform_ocr_tesseract(&captured_window.image, languages.clone())
            }
            #[cfg(target_os = "windows")]
            OcrEngine::WindowsNative => perform_ocr_windows(&captured_window.image)
                .await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?,
            #[cfg(target_os = "macos")]
            OcrEngine::AppleNative => perform_ocr_apple(&captured_window.image, &languages_slice),
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
            image: captured_window.image,
            window_name: captured_window.window_name,
            app_name: captured_window.app_name,
            text: window_text,
            text_json: parse_json_output(&window_json_output),
            focused: captured_window.is_focused,
            confidence: confidence.unwrap_or(0.0),
        });
    }

    let capture_result = CaptureResult {
        image,
        frame_number,
        timestamp,
        window_ocr_results,
    };

    if let Err(e) = result_tx.send(capture_result).await {
        error!("Failed to send OCR result: {}", e);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to send OCR result",
        ));
    }

    let duration = start_time.elapsed();
    let avg_confidence = if window_count > 0 {
        total_confidence / window_count as f64
    } else {
        0.0
    };
    debug!(
        "OCR task processed frame {} with {} windows in {:?}, average confidence: {:.2}",
        frame_number, window_count, duration, avg_confidence
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

pub fn trigger_screen_capture_permission() -> Result<()> {
    // Get the primary monitor
    let monitor = Monitor::all().map_err(|e| anyhow!("Failed to get monitor: {}", e))?;

    // Attempt to capture a screenshot, which should trigger the permission request
    let _screenshot = monitor.first().unwrap().capture_image()?;

    // We don't need to do anything with the screenshot
    // The mere attempt to capture it should trigger the permission request

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn get_apple_languages(languages: Vec<screenpipe_core::Language>) -> Vec<String> {
    let map = APPLE_LANGUAGE_MAP.get_or_init(|| {
        let mut m = HashMap::new();
        m.insert(Language::English, "en-US");
        m.insert(Language::Spanish, "es-ES");
        m.insert(Language::French, "fr-FR");
        m.insert(Language::German, "de-DE");
        m.insert(Language::Italian, "it-IT");
        m.insert(Language::Portuguese, "pt-BR");
        m.insert(Language::Russian, "ru-RU");
        m.insert(Language::Chinese, "zh-Hans");
        m.insert(Language::Korean, "ko-KR");
        m.insert(Language::Japanese, "ja-JP");
        m.insert(Language::Ukrainian, "uk-UA");
        m.insert(Language::Thai, "th-TH");
        m.insert(Language::Arabic, "ar-SA");
        m
    });

    languages
        .iter()
        .filter_map(|lang| map.get(lang).map(|&s| s.to_string()))
        .collect()
}
