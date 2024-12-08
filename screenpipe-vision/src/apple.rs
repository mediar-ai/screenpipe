use image::DynamicImage;
use log::error;
use serde::{Deserialize, Serialize};
use std::{ffi::c_void, ptr::null_mut};

#[derive(Serialize, Deserialize, Debug)]
struct OcrResultBBox {
    x: f64,
    y: f64,
    height: f64,
    width: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct OcrTextElement {
    bounding_box: Vec<OcrResultBBox>,
    confidence: f32,
    text: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct OcrResult {
    ocr_result: String,
    text_elements: Vec<OcrTextElement>,
    overall_confidence: f32,
}

#[no_mangle]
#[cfg(target_os = "macos")]
extern "C" fn release_callback(_refcon: *mut c_void, _data_ptr: *const *const c_void) {
    // Implement your release logic here
}

#[cfg(target_os = "macos")]
pub fn perform_ocr_apple(
    image: &DynamicImage,
    _languages: Vec<screenpipe_core::Language>,
) -> (String, String, Option<f64>) {
    use cidre::{
        cv::{PixelBuf, PixelFormat},
        ns,
        vn::{self, ImageRequestHandler, RecognizeTextRequest},
    };
    use image::GenericImageView;

    let rgb = image.to_rgba8();
    let raw_data = rgb.as_raw();
    let (width, height) = image.dimensions();

    let mut overall_confidence = 0.0;
    let default_ocr_result = (
        String::from(""),
        String::from("[]"),
        Some(overall_confidence),
    );

    let width = usize::try_from(width).unwrap();
    let height = usize::try_from(height).unwrap();

    let pixel_buf = PixelBuf::new_with_bytes(
        width,
        height,
        raw_data.as_ptr() as *mut c_void,
        width * 4,
        release_callback,
        null_mut(),
        PixelFormat::_32_ARGB,
        None,
    )
    .unwrap();

    let handler = ImageRequestHandler::with_cv_pixel_buf(&pixel_buf, None).unwrap();
    let mut request = RecognizeTextRequest::new();
    // Recognize all languages
    request.set_revision(3);
    let requests = ns::Array::<vn::Request>::from_slice(&[&request]);
    let result = handler.perform(&requests);

    if result.is_err() {
        drop(pixel_buf);
        return default_ocr_result;
    }

    if let Some(results) = request.results() {
        if !results.is_empty() {
            let mut ocr_results_vec: Vec<serde_json::Value> = Vec::new();
            let mut ocr_text: String = String::new();
            results.iter().for_each(|result| {
                let observation_result = result.top_candidates(1).get(0).unwrap();
                let text = observation_result.string();
                let confidence = observation_result.confidence() as f64;
                let bbox = observation_result
                    .bounding_box_for_range(ns::Range::new(0, text.len()))
                    .unwrap()
                    .bounding_box();
                let x = bbox.origin.x;
                let y = bbox.origin.y;
                let height = bbox.size.height;
                let width = bbox.size.width;

                ocr_results_vec.push(serde_json::json!({
                    "level": "0",
                    "page_num": "0",
                    "block_num": "0",
                    "par_num": "0",
                    "line_num": "0",
                    "word_num": "0",
                    "left": x.to_string(),
                    "top": y.to_string(),
                    "width": width.to_string(),
                    "height": height.to_string(),
                    "conf": confidence.to_string(),
                    "text": text.to_string(),
                }));

                overall_confidence += confidence;
                ocr_text.push_str(text.to_string().as_str());
            });

            let json_output_string = serde_json::to_string(&ocr_results_vec).unwrap_or_else(|e| {
                error!("Failed to serialize JSON output: {}", e);
                "[]".to_string()
            });

            println!("{:?}", ocr_text.to_string());
            drop(pixel_buf);

            return (ocr_text, json_output_string, Some(overall_confidence));
        }
    }

    drop(pixel_buf);
    return default_ocr_result;
}

#[cfg(target_os = "macos")]
pub fn parse_apple_ocr_result(json_result: &str) -> (String, String, Option<f64>) {
    let parsed_result: serde_json::Value = serde_json::from_str(json_result).unwrap_or_else(|e| {
        error!("Failed to parse JSON output: {}", e);
        serde_json::json!({
            "ocr_result": "",
            "text_elements": [],
            "overall_confidence": 0.0
        })
    });

    let text = parsed_result["ocr_result"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let text_elements = parsed_result["text_elements"]
        .as_array()
        .unwrap_or(&vec![])
        .clone();
    let overall_confidence = parsed_result["overall_confidence"].as_f64();

    let json_output: Vec<serde_json::Value> = text_elements
        .iter()
        .map(|element| {
            serde_json::json!({
                "level": "0",
                "page_num": "0",
                "block_num": "0",
                "par_num": "0",
                "line_num": "0",
                "word_num": "0",
                "left": element["bounding_box"]["x"].as_f64().unwrap_or(0.0).to_string(),
                "top": element["bounding_box"]["y"].as_f64().unwrap_or(0.0).to_string(),
                "width": element["bounding_box"]["width"].as_f64().unwrap_or(0.0).to_string(),
                "height": element["bounding_box"]["height"].as_f64().unwrap_or(0.0).to_string(),
                "conf": element["confidence"].as_f64().unwrap_or(0.0).to_string(),
                "text": element["text"].as_str().unwrap_or("").to_string()
            })
        })
        .collect();

    let json_output_string = serde_json::to_string(&json_output).unwrap_or_else(|e| {
        error!("Failed to serialize JSON output: {}", e);
        "[]".to_string()
    });

    (text, json_output_string, overall_confidence)
}
