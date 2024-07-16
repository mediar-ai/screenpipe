// cargo bench --bench audio_benchmark

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use screenpipe_audio::{create_whisper_channel, stt, AudioInput, WhisperModel};
use std::time::{Duration, Instant};
use tokio::runtime::Runtime;

fn generate_large_audio_file(path: &str, duration_secs: u32) {
    use std::process::Command;

    Command::new("ffmpeg")
        .args(&[
            "-f",
            "lavfi",
            "-i",
            &format!("sine=frequency=1000:duration={}", duration_secs),
            "-acodec",
            "pcm_s16le",
            "-ar",
            "44100",
            path,
        ])
        .output()
        .expect("Failed to generate audio file");
}

fn benchmark_stt(c: &mut Criterion) {
    let whisper_model = WhisperModel::new().unwrap();
    let test_file = "test_audio.wav";
    generate_large_audio_file(test_file, 60); // 1-minute audio file

    c.bench_function("stt_1min_audio", |b| {
        b.iter(|| {
            let start = Instant::now();
            let result = stt(black_box(test_file), black_box(&whisper_model));
            let stt_duration = start.elapsed();
            println!("STT duration: {:?}", stt_duration);
            result.unwrap();
        })
    });

    std::fs::remove_file(test_file).unwrap();
}

fn benchmark_concurrent_stt(c: &mut Criterion) {
    let runtime = Runtime::new().unwrap();
    let test_files: Vec<String> = (0..10).map(|i| format!("test_audio_{}.wav", i)).collect();

    for file in &test_files {
        generate_large_audio_file(file, 30); // 30-second audio files
    }

    c.bench_function("concurrent_stt_10x30s", |b| {
        b.iter(|| {
            runtime.block_on(async {
                let (sender, mut receiver) = create_whisper_channel().await.unwrap();

                for file in &test_files {
                    let input = AudioInput {
                        path: file.clone(),
                        device: "test_device".to_string(),
                    };
                    sender.send(input).unwrap();
                }

                for _ in 0..test_files.len() {
                    receiver.recv().await.unwrap();
                }
            });
        })
    });

    for file in test_files {
        std::fs::remove_file(file).unwrap();
    }
}

fn benchmark_large_file(c: &mut Criterion) {
    let whisper_model = WhisperModel::new().unwrap();
    let large_file = "large_test_audio.wav";
    generate_large_audio_file(large_file, 10);

    c.bench_function("stt_10min_audio", |b| {
        b.iter(|| {
            stt(black_box(large_file), black_box(&whisper_model)).unwrap();
        })
    });

    std::fs::remove_file(large_file).unwrap();
}

criterion_group! {
    name = benches;
    config = Criterion::default()
        .sample_size(10)
        .measurement_time(Duration::from_secs(300)); // Increase to 5 minutes
    targets = benchmark_stt, benchmark_concurrent_stt, benchmark_large_file
}
criterion_main!(benches);

// Benchmarking stt_1min_audio: Warming up for 3.0000 s
// Warning: Unable to complete 10 samples in 60.0s. You may wish to increase target time to 143.6s.
// stt_1min_audio          time:   [12.127 s 13.636 s 15.211 s]

// Benchmarking concurrent_stt_10x30s: Warming up for 3.0000 s
// Warning: Unable to complete 10 samples in 60.0s. You may wish to increase target time to 1334.5s.
// concurrent_stt_10x30s   time:   [133.02 s 138.45 s 144.25 s]
// Found 2 outliers among 10 measurements (20.00%)
//   1 (10.00%) low mild
//   1 (10.00%) high mild

// Benchmarking stt_10min_audio: Warming up for 3.0000 s
// Warning: Unable to complete 10 samples in 60.0s. You may wish to increase target time to 168.5s.
// stt_10min_audio         time:   [19.699 s 21.192 s 23.431 s]
// Found 2 outliers among 10 measurements (20.00%)
//   1 (10.00%) low mild
//   1 (10.00%) high severe
