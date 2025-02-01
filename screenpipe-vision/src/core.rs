#[cfg(target_os = "macos")]
use crate::apple::perform_ocr_apple;
use crate::capture_screenshot_by_window::CapturedWindow;
use crate::capture_screenshot_by_window::WindowFilters;
use crate::custom_ocr::perform_ocr_custom;
#[cfg(target_os = "windows")]
use crate::microsoft::perform_ocr_windows;
use crate::monitor::get_monitor_by_id;
use crate::tesseract::perform_ocr_tesseract;
use crate::utils::OcrEngine;
use crate::utils::{capture_screenshot, compare_with_previous_image};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::DynamicImage;
use log::{debug, error};
use screenpipe_core::Language;
use screenpipe_integrations::unstructured_ocr::perform_ocr_cloud;
use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use serde::Serializer;
use serde_json;
use tracing::warn;
use std::sync::Arc;
use std::{
    collections::HashMap,
    time::{Duration, Instant, UNIX_EPOCH},
};
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc::Sender;
use tokio::sync::watch;
use tracing::info;

#[cfg(target_os = "macos")]
use xcap_macos::Monitor;

#[cfg(not(target_os = "macos"))]
use xcap::Monitor;

fn serialize_image<S>(image: &Option<DynamicImage>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    if let Some(image) = image {
        let mut webp_buffer = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut webp_buffer);

        let mut encoder = JpegEncoder::new_with_quality(&mut cursor, 80);

        // Encode the image as WebP
        encoder
            .encode_image(image)
            .map_err(serde::ser::Error::custom)?;

        // Base64 encode the WebP data
        let base64_string = general_purpose::STANDARD.encode(webp_buffer);

        // Serialize the base64 string
        serializer.serialize_str(&base64_string)
    } else {
        serializer.serialize_none()
    }
}

fn deserialize_image<'de, D>(deserializer: D) -> Result<Option<DynamicImage>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    // Deserialize the base64 string
    let base64_string: String = serde::Deserialize::deserialize(deserializer)?;

    // Check if the base64 string is empty or invalid
    if base64_string.trim().is_empty() {
        return Ok(None);
    }

    // Decode base64 to bytes
    let image_bytes = general_purpose::STANDARD
        .decode(&base64_string)
        .map_err(serde::de::Error::custom)?;

    // Create a cursor to read from the bytes
    let cursor = std::io::Cursor::new(image_bytes);

    // Decode the JPEG data back into an image
    let image = image::load(cursor, image::ImageFormat::Jpeg).map_err(serde::de::Error::custom)?;
    Ok(Some(image))
}

fn serialize_instant<S>(instant: &Instant, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let duration_since_epoch = UNIX_EPOCH.elapsed().map_err(serde::ser::Error::custom)?;
    let instant_duration = duration_since_epoch - instant.elapsed();
    let millis = instant_duration.as_millis();
    serializer.serialize_u128(millis)
}

fn deserialize_instant<'de, D>(deserializer: D) -> Result<Instant, D::Error>
where
    D: Deserializer<'de>,
{
    let millis: u128 = Deserialize::deserialize(deserializer)?;
    Ok(Instant::now() - Duration::from_millis(millis as u64))
}

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
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let mut frame_counter: u64 = 0;
    let mut previous_image: Option<DynamicImage> = None;
    let mut max_average: Option<MaxAverageFrame> = None;
    let mut max_avg_value = 0.0;

    debug!(
        "continuous_capture: Starting using monitor: {:?}",
        monitor_id
    );

    let monitor = get_monitor_by_id(monitor_id).await.unwrap();

    loop {
        // Check shutdown signal
        if *shutdown_rx.borrow() {
            info!(
                "continuous_capture: received shutdown signal for monitor {}",
                monitor_id
            );
            drop(result_tx);
            break;
        }

        // Use tokio::select! to handle both capture and shutdown
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!("continuous_capture: shutdown signal received for monitor {}", monitor_id);
                    drop(result_tx);
                    break;
                }
            }
            _ = async {
                let capture_result = match capture_screenshot(&monitor, &window_filters, capture_unfocused_windows).await {
                    Ok((image, window_images, image_hash, _capture_duration)) => {
                        debug!(
                            "captured screenshot on monitor {} with hash: {}",
                            monitor.id(),
                            image_hash
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
                            previous_image = None;
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
                        return;
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
                        if max_avg_frame.result_tx.clone().is_closed() {
                            warn!("result_tx is closed, skipping OCR task");
                            return;
                        }
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
            } => {}
        }
    }

    debug!("Continuous capture stopped for monitor {}", monitor_id);
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
            OcrEngine::AppleNative => perform_ocr_apple(&captured_window.image, &languages),
            OcrEngine::Custom(config) => {
                perform_ocr_custom(&captured_window.image, languages.clone(), config)
                    .await
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
            }
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
        if e.to_string().contains("channel closed") {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Channel closed",
            ));
        }

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RealtimeVisionEvent {
    Ocr(WindowOcr),
    Ui(UIFrame),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowOcr {
    #[serde(
        serialize_with = "serialize_image",
        deserialize_with = "deserialize_image"
    )]
    pub image: Option<DynamicImage>,
    pub window_name: String,
    pub app_name: String,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>, // Change this line
    pub focused: bool,
    pub confidence: f64,
    #[serde(
        serialize_with = "serialize_instant",
        deserialize_with = "deserialize_instant"
    )]
    pub timestamp: Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIFrame {
    pub window: String,
    pub app: String,
    pub text_output: String,
    pub initial_traversal_at: String,
}

impl UIFrame {
    pub async fn read_from_pipe(reader: &mut BufReader<File>) -> Result<Self> {
        let window = UIFrame::read_string(reader).await?;
        let app = UIFrame::read_string(reader).await?;
        let text_output = UIFrame::read_string(reader).await?;
        let initial_traversal_at = UIFrame::read_string(reader).await?;

        Ok(UIFrame {
            window,
            app,
            text_output,
            initial_traversal_at,
        })
    }

    async fn read_string(reader: &mut BufReader<File>) -> Result<String> {
        let mut buffer = Vec::new();
        loop {
            let result = reader.read_until(b'\0', &mut buffer).await?;
            if result > 0 {
                buffer.pop(); // Remove the null terminator
                return Ok(String::from_utf8_lossy(&buffer).to_string());
            }
        }
    }
}
