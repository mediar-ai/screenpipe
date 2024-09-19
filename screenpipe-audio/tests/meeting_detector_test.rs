#[cfg(test)]
mod tests {
    use env_logger;
    use screenpipe_audio::{
        meeting_detector::{MeetingDetector, MeetingEvent, MeetingEventType},
        vad_engine::{VadEngine, VadSensitivity},
    };
    use std::sync::{Arc, Mutex}; // Add this import to initialize the logger

    pub struct MockVadEngine {
        is_voice: bool,
        sensitivity: VadSensitivity,
    }

    impl MockVadEngine {
        pub fn new() -> Self {
            Self {
                is_voice: false,
                sensitivity: VadSensitivity::Medium,
            }
        }
    }

    impl VadEngine for MockVadEngine {
        fn is_voice_segment(&mut self, audio_chunk: &[f32]) -> anyhow::Result<bool> {
            // Use the audio_chunk to determine if it's voice
            // For simplicity, we'll use the average energy of the chunk
            let energy: f32 =
                audio_chunk.iter().map(|&x| x * x).sum::<f32>() / audio_chunk.len() as f32;
            self.is_voice = energy > 0.1; // Arbitrary threshold
            Ok(self.is_voice)
        }

        fn set_sensitivity(&mut self, sensitivity: VadSensitivity) {
            self.sensitivity = sensitivity;
        }

        fn get_min_speech_ratio(&self) -> f32 {
            self.sensitivity.min_speech_ratio()
        }
    }

    fn create_mock_vad() -> Arc<Mutex<Box<dyn VadEngine + Send>>> {
        Arc::new(Mutex::new(Box::new(MockVadEngine::new())))
    }

    fn create_audio_frame(energy: f32, samples: usize) -> Vec<f32> {
        vec![energy.sqrt(); samples]
    }

    #[tokio::test]
    async fn test_meeting_detector() -> anyhow::Result<()> {
        env_logger::init(); // Add this line to initialize the logger

        let vad = create_mock_vad();
        let mut detector = MeetingDetector::new(vad.clone()).await?;

        // simulate silence
        for _ in 0..100 {
            let frame = create_audio_frame(0.005, 1000);
            assert!(detector.process_audio(&frame)?.is_none());
        }

        // simulate meeting start
        let mut start_detected = false;
        for i in 0..100 {
            let frame = create_audio_frame(0.2, 1000);
            let event = detector.process_audio(&frame)?;
            if let Some(MeetingEvent {
                event_type: MeetingEventType::Start,
                ..
            }) = event
            {
                println!("Meeting start detected at iteration {}", i);
                start_detected = true;
                break;
            }
        }
        assert!(start_detected, "Meeting start event not detected");
        assert!(detector.current_meeting_id.is_some());

        // simulate some ongoing meeting activity
        for _ in 0..50 {
            let frame = create_audio_frame(0.15, 1000);
            assert!(detector.process_audio(&frame)?.is_none());
        }

        // simulate meeting end (prolonged silence)
        let mut end_detected = false;
        for i in 0..3600 {
            // Increased to 3600 iterations (1 hour at 1 frame per second)
            let frame = create_audio_frame(0.005, 1000);
            let event = detector.process_audio(&frame)?;
            if let Some(MeetingEvent {
                event_type: MeetingEventType::End,
                ..
            }) = event
            {
                println!("Meeting end detected at iteration {}", i);
                end_detected = true;
                break;
            }
            if i % 600 == 0 {
                println!("Iteration {}: Still waiting for end event", i);
            }
        }

        if !end_detected {
            panic!("Meeting end event not detected after prolonged silence");
        }

        assert!(end_detected, "Meeting end event not detected");
        assert!(detector.current_meeting_id.is_none());

        Ok(())
    }
}
