#[cfg(test)]
mod tests {
    use screenpipe_audio::{list_audio_devices, parse_device_spec, stt, AudioInput, WhisperModel};

    use super::*;

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

    // TODO move to tests folder
    #[test]
    #[ignore]
    fn test_speech_to_text() {
        println!("Starting speech to text test");

        println!("Loading audio file");
        let start = std::time::Instant::now();
        let whisper_model = WhisperModel::new().unwrap();

        let text = stt("./test_data/poetic_kapil_gupta.wav", &whisper_model).unwrap();
        let duration = start.elapsed();

        println!("Speech to text completed in {:?}", duration);
        println!("Transcribed text: {:?}", text);

        assert!(text.contains("The fire"));
    }

    // Add more tests for other functions
}
