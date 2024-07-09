#[cfg(test)]
mod tests {
    use screenpipe_audio::{list_audio_devices, parse_device_spec};

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

    // Add more tests for other functions
}
