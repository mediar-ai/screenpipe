mod tests {
    use log::LevelFilter;
    use screenpipe_audio::pyannote::segment::get_segments;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    fn setup() {
        // Initialize the logger with an info level filter
        env_logger::builder()
            .filter_level(log::LevelFilter::Debug)
            .filter_module("tokenizers", LevelFilter::Error)
            .try_init()
            .unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn test_audio_speaker_identification() {
        setup();

        let project_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

        let embedding_model_path = project_dir
            .join("models")
            .join("pyannote")
            .join("wespeaker_en_voxceleb_CAM++.onnx");

        let segmentation_model_path = project_dir
            .join("models")
            .join("pyannote")
            .join("segmentation-3.0.onnx");

        let embedding_extractor = Arc::new(Mutex::new(
            screenpipe_audio::pyannote::embedding::EmbeddingExtractor::new(
                embedding_model_path
                    .to_str()
                    .ok_or_else(|| anyhow::anyhow!("Invalid embedding model path"))
                    .unwrap(),
            )
            .unwrap()
        ));
        let embedding_manager =
            screenpipe_audio::pyannote::identify::EmbeddingManager::new(usize::MAX);

        let multiple_speakers_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test_data/speaker_identification/6_speakers.wav");

        let (mut multiple_speakers_data, multiple_speakers_sample_rate) =
            screenpipe_audio::pcm_decode(&multiple_speakers_path)
                .expect("Failed to decode audio file");

        // reesample if not 16000
        if multiple_speakers_sample_rate != 16000 {
            multiple_speakers_data = screenpipe_audio::resample(
                &multiple_speakers_data,
                multiple_speakers_sample_rate,
                16000,
            )
            .unwrap();
        }

        let obama_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test_data/speaker_identification/obama.wav");

        let (mut obama_data, obama_sample_rate) =
            screenpipe_audio::pcm_decode(&obama_path).expect("Failed to decode audio file");

        // reesample if not 16000
        if obama_sample_rate != 16000 {
            obama_data = screenpipe_audio::resample(&obama_data, obama_sample_rate, 16000).unwrap();
        }

        multiple_speakers_data.extend_from_slice(&obama_data);
        let multiple_speakers_segments = get_segments(
            &multiple_speakers_data,
            16000,
            &segmentation_model_path,
            embedding_extractor,
            embedding_manager.clone(),
        )
        .unwrap()
        .collect::<Vec<_>>();

        assert_eq!(multiple_speakers_segments.len(), 6);
        let obama_speaker_id: String = "2".to_string();
        let mut obama_count = 0;
        // print segment speaker ids
        for segment in multiple_speakers_segments {
            let speaker_id = segment.unwrap().speaker;
            if speaker_id == obama_speaker_id {
                obama_count += 1;
            }
        }
        assert_eq!(obama_count, 2);
    }
}
