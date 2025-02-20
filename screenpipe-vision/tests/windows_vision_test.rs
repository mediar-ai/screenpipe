#[cfg(target_os = "windows")]
#[cfg(test)]
mod tests {
    use screenpipe_vision::core::OcrTaskData;
    use screenpipe_vision::monitor::get_default_monitor;
    use screenpipe_vision::{process_ocr_task, OcrEngine};
    use std::{path::PathBuf, time::Instant};
    use tokio::sync::mpsc;

    use screenpipe_vision::{continuous_capture, CaptureResult};
    use std::time::Duration;
    use tokio::time::timeout;

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn test_process_ocr_task_windows() {
        // Use an absolute path that works in both local and CI environments
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("tests");
        path.push("testing_OCR.png");
        println!("Path to testing_OCR.png: {:?}", path);
        let image = image::open(&path).expect("Failed to open image");

        let image_arc = image.clone();
        let frame_number = 1;
        let timestamp = Instant::now();
        let (tx, _rx) = mpsc::channel(1);
        let ocr_engine = OcrEngine::WindowsNative;

        let window_images = vec![(
            image.clone(),
            "test_app".to_string(),
            "test_window".to_string(),
            true,
        )];

        let result = process_ocr_task(
            OcrTaskData {
                image: image_arc,
                window_images,
                frame_number,
                timestamp,
                result_tx: tx,
            },
            false,
            &ocr_engine,
        )
        .await;

        assert!(result.is_ok());
        // Add more specific assertions based on expected behavior
    }

    #[tokio::test]
    #[ignore] // TODO require UI
    async fn test_continuous_capture() {
        // Create channels for communication
        let (result_tx, mut result_rx) = mpsc::channel::<CaptureResult>(10);

        // Create a mock monitor
        let monitor = get_default_monitor().await.id();

        // Set up test parameters
        let interval = Duration::from_millis(1000);
        let save_text_files_flag = false;
        let ocr_engine = OcrEngine::WindowsNative;

        // Spawn the continuous_capture function
        let capture_handle = tokio::spawn(continuous_capture(
            result_tx,
            interval,
            save_text_files_flag,
            ocr_engine,
            monitor,
            &[],
            &[],
        ));

        // Wait for a short duration to allow some captures to occur
        let timeout_duration = Duration::from_secs(5);
        let _result = timeout(timeout_duration, async {
            let mut capture_count = 0;
            while let Some(_capture_result) = result_rx.recv().await {
                capture_count += 1;
                // assert!(
                //     capture_result.image.width() == 100 && capture_result.image.height() == 100
                // );
                // println!(
                //     "capture_result: {:?}\n\n",
                //     capture_result.window_ocr_results.join("\n")
                // );
                if capture_count >= 3 {
                    break;
                }
            }
        })
        .await;

        // Stop the continuous_capture task
        capture_handle.abort();

        // Assert that we received some results without timing out
        // assert!(
        //     result.is_ok(),
        //     "Test timed out or failed to receive captures"
        // );
    }
}
