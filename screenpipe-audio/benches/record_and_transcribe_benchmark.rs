use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use screenpipe_audio::vad_engine::VadSensitivity;
use screenpipe_audio::{
    create_whisper_channel, default_input_device, record_and_transcribe, AudioDevice, AudioInput,
    AudioStream, AudioTranscriptionEngine,
};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;

async fn setup_test() -> (
    Arc<AudioDevice>,
    PathBuf,
    crossbeam::channel::Sender<AudioInput>,
    Arc<AtomicBool>,
) {
    let audio_device = default_input_device().unwrap(); // TODO feed voice in automatically somehow
    let output_path = PathBuf::from("/tmp/test_audio.mp4");
    // let (whisper_sender, _) = mpsc::unbounded_channel();
    let (whisper_sender, _, _) = create_whisper_channel(
        Arc::new(AudioTranscriptionEngine::WhisperDistilLargeV3),
        screenpipe_audio::VadEngineEnum::Silero,
        None,
        &output_path,
        VadSensitivity::High,
        vec![],
    )
    .await
    .unwrap();
    let is_running = Arc::new(AtomicBool::new(true));

    (
        Arc::new(audio_device),
        output_path,
        whisper_sender,
        is_running,
    )
}

fn bench_record_and_transcribe(c: &mut Criterion) {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4) // Adjust based on your system
        .enable_all()
        .build()
        .unwrap();

    let mut group = c.benchmark_group("Record and Transcribe");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(90)); // Increased from 30 to 60 seconds

    group.bench_function(BenchmarkId::new("Performance", ""), |b| {
        b.to_async(&runtime).iter_custom(|iters| async move {
            let mut total_duration = Duration::new(0, 0);

            for _ in 0..iters {
                let (audio_device, _, whisper_sender, is_running) = setup_test().await;
                let duration = Duration::from_secs(5); // 5 seconds of recording

                let audio_stream = AudioStream::from_device(audio_device, is_running.clone())
                    .await
                    .unwrap();

                let start = std::time::Instant::now();
                let result = record_and_transcribe(
                    black_box(Arc::new(audio_stream)),
                    black_box(duration),
                    black_box(whisper_sender),
                    black_box(is_running),
                )
                .await;
                total_duration += start.elapsed();

                assert!(result.is_ok(), "Recording and transcription failed");
            }

            total_duration
        })
    });

    group.finish();
}

criterion_group!(benches, bench_record_and_transcribe);
criterion_main!(benches);
