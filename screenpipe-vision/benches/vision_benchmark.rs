// cargo bench --bench vision_benchmark -- benchmark_continuous_capture
// or
// cargo bench --bench vision_benchmark
// ! not very useful bench

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use screenpipe_vision::monitor::get_default_monitor;
use screenpipe_vision::{continuous_capture, OcrEngine};
use tokio::sync::mpsc;
use tokio::time::Duration;

async fn benchmark_continuous_capture(duration_secs: u64) -> f64 {
    let (result_tx, mut result_rx) = mpsc::channel(100);

    let capture_handle = tokio::spawn(async move {
        continuous_capture(
            result_tx,
            Duration::from_millis(100),
            false,
            OcrEngine::Tesseract,
            get_default_monitor().await.id(),
            &[],
            &[],
            vec![],
        )
        .await;
    });

    // Run for specified duration
    tokio::time::sleep(Duration::from_secs(duration_secs)).await;

    // Wait for the capture to finish
    capture_handle.await.unwrap();

    // Count received frames
    let mut frame_count = 0;
    while result_rx.try_recv().is_ok() {
        frame_count += 1;
    }

    frame_count as f64 / duration_secs as f64
}

fn criterion_benchmark(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let mut group = c.benchmark_group("continuous_capture");
    group.sample_size(10); // Reduce sample size
    group.measurement_time(Duration::from_secs(10)); // Reduce measurement time

    for duration in [1, 2, 5].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(duration),
            duration,
            |b, &duration| {
                b.to_async(&rt)
                    .iter(|| benchmark_continuous_capture(duration))
            },
        );
    }
    group.finish();
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
