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
use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::DynamicImage;
use screenpipe_core::Language;
use screenpipe_integrations::unstructured_ocr::perform_ocr_cloud;
use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use serde::Serializer;
use serde_json;
use std::sync::Arc;
use std::{
    collections::HashMap,
    time::{Duration, Instant, UNIX_EPOCH},
};
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc::Sender;
use tokio::time::sleep;
use tracing::{debug, error, warn};

use crate::browser_utils::create_url_detector;

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
    pub browser_url: Option<String>,
}

pub struct OcrTaskData {
    pub image: DynamicImage,
    pub window_images: Vec<CapturedWindow>,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub result_tx: Sender<CaptureResult>,
}

const BROWSER_NAMES: [&str; 9] = [
    "chrome", "firefox", "safari", "edge", "brave", "arc", "chromium", "vivaldi", "opera",
];

#[derive(Debug)]
pub enum ContinuousCaptureError {
    MonitorNotFound,
    ErrorCapturingScreenshot(String),
    ErrorProcessingOcr(String),
    ErrorSendingOcrResult(String),
}

impl std::fmt::Display for ContinuousCaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

pub async fn continuous_capture(
    result_tx: Sender<CaptureResult>,
    interval: Duration,
    ocr_engine: OcrEngine,
    monitor_id: u32,
    window_filters: Arc<WindowFilters>,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
) -> Result<(), ContinuousCaptureError> {
    let mut frame_counter: u64 = 0;
    let mut previous_image: Option<DynamicImage> = None;
    let mut max_average: Option<MaxAverageFrame> = None;
    let mut max_avg_value = 0.0;

    debug!(
        "continuous_capture: Starting using monitor: {:?}",
        monitor_id
    );
    // 1. Get monitor
    let monitor = match get_monitor_by_id(monitor_id).await {
        Some(m) => m,
        None => {
            error!("Monitor not found");
            return Err(ContinuousCaptureError::MonitorNotFound);
        }
    };

    loop {
        // 3. Capture screenshot
        let capture_result =
            match capture_screenshot(&monitor, &window_filters, capture_unfocused_windows).await {
                Ok(result) => result,
                Err(e) => {
                    debug!("error capturing screenshot: {}", e);
                    sleep(Duration::from_secs(1)).await;
                    continue;
                }
            };

        // 4. Process captured image
        let (image, window_images, image_hash, _capture_duration) = capture_result;

        let should_skip = should_skip_frame(
            &previous_image,
            &image,
            &mut max_average,
            frame_counter,
            &mut max_avg_value,
            &window_images,
            image_hash,
            result_tx.clone(),
        )
        .await;

        if should_skip {
            frame_counter += 1;
            tokio::time::sleep(interval).await;
            continue;
        }

        previous_image = Some(image);

        // 5. Process max average frame if available
        if let Some(max_avg_frame) = max_average.take() {
            if let Err(e) =
                process_max_average_frame(max_avg_frame, &ocr_engine, languages.clone()).await
            {
                error!("Error processing max average frame: {}", e);
            }
            frame_counter = 0;
            max_avg_value = 0.0;
        }

        frame_counter += 1;
        tokio::time::sleep(interval).await;
    }
}

async fn should_skip_frame(
    previous_image: &Option<DynamicImage>,
    current_image: &DynamicImage,
    max_average: &mut Option<MaxAverageFrame>,
    frame_counter: u64,
    max_avg_value: &mut f64,
    window_images: &Vec<CapturedWindow>,
    image_hash: u64,
    result_tx: Sender<CaptureResult>,
) -> bool {
    let current_average = match compare_with_previous_image(
        previous_image.as_ref(),
        current_image,
        max_average,
        frame_counter,
        max_avg_value,
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
        true
    } else {
        if current_average > *max_avg_value {
            *max_average = Some(MaxAverageFrame {
                image: current_image.clone(),
                window_images: window_images.clone(),
                image_hash,
                frame_number: frame_counter,
                timestamp: Instant::now(),
                result_tx: result_tx.clone(),
                average: current_average,
            });
            *max_avg_value = current_average;
        }
        false
    }
}

async fn process_max_average_frame(
    max_avg_frame: MaxAverageFrame,
    ocr_engine: &OcrEngine,
    languages: Vec<Language>,
) -> Result<(), ContinuousCaptureError> {
    let ocr_task_data = OcrTaskData {
        image: max_avg_frame.image,
        window_images: max_avg_frame.window_images,
        frame_number: max_avg_frame.frame_number,
        timestamp: max_avg_frame.timestamp,
        result_tx: max_avg_frame.result_tx,
    };

    if let Err(e) = process_ocr_task(ocr_task_data, ocr_engine, languages).await {
        error!("Error processing OCR task: {}", e);
        return Err(ContinuousCaptureError::ErrorProcessingOcr(e.to_string()));
    }

    Ok(())
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
) -> Result<(), ContinuousCaptureError> {
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
        let ocr_result = process_window_ocr(
            captured_window,
            ocr_engine,
            &languages,
            &mut total_confidence,
            &mut window_count,
        )
        .await
        .map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string()))?;

        window_ocr_results.push(ocr_result);
    }

    // Create and send the result
    let capture_result = CaptureResult {
        image,
        frame_number,
        timestamp,
        window_ocr_results,
    };

    send_ocr_result(&result_tx, capture_result)
        .await
        .map_err(|e| ContinuousCaptureError::ErrorSendingOcrResult(e.to_string()))?;

    // Log performance metrics
    log_ocr_performance(start_time, window_count, total_confidence, frame_number);

    Ok(())
}

