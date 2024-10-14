#[cfg(test)]
mod tests {
    use chrono::Utc;
    use log::debug;
    use screenpipe_audio::stt::stt;
    use screenpipe_audio::vad_engine::{SileroVad, VadEngine, VadEngineEnum, VadSensitivity};
    use screenpipe_audio::whisper::WhisperModel;
    use screenpipe_audio::{
        default_output_device, pcm_decode, AudioInput, AudioTranscriptionEngine,
    };
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    fn setup() {
        // Initialize the logger with a debug level filter
        match env_logger::builder()
            .filter_level(log::LevelFilter::Debug)
            .filter_module("tokenizers", log::LevelFilter::Error)
            .try_init()
        {
            Ok(_) => (),
            Err(_) => (),
        };
    }

    #[tokio::test]
    #[ignore]
    async fn test_whisper_with_prompt() {
        setup();

        // Load a sample audio file for testing
        let audio_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test_data")
            .join("selah.mp4");
        let audio_data = pcm_decode(&audio_path).expect("Failed to decode audio file");

        // Create a temporary output path
        let output_path = PathBuf::from(format!(
            "test_output_prompt_{}.mp4",
            Utc::now().timestamp_millis()
        ));

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

        // Set up the prompt
        let prompt = Some("This is a song about peace and love".to_string());

        // Measure transcription time
        let start_time = Instant::now();

        let result = stt(
            &audio_input,
            &mut whisper_model,
            Arc::new(AudioTranscriptionEngine::WhisperLargeV3Turbo),
            &mut **vad_engine.lock().unwrap(),
            prompt,
            &output_path,
            true,
        )
        .await;

        let elapsed_time = start_time.elapsed();

        debug!("Transcription with prompt completed in {:?}", elapsed_time);

        // Assert and check results
        assert!(result.is_ok(), "Transcription with prompt should succeed");
        let (transcription, _) = result.unwrap();

        // Check if the transcription contains words related to the prompt
        assert!(
            transcription.contains("peace") || transcription.contains("love"),
            "Transcription should contain words related to the prompt"
        );

        debug!("Transcription result: {}", transcription);

        // Clean up
        std::fs::remove_file(output_path).unwrap_or_default();
    }

    #[tokio::test]
    #[ignore]
    async fn test_whisper_without_prompt() {
        setup();

        // Load the same audio file
        let audio_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test_data")
            .join("selah.mp4");
        let audio_data = pcm_decode(&audio_path).expect("Failed to decode audio file");

        let output_path = PathBuf::from(format!(
            "test_output_no_prompt_{}.mp4",
            Utc::now().timestamp_millis()
        ));

        let audio_input = AudioInput {
            data: Arc::new(audio_data.0),
            sample_rate: 16000,
            channels: 1,
            device: Arc::new(default_output_device().unwrap()),
        };

        let mut whisper_model = WhisperModel::new(&AudioTranscriptionEngine::WhisperLargeV3Turbo)
            .expect("Failed to initialize WhisperModel");

        let vad_engine: Box<dyn VadEngine + Send> = Box::new(SileroVad::new().await.unwrap());
        let vad_engine = Arc::new(Mutex::new(vad_engine));

        // No prompt this time
        let prompt = None;

        let start_time = Instant::now();

        let result = stt(
            &audio_input,
            &mut whisper_model,
            Arc::new(AudioTranscriptionEngine::WhisperLargeV3Turbo),
            &mut **vad_engine.lock().unwrap(),
            prompt,
            &output_path,
            true,
        )
        .await;

        let elapsed_time = start_time.elapsed();

        debug!(
            "Transcription without prompt completed in {:?}",
            elapsed_time
        );

        assert!(
            result.is_ok(),
            "Transcription without prompt should succeed"
        );
        let (transcription, _) = result.unwrap();

        debug!("Transcription result (no prompt): {}", transcription);

        // Clean up
        std::fs::remove_file(output_path).unwrap_or_default();
    }
}
