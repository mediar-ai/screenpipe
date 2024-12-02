use image::DynamicImage;
use log::error;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

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

#[cfg(target_os = "macos")]
pub fn perform_ocr_apple(
    image: &DynamicImage,
    _languages: Vec<screenpipe_core::Language>,
) -> String {
    use cidre::{
        ns,
        vn::{self, ImageRequestHandler, RecognizeTextRequest},
    };

    let default_ocr_result = serde_json::to_string(&OcrResult {
        ocr_result: String::new(),
        overall_confidence: 0.0,
        text_elements: Vec::new(),
    }).unwrap();

    let file_name = Uuid::new_v4().as_urn().to_string();
    let temp_path = PathBuf::from(std::env::temp_dir()).join(file_name + ".png");
    let _ = image.save(&temp_path);

    let file_uri = format!("file://{}", temp_path.to_str().unwrap());
    let url = ns::Url::with_string(&ns::String::with_str(&file_uri));

    let handler = ImageRequestHandler::with_url(&url.unwrap(), None);
    let mut request = RecognizeTextRequest::new();
    // Recognize all languages
    request.set_revision(3);
    let requests = ns::Array::<vn::Request>::from_slice(&[&request]);
    let result = handler.perform(&requests);

    if result.is_err() {
        return default_ocr_result;
    }

    // let results = request.results();

    if let Some(results) = request.results() {
        if !results.is_empty() {
            let mut ocr_results_vec: Vec<OcrTextElement> = Vec::new();
            let mut overall_confidence: f32 = 0.0;
            let mut ocr_text: String = String::new();
            results.iter().for_each(|result| {
                let observation_result = result.top_candidates(1).get(0).unwrap();
                let text = observation_result.string();
                let confidence = observation_result.confidence();
                let bbox = observation_result
                    .bounding_box_for_range(ns::Range::new(0, text.len()))
                    .unwrap()
                    .bounding_box();
                let x = bbox.origin.x;
                let y = bbox.origin.y;
                let height = bbox.size.height;
                let width = bbox.size.width;

                ocr_results_vec.push(OcrTextElement {
                    text: text.to_string(),
                    bounding_box: vec![OcrResultBBox {
                        x,
                        y,
                        height,
                        width,
                    }],
                    confidence,
                });

                overall_confidence += confidence;
                ocr_text += &text.to_string();
            });
            let result_string = serde_json::to_string(&OcrResult {
                overall_confidence,
                ocr_result: ocr_text.to_string(),
                text_elements: ocr_results_vec,
            })
            .unwrap();
            return result_string;
        }
    }

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
