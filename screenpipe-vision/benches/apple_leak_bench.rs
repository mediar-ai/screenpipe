use criterion::{criterion_group, criterion_main, Criterion};
use image::GenericImageView;
use memory_stats::memory_stats;
use screenpipe_vision::perform_ocr_apple;
use std::path::PathBuf;

fn bytes_to_mb(bytes: usize) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

fn bytes_to_gb(bytes: usize) -> f64 {
    bytes as f64 / (1024.0 * 1024.0 * 1024.0)
}

fn apple_ocr_benchmark(c: &mut Criterion) {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("testing_OCR.png");

    let image = image::open(&path).expect("Failed to open image");
    println!("Image dimensions: {:?}", image.dimensions());

    let mut group = c.benchmark_group("apple_ocr");
    group.sample_size(100); // Increased sample size
    group.measurement_time(std::time::Duration::from_secs(60)); // Run for at least 60 seconds
    group.bench_function("perform_ocr_apple", |b| {
        b.iter_custom(|iters| {
            let start = std::time::Instant::now();
            let mut initial_memory = 0;
            let mut final_memory = 0;
            let mut max_memory = 0;

            for i in 0..iters {
                if i == 0 {
                    if let Some(usage) = memory_stats() {
                        initial_memory = usage.physical_mem;
                        max_memory = initial_memory;
                    }
                }

                let result = perform_ocr_apple(&image, vec![]);
                assert!(
                    result.contains("receiver_count"),
                    "OCR failed: {:?}",
                    result
                );

                if let Some(usage) = memory_stats() {
                    final_memory = usage.physical_mem;
                    max_memory = max_memory.max(final_memory);
                }

                if i % 10 == 0 {
                    println!(
                        "Iteration {}: Current memory usage: {:.2} MB ({:.3} GB)",
                        i,
                        bytes_to_mb(final_memory),
                        bytes_to_gb(final_memory)
                    );
                }
            }

            println!(
                "Initial memory usage: {:.2} MB ({:.3} GB)",
                bytes_to_mb(initial_memory),
                bytes_to_gb(initial_memory)
            );
            println!(
                "Final memory usage: {:.2} MB ({:.3} GB)",
                bytes_to_mb(final_memory),
                bytes_to_gb(final_memory)
            );
            println!(
                "Max memory usage: {:.2} MB ({:.3} GB)",
                bytes_to_mb(max_memory),
                bytes_to_gb(max_memory)
            );
            println!(
                "Total memory difference: {:.2} MB ({:.3} GB)",
                bytes_to_mb(final_memory - initial_memory),
                bytes_to_gb(final_memory - initial_memory)
            );
            println!(
                "Max memory difference: {:.2} MB ({:.3} GB)",
                bytes_to_mb(max_memory - initial_memory),
                bytes_to_gb(max_memory - initial_memory)
            );

            start.elapsed()
        });
    });
    group.finish();
}

criterion_group!(benches, apple_ocr_benchmark);
criterion_main!(benches);
