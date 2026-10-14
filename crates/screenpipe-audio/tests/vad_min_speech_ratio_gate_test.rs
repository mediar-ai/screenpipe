// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use screenpipe_audio::speaker::{embedding_manager::EmbeddingManager, prepare_segments};
use screenpipe_audio::vad::{reset_min_speech_ratio, set_min_speech_ratio, VadEngine};
use std::sync::{Arc, Mutex};
use vad_rs::VadStatus;

struct LoudIsSpeech;
impl VadEngine for LoudIsSpeech {
    fn is_voice_segment(&mut self, audio: &[f32]) -> anyhow::Result<bool> {
        Ok(matches!(self.audio_type(audio)?, VadStatus::Speech))
    }
    fn audio_type(&mut self, audio: &[f32]) -> anyhow::Result<VadStatus> {
        Ok(if audio.iter().any(|x| x.abs() > 0.1) {
            VadStatus::Speech
        } else {
            VadStatus::Silence
        })
    }
    fn set_speech_threshold(&mut self, _: Option<f32>) {}
}

/// Owns the process-global min speech ratio: keep it the only test in this binary.
#[tokio::test]
async fn ratio_of_one_blocks_even_a_fully_spoken_chunk() {
    let audio: Vec<f32> = (0..30 * 16000)
        .map(|i| if i % 2 == 0 { 0.5 } else { -0.5 })
        .collect();
    let vad: Arc<tokio::sync::Mutex<Box<dyn VadEngine + Send>>> =
        Arc::new(tokio::sync::Mutex::new(Box::new(LoudIsSpeech)));

    set_min_speech_ratio(1.0);
    let result = prepare_segments(
        &audio,
        vad,
        None,
        Arc::new(Mutex::new(EmbeddingManager::new(4))),
        None,
        "synthetic microphone",
        false,
        false,
    )
    .await;
    reset_min_speech_ratio();

    let (mut segments, accepted, ratio) = result.unwrap();
    assert!(
        !accepted,
        "audio_disabled must block all audio, ratio={ratio}"
    );
    assert!(segments.recv().await.is_none());
}
