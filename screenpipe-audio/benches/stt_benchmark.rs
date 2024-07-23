// cargo bench --bench stt_benchmark

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use screenpipe_audio::stt::{stt, WhisperModel};
use std::path::PathBuf;

fn benchmark_stt(c: &mut Criterion) {
    let test_file_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("test_data")
        .join("selah.mp4");

    // Initialize WhisperModel outside the benchmark loop
    let whisper_model = WhisperModel::new().expect("Failed to initialize WhisperModel");

    c.bench_function("stt", |b| {
        b.iter(|| {
            let _ = stt(black_box(&test_file_path.to_str().unwrap()), &whisper_model);
        })
    });
}

criterion_group!(benches, benchmark_stt);
criterion_main!(benches);
