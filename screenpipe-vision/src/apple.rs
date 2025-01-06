#[cfg(target_os = "macos")]
use cidre::{
    cv::{PixelBuf, PixelFormat},
    ns,
    vn::{self, ImageRequestHandler, RecognizeTextRequest},
};
use image::DynamicImage;
use image::GenericImageView;
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
    languages: &ns::ArrayMut<ns::String>,
) -> (String, String, Option<f64>) {
    cidre::objc::ar_pool(|| {
        let (width, height) = image.dimensions();
        let rgb = image.grayscale().to_luma8();
        let raw_data = rgb.as_raw();

        let mut overall_confidence = 0.0;
        let default_ocr_result = (
            String::from(""),
            String::from("[]"),
            Some(overall_confidence),
        );

        let width = usize::try_from(width).unwrap();
        let height = usize::try_from(height).unwrap();

        let mut pixel_buf_out = None;

        let pixel_buf = unsafe {
            PixelBuf::create_with_bytes_in(
                width,
                height,
                PixelFormat::ONE_COMPONENT_8,
                raw_data.as_ptr() as *mut c_void,
                width,
                release_callback,
                null_mut(),
                None,
                &mut pixel_buf_out,
                None,
            )
            .to_result_unchecked(pixel_buf_out)
        }
        .unwrap();

        let handler = ImageRequestHandler::with_cv_pixel_buf(&pixel_buf, None).unwrap();
        let mut request = RecognizeTextRequest::new();
        // Recognize all languages
        request.set_recognition_langs(languages);
        request.set_uses_lang_correction(false);
        let requests = ns::Array::<vn::Request>::from_slice(&[&request]);
        let result = handler.perform(&requests);

        if result.is_err() {
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

                let json_output_string =
                    serde_json::to_string(&ocr_results_vec).unwrap_or_else(|e| {
                        error!("Failed to serialize JSON output: {}", e);
                        "[]".to_string()
                    });

                return (ocr_text, json_output_string, Some(overall_confidence));
            }
        }

        default_ocr_result
    })
}
