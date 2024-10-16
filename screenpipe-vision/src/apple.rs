use image::DynamicImage;
use log::error;
use std::ffi::CStr;
use std::os::raw::{c_char, c_uchar};

use std::ops::Drop;

struct OcrResultGuard(*mut c_char);

impl Drop for OcrResultGuard {
    fn drop(&mut self) {
        unsafe {
            if !self.0.is_null() {
                free_string(self.0);
            }
        }
    }
}

#[cfg(target_os = "macos")]
#[link(name = "screenpipe")]
extern "C" {
    fn perform_ocr(
        image_data: *const c_uchar,
        length: usize,
        width: i32,
        height: i32,
        languages: *const *const c_char,
        languages_count: i32,
    ) -> *mut c_char;
    fn free_string(ptr: *mut c_char);
}
#[cfg(target_os = "macos")]
pub fn perform_ocr_apple(
    image: &DynamicImage,
    languages: Vec<screenpipe_core::Language>,
) -> String {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let raw_data = rgba.as_raw();

    let languages = get_apple_languages(languages);

    let c_languages: Vec<*const c_char> = languages
        .iter()
        .map(|s| s.as_ptr() as *const c_char)
        .collect();

    unsafe {
        let result_ptr = perform_ocr(
            raw_data.as_ptr(),
            raw_data.len(),
            width as i32,
            height as i32,
            c_languages.as_ptr(),
            c_languages.len() as i32,
        );
        let _guard = OcrResultGuard(result_ptr);
        let result = CStr::from_ptr(result_ptr).to_string_lossy().into_owned();
        result
    }
}

#[cfg(target_os = "macos")]
pub fn parse_apple_ocr_result(json_result: &str) -> (String, String, Option<f64>) {
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
    let overall_confidence = parsed_result["overallConfidence"].as_f64();

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

    (text, json_output_string, overall_confidence)
}

#[cfg(target_os = "macos")]
fn get_apple_languages(languages: Vec<screenpipe_core::Language>) -> Vec<String> {
    use screenpipe_core::Language;

    let mut langs: Vec<String> = Vec::new();
    for lang in languages {
        let lang_str = match lang {
            Language::English => "en-US",
            Language::Spanish => "es-ES",
            Language::French => "fr-FR",
            Language::German => "de-DE",
            Language::Italian => "it-IT",
            Language::Portuguese => "pt-BR",
            Language::Russian => "ru-RU",
            Language::Chinese => "zh-Hans",
            Language::Korean => "ko-KR",
            Language::Japanese => "ja-JP",
            Language::Ukrainian => "uk-UA",
            Language::Thai => "th-TH",
            Language::Arabic => "ar-SA",
            _ => continue,
        };
        langs.push(lang_str.to_string());
    }
    langs
}
