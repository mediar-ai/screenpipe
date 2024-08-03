use crate::core::MaxAverageFrame;
use core_foundation::base::FromVoid;
use core_graphics::base::kCGRenderingIntentDefault;
// Assuming core.rs is in the same crate under the `core` module
use image::codecs::png::PngEncoder;
use image::DynamicImage;
use image_compare::{Algorithm, Metric, Similarity}; // Added import for Similarity
use log::{debug, error};
use rusty_tesseract::{Args, DataOutput, Image}; // Added import for Args, Image, DataOutput
use serde_json;
use std::collections::HashMap;
use std::fs::{self, File};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use xcap::Monitor;

#[derive(Clone, Debug)]
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

pub fn compare_images_histogram(image1: &DynamicImage, image2: &DynamicImage) -> f64 {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    let result =
        image_compare::gray_similarity_histogram(Metric::Hellinger, &image_one, &image_two)
            .expect("Images had different dimensions");
    result
}

pub fn compare_images_ssim(image1: &DynamicImage, image2: &DynamicImage) -> f64 {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    let result: Similarity =
        image_compare::gray_similarity_structure(&Algorithm::MSSIMSimple, &image_one, &image_two)
            .expect("Images had different dimensions");
    result.score
}

pub fn perform_ocr_tesseract(image: &DynamicImage) -> (String, DataOutput, String) {
    // debug!("inside perform_ocr");
    let args = Args {
        lang: "eng".to_string(),
        config_variables: HashMap::from([("tessedit_create_tsv".into(), "1".into())]),
        dpi: Some(600), // 150 is a balanced option, 600 seems faster surprisingly, the bigger the number the more granualar result
        psm: Some(1), // PSM 1: Automatic page segmentation with OSD. PSM 3: Automatic page segmentation with OSD
        oem: Some(1), //1: Neural nets LSTM engine only,    3: Default, based on what is available. (Default)
    };

    let ocr_image = Image::from_dynamic_image(image).unwrap();

    // Extract data output
    let data_output = rusty_tesseract::image_to_data(&ocr_image, &args).unwrap();
    // let tsv_output = data_output_to_tsv(&data_output);

    // Extract text from data output
    let text = data_output_to_text(&data_output);

    // Extract JSON output with confidence scores
    let mut lines: Vec<HashMap<String, String>> = Vec::new();
    let mut current_line = String::new();
    let mut current_conf = 0.0;
    let mut word_count = 0;
    let mut last_word_num = 0;

    // debug!("inside data_output inside perform_ocr");
    for record in &data_output.data {
        if record.word_num == 0 {
            if !current_line.is_empty() {
                let avg_conf = current_conf / word_count as f32;
                let mut line_data = HashMap::new();
                line_data.insert("text".to_string(), current_line.clone());
                line_data.insert("confidence".to_string(), format!("{:.2}", avg_conf));
                line_data.insert(
                    "line_position".to_string(),
                    format!(
                        "level{}page_num{}block_num{}par_num{}line_num{}",
                        record.level,
                        record.page_num,
                        record.block_num,
                        record.par_num,
                        record.line_num
                    ),
                );
                lines.push(line_data);
                current_line.clear();
                current_conf = 0.0;
                word_count = 0;
            }
        }
        if record.word_num > last_word_num {
            if !current_line.is_empty() {
                current_line.push(' ');
            }
            current_line.push_str(&record.text);
            current_conf += record.conf;
            word_count += 1;
        }
        last_word_num = record.word_num;
    }
    if !current_line.is_empty() {
        let avg_conf = current_conf / word_count as f32;
        let mut line_data = HashMap::new();
        line_data.insert("text".to_string(), current_line);
        line_data.insert("confidence".to_string(), format!("{:.2}", avg_conf));
        lines.push(line_data);
    }

    // Sort lines by confidence in descending order
    // lines.sort_by(|a, b| b["confidence"].partial_cmp(&a["confidence"]).unwrap());
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

pub async fn capture_screenshot(monitor: &Monitor) -> (DynamicImage, u64, Duration) {
    let capture_start = Instant::now();
    let buffer = monitor.capture_image().unwrap();
    let image = DynamicImage::ImageRgba8(buffer);
    let image_hash = calculate_hash(&image);
    let capture_duration = capture_start.elapsed();
    (image, image_hash, capture_duration)
}

pub async fn compare_with_previous_image(
    previous_image: &Option<Arc<DynamicImage>>,
    current_image: &DynamicImage,
    max_average: &mut Option<MaxAverageFrame>, // Prefix with underscore if not used
    frame_number: u64,
    max_avg_value: &mut f64,
) -> f64 {
    let mut current_average = 0.0;
    if let Some(prev_image) = previous_image {
        let histogram_diff = compare_images_histogram(prev_image, &current_image);
        let ssim_diff = 1.0 - compare_images_ssim(prev_image, &current_image);
        current_average = (histogram_diff + ssim_diff) / 2.0;
        let max_avg_frame_number = max_average.as_ref().map_or(0, |frame| frame.frame_number);
        debug!(
            "Frame {}: Histogram diff: {:.3}, SSIM diff: {:.3}, Current Average: {:.3}, Max_avr: {:.3} Fr: {}",
            frame_number, histogram_diff, ssim_diff, current_average, *max_avg_value, max_avg_frame_number
        );
    } else {
        debug!("No previous image to compare for frame {}", frame_number);
    }
    current_average
}

pub async fn save_text_files(
    frame_number: u64,
    new_text_json: &Vec<HashMap<String, String>>,
    current_text_json: &Vec<HashMap<String, String>>,
    previous_text_json: &Option<Vec<HashMap<String, String>>>,
) {
    let id = frame_number;
    debug!("Saving text files for frame {}", frame_number);

    // Ensure the text_json directory exists
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

#[cfg(target_os = "windows")]
pub async fn perform_ocr_windows(image: &DynamicImage) -> (String, DataOutput, String) {
    use std::io::Cursor;
    use windows::{
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine as WindowsOcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };

    let mut buffer = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
        .unwrap();

    let stream = InMemoryRandomAccessStream::new().unwrap();
    let writer = DataWriter::CreateDataWriter(&stream).unwrap();
    writer.WriteBytes(&buffer).unwrap();
    writer.StoreAsync().unwrap().get().unwrap();
    writer.FlushAsync().unwrap().get().unwrap();
    stream.Seek(0).unwrap();

    let decoder = BitmapDecoder::CreateWithIdAsync(BitmapDecoder::PngDecoderId().unwrap(), &stream)
        .unwrap()
        .get()
        .unwrap();

    let bitmap = decoder.GetSoftwareBitmapAsync().unwrap().get().unwrap();

    let engine = WindowsOcrEngine::TryCreateFromUserProfileLanguages().unwrap();
    let result = engine.RecognizeAsync(&bitmap).unwrap().get().unwrap();

    let text = result.Text().unwrap().to_string();

    let text = result.Text().unwrap().to_string();

    // Create a simple DataOutput structure
    let data_output = DataOutput {
        data: vec![],
        output: text.clone(),
    };

    // Create a JSON output similar to other OCR functions
    let json_output = serde_json::json!([{
        "text": text,
        "confidence": "100.00" // Windows OCR doesn't provide confidence scores, so we use a default high value
    }])
    .to_string();

    (text, data_output, json_output)
}

#[cfg(target_os = "macos")]
#[link(name = "Vision", kind = "framework")]
extern "C" {}

use core_foundation::string::CFString;
use core_graphics::color_space::CGColorSpace;
use core_graphics::data_provider::CGDataProvider;
use core_graphics::image::CGImage;
use core_graphics::image::CGImageAlphaInfo;
use objc::runtime::{Class, Object};
use objc::{msg_send, sel, sel_impl};
pub fn perform_ocr_apple(image: &DynamicImage) -> (String, DataOutput, String) {
    // Convert DynamicImage to CGImage
    let rgba_image = image.to_rgba8();
    let (width, height) = rgba_image.dimensions();
    let bytes_per_row = width as usize * 4;
    let data = rgba_image.into_raw();

    let cg_image = {
        let provider = CGDataProvider::from_buffer(Arc::new(data));
        CGImage::new(
            width as usize,
            height as usize,
            8,  // bits per component
            32, // bits per pixel
            bytes_per_row,
            &CGColorSpace::create_device_rgb(),
            CGImageAlphaInfo::CGImageAlphaPremultipliedLast as u32,
            &provider,
            true,
            kCGRenderingIntentDefault,
        )
    };

    unsafe {
        let vision_class =
            Class::get("VNRecognizeTextRequest").expect("VNRecognizeTextRequest class not found");
        let request: *mut Object = msg_send![vision_class, alloc];
        let request: *mut Object = msg_send![request, init];

        println!("VNRecognizeTextRequest created successfully");

        // Set up the request parameters
        let _: () = msg_send![request, setRecognitionLevel:1]; // VNRequestTextRecognitionLevelAccurate
        let _: () = msg_send![request, setUsesLanguageCorrection:true];

        // Create VNImageRequestHandler
        let handler_class =
            Class::get("VNImageRequestHandler").expect("VNImageRequestHandler class not found");
        let handler: *mut Object = msg_send![handler_class, alloc];
        let handler: *mut Object = msg_send![handler, initWithCGImage:cg_image options:std::ptr::null::<std::ffi::c_void>()];

        // Perform the request
        let mut error_ptr: *mut Object = std::ptr::null_mut();
        let success: bool = msg_send![handler, performRequests:&[request] error:&mut error_ptr];

        if !success {
            let error = if !error_ptr.is_null() {
                let description: *const Object = msg_send![error_ptr, localizedDescription];
                let cf_description = CFString::from_void(description as *const _);
                cf_description.to_string()
            } else {
                "Unknown error".to_string()
            };
            return (
                format!("Error performing OCR request: {}", error),
                DataOutput {
                    data: vec![],
                    output: "".to_string(),
                },
                "".to_string(),
            );
        }

        // Extract results
        let results: *const Object = msg_send![request, results];
        if results.is_null() {
            return (
                "Error: No results from OCR request".to_string(),
                DataOutput {
                    data: vec![],
                    output: "".to_string(),
                },
                "".to_string(),
            );
        }

        let count: usize = msg_send![results, count];
        println!("Number of OCR results: {}", count);

        let mut recognized_text = String::new();
        for i in 0..count {
            let observation: *const Object = msg_send![results, objectAtIndex:i];
            if observation.is_null() {
                println!("Warning: Null observation at index {}", i);
                continue;
            }

            let text: *const Object = msg_send![observation, string];
            if text.is_null() {
                println!("Warning: Null text for observation at index {}", i);
                continue;
            }

            let cf_string = CFString::from_void(text as *const _);
            recognized_text.push_str(&cf_string.to_string());
            recognized_text.push('\n');
        }

        let data_output = DataOutput {
            data: vec![],
            output: recognized_text.clone(),
        };

        let json_output = serde_json::json!({
            "text": recognized_text,
            "confidence": 1.0,
        })
        .to_string();

        (recognized_text, data_output, json_output)
    }
}
