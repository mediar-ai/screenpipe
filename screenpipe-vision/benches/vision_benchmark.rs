// cargo bench --bench vision_benchmark -- benchmark_continuous_capture
// or
// cargo bench --bench vision_benchmark
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use screenpipe_vision::{continuous_capture, ControlMessage};
use tokio::sync::mpsc;
use tokio::time::{Duration, Instant};

fn benchmark_continuous_capture(c: &mut Criterion) {
    let mut group = c.benchmark_group("continuous_capture");

    for &threads in &[1, 2, 4, 8] {
        for &interval_ms in &[50, 100, 200] {
            group.bench_with_input(
                BenchmarkId::new("threads_interval", format!("{}_{}", threads, interval_ms)),
                &(threads, interval_ms),
                |b, &(threads, interval_ms)| {
                    b.iter(|| {
                        let rt = tokio::runtime::Builder::new_multi_thread()
                            .worker_threads(threads)
                            .build()
                            .unwrap();

                        rt.block_on(async {
                            let (control_tx, mut control_rx) = mpsc::channel(10);
                            let (result_tx, mut result_rx) = mpsc::channel(100);
                            let interval = Duration::from_millis(interval_ms);

                            let capture_handle = tokio::spawn(async move {
                                continuous_capture(&mut control_rx, result_tx, interval).await;
                            });

                            let start = Instant::now();
                            let duration = Duration::from_secs(5);
                            let mut frame_count = 0;

                            while start.elapsed() < duration {
                                if result_rx.try_recv().is_ok() {
                                    frame_count += 1;
                                }
                                tokio::time::sleep(Duration::from_millis(1)).await;
                            }

                            control_tx.send(ControlMessage::Stop).await.unwrap();
                            capture_handle.await.unwrap();

                            println!(
                                "Threads: {}, Interval: {}ms, Frames: {}, FPS: {:.2}",
                                threads,
                                interval_ms,
                                frame_count,
                                frame_count as f64 / duration.as_secs_f64()
                            );
                        });
                    })
                },
            );
        }
    }

    group.finish();
}

criterion_group!(benches, benchmark_continuous_capture);
criterion_main!(benches);
