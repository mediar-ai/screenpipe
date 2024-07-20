use std::path::PathBuf;
use std::time::Instant;

use screenpipe_vision::perform_ocr;

#[test]
#[ignore] // TODO: finish implementation of this test?
fn test_ocr_output() -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting test_ocr_output");

    // Use the correct path to the testing_OCR.png file
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests/image.png");
    println!("Path to image.png: {:?}", path);

    let image = image::open(&path).expect("Failed to open image");

    // Start timing
    let start = Instant::now();

    let (text, data_output, json_output) = perform_ocr(&image);

    // Stop timing
    let duration = start.elapsed();
    let duration_secs = duration.as_secs_f64();

    // Calculate average confidence score
    let total_conf: f32 = data_output.data.iter().map(|line| line.conf).sum();
    let avg_conf = total_conf / data_output.data.len() as f32;

    println!("Average confidence score: {:.2}", avg_conf);

    // println!("TSV:");
    // println!("{}", tsv_output);
    // println!("Text:");
    // println!("{}", text);
    // println!("json_output:");
    // println!("{}", json_output);
    // println!("Data output:");
    // println!("{:?}", data_output);

    println!("Time taken for OCR: {:.1} seconds", duration_secs);

    // Print character lengths
    println!("Character length of OCR text: {}", text.len());
    // println!("Character length of TSV output: {}", tsv_output.len());
    println!("Character length of JSON output: {}", json_output.len());

    assert!(!text.is_empty(), "OCR text should not be empty");
    // assert!(!tsv_output.is_empty(), "TSV output should not be empty");

    Ok(())
}
