#[cfg(target_os = "macos")]
#[cfg(test)]
mod tests {
    use screenpipe_vision::{process_ocr_task, OcrEngine};
    use std::path::PathBuf;
    use std::{sync::Arc, time::Instant};
    use tokio::sync::{mpsc, Mutex};

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn test_process_ocr_task_apple() {
        // Use an absolute path that works in both local and CI environments
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("tests");
        path.push("testing_OCR.png");
        println!("Path to testing_OCR.png: {:?}", path);
        let image = image::open(&path).expect("Failed to open image");

        let image_arc = Arc::new(image);
        let frame_number = 1;
        let timestamp = Instant::now();
        let (tx, mut rx) = mpsc::channel(1);
        let previous_text_json = Arc::new(Mutex::new(None));
        let ocr_engine = Arc::new(OcrEngine::AppleNative);
        let app_name = "test_app".to_string();

        let result = process_ocr_task(
            image_arc,
            frame_number,
            timestamp,
            tx,
            &previous_text_json,
            false,
            ocr_engine,
            app_name,
        )
        .await;

        assert!(result.is_ok(), "process_ocr_task failed: {:?}", result);

        // Check if we received a result
        let capture_result = rx.try_recv();
        assert!(capture_result.is_ok(), "Failed to receive OCR result");

        let capture_result = capture_result.unwrap();

        // Add more specific assertions based on expected behavior
        assert!(
            !capture_result.text.is_empty(),
            "OCR text should not be empty"
        );
        assert_eq!(capture_result.frame_number, 1, "Frame number should be 1");
        assert_eq!(
            capture_result.app_name, "test_app",
            "App name should be 'test_app'"
        );

        println!("OCR text: {:?}", capture_result.text);

        // You might want to add more specific checks based on the content of your test image
        // For example, if your test image contains the text "Hello, World!", you could assert:
        // assert!(capture_result.text.contains("Hello, World!"), "OCR text should contain 'Hello, World!'");
    }
}
