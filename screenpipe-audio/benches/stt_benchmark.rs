use criterion::{black_box, criterion_group, criterion_main, Criterion};
use screenpipe_audio::{
    stt, AudioInput, AudioTranscriptionEngine, WhisperModel, vad_engine::SileroVad
};
use std::sync::Arc;
use std::time::Duration;
use std::path::PathBuf;
use std::fs::File;
use std::io::Read;

fn criterion_benchmark(c: &mut Criterion) {
    let audio_transcription_engine = Arc::new(AudioTranscriptionEngine::WhisperTiny);
    let whisper_model = WhisperModel::new(audio_transcription_engine.clone()).unwrap();
    let test_file_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("test_data")
        .join("selah.mp4");
    let mut audio_data = Vec::new();
    File::open(&test_file_path).unwrap().read_to_end(&mut audio_data).unwrap();

    let mut group = c.benchmark_group("whisper_benchmarks");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(60));

    group.bench_function("stt_mkl", |b| {
        b.iter(|| {
            let mut vad_engine = Box::new(SileroVad::new().unwrap());
            let audio_input = AudioInput {
                data: audio_data.clone().into_iter().map(|x| x as f32).collect(),
                sample_rate: 16000,
                channels: 1,
                device: "test".to_string(),
            };
            let _ = stt(
                black_box(&audio_input),
                black_box(&whisper_model),
                black_box(audio_transcription_engine.clone()),
                black_box(&mut *vad_engine),
                black_box(None),
                black_box(&PathBuf::from("test_output")),
            );
        })
    });

    group.finish();
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);