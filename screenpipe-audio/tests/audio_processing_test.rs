#[cfg(test)]
#[cfg(feature = "test-utils")]
pub mod tests {
    use anyhow::Result;
    use rodio::{Decoder, Source};
    use screenpipe_audio::{
        audio_processing::{audio_frames_to_speech_frames, normalize_v2},
        constants::Config,
        vad_engine::SileroVad,
    };
    use std::process::Command;
    use std::{fs::File, io::BufReader};
    use tempfile::tempdir;
    #[cfg(test)]
    #[tokio::test]
    async fn test_audio_frames_to_speech_frames() -> Result<()> {
        // Set test-specific config
        Config {
            speech_threshold_duration_ms: 300, // More lenient for testing
            silence_threshold_duration_ms: 700,
            ..Config::new("test".to_string())
        }
        .set_as_active();

        // Create test audio files with known speech content
        let temp_dir = tempdir()?;

        // Generate test audio files using ffmpeg
        let test_cases = vec![
            // Silent audio
            ("silence.wav", "anullsrc=channel_layout=mono", 2.0, false),
            // Pure tone (should not be detected as speech)
            ("tone.wav", "sine=frequency=440", 2.0, false),
            // Real TTS speech file
            ("post-agi-kapil.wav", "", 0.0, true), // duration and input are ignored for this file
        ];

        // Special handling for the TTS file
        let tts_path = temp_dir.path().join("post-agi-kapil.wav");
        std::fs::copy("test_data/post-agi-kapil.wav", &tts_path)?;

        // Modified test loop to handle both generated and copied files
        for (filename, input, duration, _expected_speech) in &test_cases {
            if *filename != "post-agi-kapil.wav" {
                let output_path = temp_dir.path().join(filename);

                let output = Command::new("ffmpeg")
                    .args([
                        "-f",
                        "lavfi",
                        "-i",
                        input,
                        "-t",
                        &duration.to_string(),
                        "-ar",
                        "16000",
                        "-ac",
                        "1",
                        "-acodec",
                        "pcm_f32le",
                        "-filter:a",
                        "bandpass=f=1000:width_type=h:w=500,volume=0.8,tremolo=f=4:d=0.7",
                        "-y",
                        output_path.to_str().unwrap(),
                    ])
                    .output()?;

                // Check if ffmpeg command was successful
                if !output.status.success() {
                    return Err(anyhow::anyhow!(
                        "Failed to create {}: {}",
                        filename,
                        String::from_utf8_lossy(&output.stderr)
                    ));
                }

                println!("created {}", output_path.to_str().unwrap());

                // Verify file exists and is not empty
                let metadata = std::fs::metadata(&output_path)?;
                if metadata.len() == 0 {
                    return Err(anyhow::anyhow!("Generated file {} is empty", filename));
                }
            }
        }

        // Initialize VAD engine
        let mut vad = Box::new(SileroVad::new().await?)
            as Box<dyn screenpipe_audio::vad_engine::VadEngine + Send>;

        for (filename, _, _, expected_speech) in test_cases {
            println!("testing {}", filename);
            let path = temp_dir.path().join(filename);
            let file = BufReader::new(
                File::open(&path)
                    .map_err(|e| anyhow::anyhow!("Failed to open {}: {}", path.display(), e))?,
            );
            let decoder = Decoder::new(file)?;
            let sample_rate = decoder.sample_rate();

            // Convert samples to f32
            let samples: Vec<f32> = decoder.convert_samples().collect();

            // Process audio frames
            let result = audio_frames_to_speech_frames(&samples, sample_rate, &mut vad)?;

            match (result.clone(), expected_speech) {
                (Some(_), true) => println!("✅ Correctly detected speech in {}", filename),
                (None, false) => println!("✅ Correctly detected no speech in {}", filename),
                (Some(_), false) => println!("❌ False positive: detected speech in {}", filename),
                (None, true) => println!("❌ False negative: missed speech in {}", filename),
            }
        }

        Ok(())
    }

    #[test]
    fn test_normalize_v2() {
        // Mock CONFIG values for testing
        let target_rms = 0.2;
        let target_peak = 1.0;

        let test_cases = vec![
            // Empty vector
            (vec![], vec![]),
            // Single value
            (vec![2.0], vec![1.0]),
            // Balanced positive/negative
            (vec![0.5, -0.5], vec![0.2, -0.2]),
            // Mixed values
            (vec![0.5, -0.5, 0.1], vec![0.2, -0.2, 0.04]),
            // Very small values
            (vec![0.0001, -0.0001], vec![0.2, -0.2]),
            // All zeros
            (vec![0.0, 0.0, 0.0], vec![0.0, 0.0, 0.0]),
            // Near-zero values (should return original)
            (vec![1e-10, -1e-10], vec![1e-10, -1e-10]),
            // Very large values
            (vec![1000.0, -1000.0], vec![0.2, -0.2]),
            // Asymmetric values
            (vec![1.0, -2.0, 0.5], vec![0.1, -0.2, 0.05]),
        ];

        for (input, _expected) in test_cases {
            let result = normalize_v2(&input);

            // Skip empty vector case
            if input.is_empty() {
                assert!(result.is_empty());
                continue;
            }

            // For non-empty vectors, check normalization properties
            if !input.iter().all(|&x| x == 0.0) {
                // Check RMS is close to target_rms
                let rms = (result.iter().map(|&x| x * x).sum::<f32>() / result.len() as f32).sqrt();
                assert!(
                    (rms - target_rms).abs() < 1e-6,
                    "RMS normalization failed for input: {:?}\nExpected RMS: {}\nGot RMS: {}",
                    input,
                    target_rms,
                    rms
                );

                // Check peak is not exceeding target_peak
                let peak = result
                    .iter()
                    .fold(0.0f32, |max, &sample| max.max(sample.abs()));
                assert!(
                    peak <= target_peak,
                    "Peak normalization failed for input: {:?}\nExpected peak <= {}\nGot peak: {}",
                    input,
                    target_peak,
                    peak
                );
            }
        }
    }
}
