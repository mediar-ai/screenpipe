#[cfg(test)]
mod tests {
    use chrono::Utc;
    use log::LevelFilter;
    use screenpipe_audio::vad_engine::{SileroVad, VadEngine, VadSensitivity};
    use screenpipe_audio::{default_output_device, list_audio_devices, AudioStream};
    use screenpipe_audio::{parse_audio_device, record_and_transcribe};
    use std::path::PathBuf;
    use std::process::Command;
    use std::str::FromStr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    fn setup() {
        // Initialize the logger with an info level filter
        match env_logger::builder()
            .filter_level(log::LevelFilter::Debug)
            .filter_module("tokenizers", LevelFilter::Error)
            .try_init()
        {
            Ok(_) => (),
            Err(_) => (),
        };
    }

    // ! what happen in github action?
    #[tokio::test]
    #[ignore]
    async fn test_list_audio_devices() {
        let devices = list_audio_devices().await.unwrap();
        assert!(!devices.is_empty());
    }

    #[test]
    fn test_parse_audio_device() {
        let spec = parse_audio_device("Test Device (input)").unwrap();
        assert_eq!(spec.to_string(), "Test Device (input)");
    }

    #[tokio::test]
    #[ignore]
    async fn test_record_and_transcribe_interrupt_before_end() {
        setup();

        // Setup
        let device_spec = Arc::new(default_output_device().unwrap());
        let duration = Duration::from_secs(30);
        let time = Utc::now().timestamp_millis();
        let output_path = PathBuf::from(format!("test_output_interrupt_{}.mp4", time));
        let (sender, receiver) = crossbeam::channel::bounded(100);
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = Arc::clone(&is_running);
        let mut vad_engine: Box<dyn VadEngine + Send> = Box::new(SileroVad::new().await.unwrap());
        vad_engine.set_sensitivity(VadSensitivity::High.into());
        let vad_engine = Arc::new(Mutex::new(vad_engine));

        let audio_stream = AudioStream::from_device(
            device_spec,
            is_running_clone.clone(),
            vad_engine,
            Duration::from_secs_f32(0.5),
        )
        .await
        .unwrap();

        // interrupt in 10 seconds
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(10)).await;
            is_running_clone.store(false, Ordering::Relaxed);
        });

        // Act
        let start_time = Instant::now();

        record_and_transcribe(
            Arc::new(audio_stream),
            duration,
            sender,
            is_running,
            Arc::new(output_path.clone()),
        )
        .await
        .unwrap();

        let elapsed_time = start_time.elapsed();

        println!("Elapsed time: {:?}", elapsed_time);
        // Assert
        assert!(
            elapsed_time < duration,
            "Recording should have been interrupted before the full duration"
        );
        assert!(
            elapsed_time >= Duration::from_secs(3),
            "Recording should have lasted at least 3 seconds"
        );

        // Check if the file was created
        assert!(output_path.exists(), "Output file should exist");

        // Check if we received the correct AudioInput
        let audio_input = receiver.try_recv().unwrap();
        assert_eq!(audio_input.data.len(), 0);

        // Verify file format
        let kind = infer::get_from_path(&output_path).unwrap().unwrap();
        assert_eq!(
            kind.mime_type(),
            "audio/mpeg",
            "File should be in mp3 format"
        );

        // Verify file duration
        let file_duration = get_audio_duration(&output_path).unwrap();
        assert!(
            file_duration >= Duration::from_secs(3) && file_duration < duration,
            "File duration should be between 3 seconds and the full duration"
        );

        // Clean up
        std::fs::remove_file(output_path).unwrap();
    }

    // Helper function to get audio duration (you'll need to implement this)
    fn get_audio_duration(path: &PathBuf) -> Result<Duration, Box<dyn std::error::Error>> {
        let output = Command::new("ffprobe")
            .args(&[
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path.to_str().unwrap(),
            ])
            .output()?;

        let duration_str = String::from_utf8(output.stdout)?;
        let duration_secs = f64::from_str(duration_str.trim())?;

        Ok(Duration::from_secs_f64(duration_secs))
    }
}
