#[cfg(test)]
mod tests {
    use chrono::Utc;
    use crossbeam::channel;
    use screenpipe_audio::record_and_transcribe;
    use screenpipe_audio::{
        default_output_device, list_audio_devices, parse_device_spec, stt, WhisperModel,
    };
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    // ! what happen in github action?
    #[test]
    #[ignore]
    fn test_list_audio_devices() {
        let devices = list_audio_devices().unwrap();
        assert!(!devices.is_empty());
    }

    #[test]
    fn test_parse_device_spec() {
        let spec = parse_device_spec("Test Device (input)").unwrap();
        assert_eq!(spec.to_string(), "Test Device (input)");
    }

    #[test]
    #[ignore]
    fn test_speech_to_text() {
        println!("Starting speech to text test");

        println!("Loading audio file");
        let start = std::time::Instant::now();
        let whisper_model = WhisperModel::new().unwrap();

        let text = stt("./test_data/selah.mp3", &whisper_model).unwrap();
        let duration = start.elapsed();

        println!("Speech to text completed in {:?}", duration);
        println!("Transcribed text: {:?}", text);

        assert!(text.contains("love"));
    }

    #[test]
    #[ignore] // Add this if you want to skip this test in regular test runs
    fn test_record_and_transcribe() {
        // Setup
        let device_spec = default_output_device().unwrap();
        let duration = Duration::from_secs(30); // Record for 3 seconds
        let time = Utc::now().timestamp_millis();
        let output_path = PathBuf::from(format!("test_output_{}.mp3", time));
        let (sender, receiver) = channel::unbounded();

        // Act
        let start_time = Instant::now();
        let result = record_and_transcribe(&device_spec, duration, output_path.clone(), sender);
        let elapsed_time = start_time.elapsed();

        // Assert
        assert!(result.is_ok(), "record_and_transcribe should succeed");

        // Check if the recording duration is close to the specified duration
        assert!(
            elapsed_time >= duration && elapsed_time < duration + Duration::from_secs(3),
            "Recording duration should be close to the specified duration"
        );

        // Check if the file was created
        assert!(output_path.exists(), "Output file should exist");

        // Check if we received the correct AudioInput
        let audio_input = receiver.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(audio_input.path, output_path.to_str().unwrap());

        // Verify file format (you might need to install the `infer` crate for this)
        let kind = infer::get_from_path(&output_path).unwrap().unwrap();
        assert_eq!(
            kind.mime_type(),
            "audio/mpeg",
            "File should be in mp3 format"
        );

        // Clean up
        std::fs::remove_file(output_path).unwrap();
    }
}
