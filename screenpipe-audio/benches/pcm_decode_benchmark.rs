// cargo bench --bench pcm_decode_benchmark
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use screenpipe_audio::pcm_decode;
use std::path::PathBuf;

fn benchmark_pcm_decode(c: &mut Criterion) {
    // Assuming you have a sample audio file in your project for testing
    let test_file_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("test_data")
        .join("selah.mp4");

    c.bench_function("pcm_decode", |b| {
        b.iter(|| {
            let _ = pcm_decode(black_box(&test_file_path));
        })
    });
}

criterion_group!(benches, benchmark_pcm_decode);
criterion_main!(benches);
