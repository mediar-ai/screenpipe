use image::DynamicImage;
use log::error;
use std::ffi::CStr;
use std::os::raw::{c_char, c_uchar};

#[cfg(target_os = "macos")]
#[link(name = "screenpipe")]
extern "C" {
    fn perform_ocr(
        image_data: *const c_uchar,
        length: usize,
        width: i32,
        height: i32,
    ) -> *mut c_char;
}
#[cfg(target_os = "macos")]
pub fn perform_ocr_apple(image: &DynamicImage) -> String {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let raw_data = rgba.as_raw();

    unsafe {
        let result_ptr = perform_ocr(
            raw_data.as_ptr(),
            raw_data.len(),
            width as i32,
            height as i32,
        );
        let result = CStr::from_ptr(result_ptr).to_string_lossy().into_owned();
        libc::free(result_ptr as *mut libc::c_void);
        result
    }
}

#[cfg(target_os = "macos")]
pub fn parse_apple_ocr_result(json_result: &str) -> (String, String) {
    let parsed_result: serde_json::Value = serde_json::from_str(json_result).unwrap_or_else(|e| {
        error!("Failed to parse JSON output: {}", e);
        serde_json::json!({
            "ocrResult": "",
            "textElements": [],
            "overallConfidence": 0.0
        })
    });

    let text = parsed_result["ocrResult"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let text_elements = parsed_result["textElements"]
        .as_array()
        .unwrap_or(&vec![])
        .clone();

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
                "left": element["boundingBox"]["x"].as_f64().unwrap_or(0.0).to_string(),
                "top": element["boundingBox"]["y"].as_f64().unwrap_or(0.0).to_string(),
                "width": element["boundingBox"]["width"].as_f64().unwrap_or(0.0).to_string(),
                "height": element["boundingBox"]["height"].as_f64().unwrap_or(0.0).to_string(),
                "conf": element["confidence"].as_f64().unwrap_or(0.0).to_string(),
                "text": element["text"].as_str().unwrap_or("").to_string()
            })
        })
        .collect();

    let json_output_string = serde_json::to_string(&json_output).unwrap_or_else(|e| {
        error!("Failed to serialize JSON output: {}", e);
        "[]".to_string()
    });

    (text, json_output_string)
}