async fn process_window_ocr(
    captured_window: CapturedWindow,
    ocr_engine: &OcrEngine,
    languages: &[Language],
    total_confidence: &mut f64,
    window_count: &mut u32,
) -> Result<WindowOcrResult, ContinuousCaptureError> {
    let app_name = captured_window.app_name.clone();

    // Get browser URL if applicable
    let browser_url = get_browser_url_if_needed(
        &app_name,
        captured_window.is_focused,
        captured_window.process_id,
    )
    .await;

    // Perform OCR based on the selected engine
    let (window_text, window_json_output, confidence) =
        perform_ocr_with_engine(ocr_engine, &captured_window.image, languages.to_vec())
            .await
            .map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string()))?;

    // Update confidence metrics
    if let Some(conf) = confidence {
        *total_confidence += conf;
        *window_count += 1;
    }

    Ok(WindowOcrResult {
        image: captured_window.image,
        window_name: captured_window.window_name,
        app_name: captured_window.app_name,
        text: window_text,
        text_json: parse_json_output(&window_json_output),
        focused: captured_window.is_focused,
        confidence: confidence.unwrap_or(0.0),
        browser_url,
    })
}

async fn get_browser_url_if_needed(
    app_name: &str,
    is_focused: bool,
    process_id: i32,
) -> Option<String> {
    if cfg!(not(target_os = "linux"))
        && is_focused
        && BROWSER_NAMES
            .iter()
            .any(|&browser| app_name.to_lowercase().contains(browser))
    {
        let app_name = app_name.to_string(); // Clone to move into the closure
        match tokio::task::spawn_blocking(move || {
            get_active_browser_url_sync(&app_name, process_id)
        })
        .await
        {
            Ok(Ok(url)) => Some(url),
            Ok(Err(_)) => None,
            Err(e) => {
                error!("Failed to spawn blocking task: {}", e);
                None
            }
        }
    } else {
        None
    }
}

async fn perform_ocr_with_engine(
    ocr_engine: &OcrEngine,
    image: &DynamicImage,
    languages: Vec<Language>,
) -> Result<(String, String, Option<f64>), ContinuousCaptureError> {
    match ocr_engine {
        OcrEngine::Unstructured => perform_ocr_cloud(image, languages)
            .await
            .map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string())),
        OcrEngine::Tesseract => Ok(perform_ocr_tesseract(image, languages)),
        #[cfg(target_os = "windows")]
        OcrEngine::WindowsNative => perform_ocr_windows(image)
            .await
            .map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string())),
        #[cfg(target_os = "macos")]
        OcrEngine::AppleNative => Ok(perform_ocr_apple(image, &languages)),
        OcrEngine::Custom(config) => perform_ocr_custom(image, languages, config)
            .await
            .map_err(|e| ContinuousCaptureError::ErrorProcessingOcr(e.to_string())),
        _ => Err(ContinuousCaptureError::ErrorProcessingOcr(
            "Unsupported OCR engine".to_string(),
        )),
    }
}

async fn send_ocr_result(
    result_tx: &Sender<CaptureResult>,
    capture_result: CaptureResult,
) -> Result<(), ContinuousCaptureError> {
    // Add channel health check
    if result_tx.capacity() == 0 {
        warn!("OCR task channel at capacity - receiver may be blocked or slow");
    }

    if let Err(e) = result_tx.send(capture_result).await {
        if e.to_string().contains("channel closed") {
            error!("OCR task channel closed, recording may have stopped: {}", e);
            return Err(ContinuousCaptureError::ErrorSendingOcrResult(
                "Channel closed - recording appears to have stopped".to_string(),
            ));
        }

        error!("Failed to send OCR result: {}", e);
        return Err(ContinuousCaptureError::ErrorSendingOcrResult(format!(
            "Failed to send OCR result: {}",
            e
        )));
    }

    Ok(())
}

fn log_ocr_performance(
    start_time: Instant,
    window_count: u32,
    total_confidence: f64,
    frame_number: u64,
) {
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
}

fn parse_json_output(json_output: &str) -> Vec<HashMap<String, String>> {
    let parsed_output: Vec<HashMap<String, String>> = serde_json::from_str(json_output)
        .unwrap_or_else(|e| {
            error!("Failed to parse JSON output: {}", e);
            Vec::new()
        });

    parsed_output
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
    pub browser_url: Option<String>,
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

fn get_active_browser_url_sync(app_name: &str, process_id: i32) -> Result<String, std::io::Error> {
    let detector = create_url_detector();
    match detector.get_active_url(app_name, process_id) {
        Ok(Some(url)) => Ok(url),
        Ok(None) => Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to get browser URL",
        )),
        Err(e) => Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Error getting browser URL: {}", e),
        )),
    }
}
