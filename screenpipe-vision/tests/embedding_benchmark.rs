use anyhow::Result;
use candle::Device;
use image::DynamicImage;
use screenpipe_core::get_device;
use screenpipe_vision::multimodal_embeddings::MultimodalEmbedder;
use std::time::Instant;

// Mock function to simulate screenshot capture
fn capture_screenshot() -> Result<DynamicImage> {
    // For this test, we'll create a dummy image
    let img = DynamicImage::new_rgb8(224, 224);
    Ok(img)
}

#[test]
fn test_screenshot_and_embedding_speed() -> Result<()> {
    let device = get_device();
    let embedder = MultimodalEmbedder::new(&device).unwrap();

    let start = Instant::now();

    // Capture screenshot
    let screenshot = capture_screenshot()?;
    let screenshot_time = start.elapsed();

    // Perform OCR (mocked for this test)
    let ocr_text = "This is a test OCR text";

    // Compute embeddings
    let embedding_start = Instant::now();
    let (text_embeddings, image_embeddings) = embedder.compute_embeddings(&screenshot, ocr_text)?;
    let embedding_time = embedding_start.elapsed();

    // Compute similarity
    let similarity = embedder.compute_similarity(&text_embeddings, &image_embeddings)?;

    let total_time = start.elapsed();

    println!("Screenshot capture time: {:?}", screenshot_time);
    println!("Embedding computation time: {:?}", embedding_time);
    println!("Total processing time: {:?}", total_time);
    println!("Similarity shape: {:?}", similarity.shape());

    Ok(())
}
