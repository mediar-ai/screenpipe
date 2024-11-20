#[cfg(test)]
mod tests {
    use chrono::Utc;
    use log::{debug, LevelFilter};
    use screenpipe_audio::stt::{prepare_segments, stt};
    use screenpipe_audio::vad_engine::{SileroVad, VadEngine, VadEngineEnum, VadSensitivity};
    use screenpipe_audio::whisper::WhisperModel;
    use screenpipe_audio::{
        default_output_device, list_audio_devices, pcm_decode, AudioInput, AudioStream,
        AudioTranscriptionEngine,
    };
    use screenpipe_audio::{parse_audio_device, record_and_transcribe};
    use screenpipe_core::Language;
    use std::path::PathBuf;
    use std::process::Command;
    use std::str::FromStr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    use tokio::sync::Mutex;

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
    #[ignore] // Add this if you want to skip this test in regular test runs
    async fn test_record_and_transcribe() {
        setup();

        // Setup
        let device_spec = Arc::new(default_output_device().unwrap());
        let duration = Duration::from_secs(30); // Record for 3 seconds
        let time = Utc::now().timestamp_millis();
        let output_path = PathBuf::from(format!("test_output_{}.mp4", time));
        let (sender, receiver) = crossbeam::channel::bounded(100);
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = Arc::clone(&is_running);

        let audio_stream = AudioStream::from_device(device_spec, is_running_clone)
            .await
            .unwrap();

        // Act
        let start_time = Instant::now();
        println!("Starting record_and_transcribe");
        let result =
            record_and_transcribe(Arc::new(audio_stream), duration, sender, is_running).await;
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
        let audio_input = receiver.try_recv().unwrap();
        assert_eq!(audio_input.data.len(), 0);
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

        let audio_stream = AudioStream::from_device(device_spec, is_running_clone.clone())
            .await
            .unwrap();

        // interrupt in 10 seconds
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(10)).await;
            is_running_clone.store(false, Ordering::Relaxed);
        });

        // Act
        let start_time = Instant::now();

        record_and_transcribe(Arc::new(audio_stream), duration, sender, is_running)
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
            PathBuf::from(format!("test_output_{}.mp4", Utc::now().timestamp_millis()));
        let output_path_2 = output_path.clone();
        let (whisper_sender, whisper_receiver, _) = create_whisper_channel(
            Arc::new(AudioTranscriptionEngine::WhisperTiny),
            VadEngineEnum::WebRtc,
            None,
            &output_path_2.clone(),
            VadSensitivity::High,
            vec![],
        )
        .await
        .unwrap();
        let is_running = Arc::new(AtomicBool::new(true));
        // Start recording in a separate thread
        let recording_thread = tokio::spawn(async move {
            let device_spec = Arc::clone(&device_spec);
            let whisper_sender = whisper_sender.clone();
            let audio_stream = AudioStream::from_device(device_spec, is_running.clone())
                .await
                .unwrap();

            record_and_transcribe(
                Arc::new(audio_stream),
                Duration::from_secs(15),
                whisper_sender,
                is_running,
            )
            .await
            .unwrap();
        });

        // Wait for the recording to complete (with a timeout)
        let timeout_duration = Duration::from_secs(10); // Adjust as needed
        let result = timeout(timeout_duration, async {
            // Wait for the transcription result
            let transcription_result = whisper_receiver.try_recv().unwrap();
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
        let _ = recording_thread.abort();
        std::fs::remove_file(output_path_2).unwrap_or_default();
    }

    #[tokio::test]
    #[ignore]
    async fn test_audio_transcription_language() {
        setup();
        use std::sync::Arc;

        // Setup
        let whisper_model = Arc::new(tokio::sync::Mutex::new(
            WhisperModel::new(&AudioTranscriptionEngine::WhisperLargeV3Turbo).unwrap(),
        ));
        let vad_engine: Arc<tokio::sync::Mutex<Box<dyn VadEngine + Send>>> = Arc::new(
            tokio::sync::Mutex::new(Box::new(SileroVad::new().await.unwrap())),
        );
        let output_path = Arc::new(PathBuf::from("test_output"));
        let audio_data = screenpipe_audio::pcm_decode("test_data/Arifi.wav")
            .expect("Failed to decode audio file");

        let audio_input = AudioInput {
            data: Arc::new(audio_data.0),
            sample_rate: 44100, // hardcoded based on test data sample rate
            channels: 1,
            device: Arc::new(screenpipe_audio::default_input_device().unwrap()),
        };

        let mut segments = prepare_segments(&audio_input, vad_engine.clone())
            .await
            .unwrap();
        let mut whisper_model_guard = whisper_model.lock().await;

        let mut transcription_result = String::new();
        while let Some(segment) = segments.recv().await {
            let (transcript, _) = stt(
                &segment.samples,
                audio_input.sample_rate,
                &audio_input.device.to_string(),
                &mut whisper_model_guard,
                Arc::new(AudioTranscriptionEngine::WhisperLargeV3Turbo),
                None,
                &output_path,
                true,
                vec![Language::English],
            )
            .await
            .unwrap();

            transcription_result.push_str(&transcript);
        }
        drop(whisper_model_guard);

        debug!("Received transcription: {:?}", transcription_result);
        // Check if we received a valid transcription
        assert!(!transcription_result.is_empty(), "Transcription is empty");

        println!("Received transcription: {}", transcription_result);

        assert!(
            transcription_result.contains("موسیقی")
                || transcription_result.contains("تعال")
                || transcription_result.contains("الحيوانات")
        );

        // Clean up
        std::fs::remove_file("test_output").unwrap_or_default();
    }

    #[tokio::test]
    #[ignore]
    async fn test_stt_speed() {
        setup();

        // Load a sample audio file for testing
        let audio_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test_data")
            .join("selah.mp4");
        let audio_data = pcm_decode(&audio_path).expect("Failed to decode audio file");
        // Create a temporary output path
        let output_path =
            PathBuf::from(format!("test_output_{}.mp4", Utc::now().timestamp_millis()));

        // Create AudioInput from the audio data
        let audio_input = AudioInput {
            data: Arc::new(audio_data.0),
            sample_rate: 16000, // Adjust this based on your test audio
            channels: 1,
            device: Arc::new(default_output_device().unwrap()),
        };

        // Initialize the WhisperModel
        let mut whisper_model = WhisperModel::new(&AudioTranscriptionEngine::WhisperLargeV3Turbo)
            .expect("Failed to initialize WhisperModel");

        // Initialize VAD engine
        let vad_engine: Box<dyn VadEngine + Send> = Box::new(SileroVad::new().await.unwrap());
        let vad_engine = Arc::new(Mutex::new(vad_engine));

        // Measure transcription time
        let start_time = Instant::now();

        let mut segments = prepare_segments(&audio_input, vad_engine.clone())
            .await
            .unwrap();

        let mut transcription = String::new();
        while let Some(segment) = segments.recv().await {
            let (transcript, _) = stt(
                &segment.samples,
                audio_input.sample_rate,
                &audio_input.device.to_string(),
                &mut whisper_model,
                Arc::new(AudioTranscriptionEngine::WhisperLargeV3Turbo),
                None,
                &output_path,
                true,
                vec![Language::English],
            )
            .await
            .unwrap();

            transcription.push_str(&transcript);
        }

        let elapsed_time = start_time.elapsed();

        debug!("Transcription completed in {:?}", elapsed_time);

        // Clean up
        std::fs::remove_file(output_path).unwrap_or_default();
    }
}
