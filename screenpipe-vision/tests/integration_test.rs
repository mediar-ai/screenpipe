use assert_fs::prelude::*;
use std::path::PathBuf;
use std::fs;
use screenpipe_vision::core::perform_ocr; // Adjust the import path

#[test]
fn test_ocr_output() -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting test_ocr_output");

    // Use the correct path to the testing_OCR.png file
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests/testing_OCR.png");
    println!("Path to testing_OCR.png: {:?}", path);

    let image = image::open(&path).expect("Failed to open image");
    let (text, tsv_output, json_output) = perform_ocr(&image);

    // println!("OCR Text: {}", text);
    println!("json_output: {}", json_output);

    assert!(!text.is_empty(), "OCR text should not be empty");
    assert!(!tsv_output.is_empty(), "TSV output should not be empty");

    Ok(())
}