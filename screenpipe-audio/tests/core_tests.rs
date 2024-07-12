#[cfg(test)]
mod tests {
    use chrono::Utc;
    use cpal::traits::StreamTrait;
    use crossbeam::channel;
    use log::{debug, LevelFilter};
    use screenpipe_audio::record_and_transcribe;
    use screenpipe_audio::{
        default_output_device, list_audio_devices, parse_device_spec, stt, WhisperModel,
    };
    use std::path::PathBuf;
    use std::process::Command;
    use std::str::FromStr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
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
        setup();
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
        setup();

        // Setup
        let device_spec = default_output_device().unwrap();
        let duration = Duration::from_secs(30); // Record for 3 seconds
        let time = Utc::now().timestamp_millis();
        let output_path = PathBuf::from(format!("test_output_{}.mp3", time));
        let (sender, receiver) = channel::unbounded();
        let is_running = Arc::new(AtomicBool::new(true));

        // Act
        let start_time = Instant::now();
        println!("Starting record_and_transcribe");
        let result = record_and_transcribe(
            &device_spec,
            duration,
            output_path.clone(),
            sender,
            is_running,
        );
        println!("record_and_transcribe completed");
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
        println!("Audio input: {:?}", audio_input);

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

    #[test]
    #[ignore]
    fn test_record_and_transcribe_interrupt_before_end() {
        setup();

        // Setup
        let device_spec = default_output_device().unwrap();
        let duration = Duration::from_secs(30);
        let time = Utc::now().timestamp_millis();
        let output_path = PathBuf::from(format!("test_output_interrupt_{}.mp3", time));
        let (sender, receiver) = channel::unbounded();
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = Arc::clone(&is_running);

        // interrupt in 10 seconds
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(10));
            is_running_clone.store(false, Ordering::Relaxed);
        });

        // Act
        let start_time = Instant::now();

        record_and_transcribe(
            &device_spec,
            duration,
            output_path.clone(),
            sender,
            is_running,
        )
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
        let audio_input = receiver.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(audio_input.path, output_path.to_str().unwrap());

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

    #[tokio::test]
    #[ignore]
    async fn test_audio_transcription() {
        setup();
        use screenpipe_audio::{create_whisper_channel, record_and_transcribe};
        use std::sync::Arc;
        use std::time::Duration;
        use tokio::time::timeout;

        // 1. start listening to https://music.youtube.com/watch?v=B6WAlAzuJb4&si=775sYWLG0b7XhQIH&t=50
        // 2. run the test
        // 3. the test should succeed (takes ~120s for some reason?) ! i think whisper is just slow as hell on cpu?

        // Setup
        let device_spec = Arc::new(default_output_device().unwrap());
        let output_path =
            PathBuf::from(format!("test_output_{}.mp3", Utc::now().timestamp_millis()));
        let output_path_2 = output_path.clone();
        let (whisper_sender, whisper_receiver) = create_whisper_channel().unwrap();
        let is_running = Arc::new(AtomicBool::new(true));
        // Start recording in a separate thread
        let recording_thread = std::thread::spawn(move || {
            let device_spec = Arc::clone(&device_spec);
            let whisper_sender = whisper_sender.clone();
            record_and_transcribe(
                device_spec.as_ref(),
                Duration::from_secs(15),
                output_path.clone(),
                whisper_sender,
                is_running,
            )
            .unwrap();
        });

        // Wait for the recording to complete (with a timeout)
        let timeout_duration = Duration::from_secs(10); // Adjust as needed
        let result = timeout(timeout_duration, async {
            // Wait for the transcription result
            let transcription_result = whisper_receiver.recv().unwrap();
            debug!("Received transcription: {:?}", transcription_result);
            // Check if we received a valid transcription
            assert!(
                transcription_result.error.is_none(),
                "Transcription error occurred"
            );
            assert!(
                transcription_result.transcription.is_some(),
                "No transcription received"
            );

            let transcription = transcription_result.transcription.unwrap();
            assert!(!transcription.is_empty(), "Transcription is empty");

            println!("Received transcription: {}", transcription);

            assert!(
                transcription.contains("même")
                    || transcription.contains("tu m'aimes")
                    || transcription.contains("champs")
            );

            transcription
        })
        .await;

        // Check the result
        match result {
            Ok(transcription) => {
                println!("Test passed. Transcription: {}", transcription);
            }
            Err(_) => {
                panic!("Test timed out waiting for transcription");
            }
        }

        // Clean up
        let _ = recording_thread.join();
        std::fs::remove_file(output_path_2).unwrap_or_default();
    }
}
