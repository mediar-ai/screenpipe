#[cfg(target_os = "windows")]
#[cfg(test)]
mod tests {
    use screenpipe_vision::{process_ocr_task, OcrEngine};
    use std::path::PathBuf;
    use std::{sync::Arc, time::Instant};
    use tokio::sync::{mpsc, Mutex};
    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn test_process_ocr_task_windows() {
        // Use an absolute path that works in both local and CI environments
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("tests");
        path.push("testing_OCR.png");
        println!("Path to testing_OCR.png: {:?}", path);
        let image = image::open(&path).expect("Failed to open image");

        let image_arc = Arc::new(image);
        let frame_number = 1;
        let timestamp = Instant::now();
        let (tx, _rx) = mpsc::channel(1);
        let previous_text_json = Arc::new(Mutex::new(None));
        let ocr_engine = Arc::new(OcrEngine::WindowsNative);
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

        assert!(result.is_ok());
        // Add more specific assertions based on expected behavior
    }
}
