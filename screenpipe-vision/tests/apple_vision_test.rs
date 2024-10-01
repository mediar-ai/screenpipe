#[cfg(target_os = "macos")]
#[cfg(test)]
mod tests {
    use image::GenericImageView;
    use screenpipe_vision::perform_ocr_apple;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_apple_native_ocr() {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("tests");
        path.push("testing_OCR.png");
        println!("Path to testing_OCR.png: {:?}", path);

        // Check if file exists and print its size
        if let Ok(metadata) = std::fs::metadata(&path) {
            println!("File size: {} bytes", metadata.len());
        }

        // Attempt to open the image
        let image = image::open(&path).expect("Failed to open image");
        println!("Image dimensions: {:?}", image.dimensions());

        // Convert image to RGB format
        let rgb_image = image.to_rgb8();
        println!("RGB image dimensions: {:?}", rgb_image.dimensions());

        let result = perform_ocr_apple(&image);

        println!("OCR text: {:?}", result);
        assert!(
            result.contains("receiver_count"),
            "OCR failed: {:?}",
            result
        );
    }
// # 中文测试
    #[tokio::test]
    async fn test_apple_native_ocr_chinese() {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("tests");
        path.push("testing_OCR_chinese.png");
        println!("Path to testing_OCR_chinese.png: {:?}", path);

        let image = image::open(&path).expect("Failed to open Chinese test image");
        println!("Image dimensions: {:?}", image.dimensions());

        let result = perform_ocr_apple(&image);

        println!("OCR text: {:?}", result);
        assert!(
            result.contains("管理分支"),  // 替换为您的测试图像中的实际中文文本
            "OCR failed to recognize Chinese text: {:?}",
            result
        );
    }
}
