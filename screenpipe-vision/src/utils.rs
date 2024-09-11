use crate::capture_screenshot_by_window::capture_all_visible_windows;
use crate::core::MaxAverageFrame;
use image::DynamicImage;
use image_compare::{Algorithm, Metric, Similarity};
use log::{debug, error, warn};
use std::collections::HashMap;
use std::fs::{self, File};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use xcap::Monitor;

#[derive(Clone, Debug, Copy)]
pub enum OcrEngine {
    Unstructured,
    Tesseract,
    WindowsNative,
    AppleNative,
}

impl Default for OcrEngine {
    fn default() -> Self {
        OcrEngine::Tesseract
    }
}
pub fn calculate_hash(image: &DynamicImage) -> u64 {
    let mut hasher = DefaultHasher::new();
    image.as_bytes().hash(&mut hasher);
    hasher.finish()
}

pub fn compare_images_histogram(
    image1: &DynamicImage,
    image2: &DynamicImage,
) -> anyhow::Result<f64> {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    image_compare::gray_similarity_histogram(Metric::Hellinger, &image_one, &image_two)
        .map_err(|e| anyhow::anyhow!("Failed to compare images: {}", e))
}

pub fn compare_images_ssim(image1: &DynamicImage, image2: &DynamicImage) -> f64 {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    let result: Similarity =
        image_compare::gray_similarity_structure(&Algorithm::MSSIMSimple, &image_one, &image_two)
            .expect("Images had different dimensions");
    result.score
}

pub async fn capture_screenshot(
    monitor: &Monitor,
    ignore_list: &[String],
    include_list: &[String],
) -> Result<
    (
        DynamicImage,
        Vec<(DynamicImage, String, String, bool)>,
        u64,
        Duration,
    ),
    anyhow::Error,
> {
    // info!("Starting screenshot capture for monitor: {:?}", monitor);
    let capture_start = Instant::now();
    let buffer = monitor.capture_image().map_err(|e| {
        error!("Failed to capture monitor image: {}", e);
        anyhow::anyhow!("Monitor capture failed")
    })?;
    let image = DynamicImage::ImageRgba8(buffer);
    let image_hash = calculate_hash(&image);
    let capture_duration = capture_start.elapsed();

    let window_images = match capture_all_visible_windows(monitor, ignore_list, include_list).await
    {
        Ok(images) => images,
        Err(e) => {
            warn!(
                "Failed to capture window images: {}. Continuing with empty result.",
                e
            );
            Vec::new()
        }
    };

    Ok((image, window_images, image_hash, capture_duration))
}

pub async fn compare_with_previous_image(
    previous_image: Option<&DynamicImage>,
    current_image: &DynamicImage,
    max_average: &mut Option<MaxAverageFrame>,
    frame_number: u64,
    max_avg_value: &mut f64,
) -> anyhow::Result<f64> {
    let mut current_average = 0.0;
    if let Some(prev_image) = previous_image {
        let histogram_diff = compare_images_histogram(prev_image, current_image)?;
        let ssim_diff = 1.0 - compare_images_ssim(prev_image, current_image);
        current_average = (histogram_diff + ssim_diff) / 2.0;
        let max_avg_frame_number = max_average.as_ref().map_or(0, |frame| frame.frame_number);
        debug!(
            "Frame {}: Histogram diff: {:.3}, SSIM diff: {:.3}, Current Average: {:.3}, Max_avr: {:.3} Fr: {}",
            frame_number, histogram_diff, ssim_diff, current_average, *max_avg_value, max_avg_frame_number
        );
    } else {
        debug!("No previous image to compare for frame {}", frame_number);
    }
    Ok(current_average)
}

pub async fn save_text_files(
    frame_number: u64,
    new_text_json: &Vec<HashMap<String, String>>,
    current_text_json: &Vec<HashMap<String, String>>,
    previous_text_json: &Option<Vec<HashMap<String, String>>>,
) {
    let id = frame_number;
    debug!("Saving text files for frame {}", frame_number);

    if let Err(e) = fs::create_dir_all("text_json") {
        error!("Failed to create text_json directory: {}", e);
        return;
    }

    let new_text_lines: Vec<String> = new_text_json
        .iter()
        .map(|record| record.get("text").cloned().unwrap_or_default())
        .collect();

    let current_text_lines: Vec<String> = current_text_json
        .iter()
        .map(|record| record.get("text").cloned().unwrap_or_default())
        .collect();
    let base_path = PathBuf::from("text_json");
    let new_text_file_path = base_path.join(format!("new_text_{}.txt", id));
    let mut new_text_file = match File::create(&new_text_file_path) {
        Ok(file) => file,
        Err(e) => {
            error!("Failed to create new text file: {}", e);
            return;
        }
    };
    for line in new_text_lines {
        writeln!(new_text_file, "{}", line).unwrap();
    }

    let current_text_file_path = base_path.join(format!("current_text_{}.txt", id));
    let mut current_text_file = match File::create(&current_text_file_path) {
        Ok(file) => file,
        Err(e) => {
            error!("Failed to create current text file: {}", e);
            return;
        }
    };
    for line in current_text_lines {
        writeln!(current_text_file, "{}", line).unwrap();
    }

    if let Some(prev_json) = previous_text_json {
        let prev_text_lines: Vec<String> = prev_json
            .iter()
            .map(|record| record.get("text").cloned().unwrap_or_default())
            .collect();
        let prev_text_file_path = base_path.join(format!("previous_text_{}.txt", id));
        let mut prev_text_file = match File::create(&prev_text_file_path) {
            Ok(file) => file,
            Err(e) => {
                error!("Failed to create previous text file: {}", e);
                return;
            }
        };
        for line in prev_text_lines {
            if let Err(e) = writeln!(prev_text_file, "{}", line) {
                error!("Failed to write to previous text file: {}", e);
                return;
            }
        }
    }
}
