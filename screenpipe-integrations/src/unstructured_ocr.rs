use image::{DynamicImage, ImageEncoder, codecs::png::PngEncoder};
use reqwest::multipart::{Form, Part};
use rusty_tesseract::DataOutput;
use serde_json;
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Arc;
use tokio::time::{timeout, Duration}; // Add timeout and Duration

pub async fn perform_ocr_cloud(image: &Arc<DynamicImage>) -> Result<(String, DataOutput, String), String> {
    let api_key = "ZUxfTRkf6lRgHZDXPHlFaSoOKAEbwV".to_string();
    let api_url = "https://api.unstructuredapp.io/general/v0/general".to_string();

    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    PngEncoder::new(&mut cursor)
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .unwrap();

    let part = Part::bytes(buffer)
        .file_name("image.png".to_string())
        .mime_str("image/png")
        .unwrap();

    let form = Form::new()
        .part("files", part)
        .text("strategy", "auto")
        .text("coordinates", "true");

    let client = reqwest::Client::new();
    let response = match timeout(Duration::from_secs(180), client
        .post(&api_url)
        .header("accept", "application/json")
        .header("unstructured-api-key", &api_key)
        .multipart(form)
        .send()).await {
        Ok(Ok(response)) => response,
        Ok(Err(e)) => return Err(format!("Request error: {}", e)),
        Err(_) => return Err("Request timed out".to_string()),
    };

    let response_text = if response.status().is_success() {
        response.text().await.unwrap()
    } else {
        return Err(format!("Error: {}", response.status()));
    };

    let json_output = response_text.clone();
    let data_output = DataOutput {
        data: Vec::new(),
        output: String::new(),
    };

    let parsed_response: Vec<HashMap<String, serde_json::Value>> =
        serde_json::from_str(&response_text).unwrap();
    let text = parsed_response
        .iter()
        .filter_map(|item| item.get("text").and_then(|v| v.as_str()))
        .collect::<Vec<&str>>()
        .join(" ");

    Ok((text, data_output, json_output))
}