#![cfg(test)]
pub mod test {
    use anyhow::Result;
    use rodio::Decoder;
    use rodio::Source;
    use screenpipe_audio::audio_processing::audio_frames_to_speech_frames;
    use screenpipe_audio::constants::get_config;
    use screenpipe_audio::stt;
    use screenpipe_audio::vad_engine::SileroVad;
    use screenpipe_audio::vad_engine::VadEngine;
    use screenpipe_audio::whisper::WhisperModel;
    use screenpipe_audio::{
        audio_processing::AudioInput, constants::Config, AudioDevice, AudioSegment,
        AudioTranscriptionEngine, DeviceType,
    };
    use screenpipe_core::Language;
    use std::fs::File;
    use std::io::BufReader;
    use std::sync::Mutex;
    use std::{collections::HashMap, sync::Arc};

    const EXPECTED_TRANSCRIPT: &str = "yo louis, here's the tldr of that mind-blowing meeting:
        - bob's cat walked across his keyboard 3 times. productivity increased by 200%.
        - sarah's virtual background glitched, revealing she was actually on a beach. no one noticed.
        - you successfully pretended to be engaged while scrolling twitter. achievement unlocked!
        - 7 people said \"you're on mute\" in perfect synchronization. new world record.
        - meeting could've been an email. shocking.
        key takeaway: we're all living in a simulation, and the devs are laughing.
        peace out, llama3.2:3b-instruct-q4_K_M";

    #[tokio::test]
    async fn test_overlap_handling() -> Result<()> {
        // Use very distinctive values that are different from defaults
        let config = Config {
            overlap_seconds: 1,                   // Much larger than default
            chunk_duration_ms: 3000.0,            // Much smaller than default
            pre_speech_buffer_duration_secs: 1.0, // Very small
            vad_buffer_duration_secs: 4.0,        // Very small
            speech_threshold_duration_ms: 700,    // Very small
            silence_threshold_duration_ms: 1500,   // Very small
            ..Config::new("test_config".to_string())
        };

        // Set and verify config
        config.set_as_active();

        let test_path = std::env::current_dir()?
            .join("test_data/accuracy1.wav")
            .canonicalize()?;

        println!("using test file: {:?}", test_path);

        // Create a single audio input for the entire file
        let file = BufReader::new(File::open(&test_path)?);
        let decoder = Decoder::new(file)?;
        let sample_rate = decoder.sample_rate();
        let mut samples: Vec<f32> = decoder.map(|x: i16| x as f32 / i16::MAX as f32).collect();

        // add 3 seconds of silence at the end
        samples.extend(vec![0.0; (sample_rate as f32 * 3.0) as usize]);
        // Process audio in chunks like in production
        let chunk_size =
            ((sample_rate as f32 * get_config().chunk_duration_ms / 1000.0) as usize).max(1);
        println!("chunk_size: {:?}", chunk_size);
        let mut segments = Vec::new();
        let vad_engine = Arc::new(Mutex::new(
            Box::new(SileroVad::new().await.unwrap()) as Box<dyn VadEngine + Send>
        ));

        // Initialize whisper
        let engine = Arc::new(AudioTranscriptionEngine::WhisperLargeV3Turbo);
        let mut whisper_model = WhisperModel::new(&engine)?;
        let overlap_buffers = Arc::new(Mutex::new(HashMap::new()));

        let mut full_transcription = String::new();
        // Process chunks
        for (i, chunk) in samples.chunks(chunk_size).enumerate() {
            println!("Processing chunk {}, size: {}", i, chunk.len());
            let mut vad = vad_engine.lock().unwrap();
            // Add debug info about the VAD decision
            let speech_frames = audio_frames_to_speech_frames(chunk, sample_rate, &mut *vad)?;
            println!("VAD result for chunk {}: {:?}", i, speech_frames.is_some());

            if let Some(speech_frames) = speech_frames {
                println!(
                    "Found speech in chunk {}, frames: {}",
                    i,
                    speech_frames.len()
                );

                let segment = AudioSegment {
                    frames: Arc::new(chunk.to_vec()),
                    speech_frames: Arc::new(speech_frames),
                };
                segments.push(segment);

                println!("segments: {:?}", segments.len());

                let audio_input = AudioInput {
                    data: Arc::new(segments.clone()),
                    sample_rate: sample_rate as u32,
                    channels: 1,
                    device: Arc::new(AudioDevice::new(
                        "test_device".to_string(),
                        DeviceType::Input,
                    )),
                    output_path: Arc::new(std::path::PathBuf::from("/tmp")),
                };

                // Process the entire file at once
                let transcription = stt(
                    &audio_input,
                    &mut whisper_model,
                    engine.clone(),
                    None,
                    vec![Language::English],
                    &mut overlap_buffers.lock().unwrap(),
                )
                .await?;

                println!("transcription: {:?}", transcription);
                full_transcription.push_str(&transcription);
            }
        }

        println!("\nFinal transcription:\n{}", full_transcription);
        println!("\nExpected transcription:\n{}", EXPECTED_TRANSCRIPT);

        // Compare with expected transcription
        let similarity = strsim::jaro_winkler(
            &full_transcription.to_lowercase(),
            &EXPECTED_TRANSCRIPT.to_lowercase(),
        );
        println!("\nTranscription similarity score: {}", similarity);

        assert!(
            similarity > 0.7,
            "Transcription similarity too low: {}",
            similarity
        );

        Ok(())
    }
}
