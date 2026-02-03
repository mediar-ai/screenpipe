use criterion::{black_box, criterion_group, criterion_main, Criterion};
use futures::StreamExt;
use screenpipe_events::{send_event, subscribe_to_event};
use tokio::runtime::Runtime;

fn benchmark_event_system(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let mut group = c.benchmark_group("events");

    // Test with different numbers of subscribers
    for num_subscribers in [1, 10, 50, 100] {
        group.bench_function(
            format!("broadcast_to_{}_subscribers", num_subscribers),
            |b| {
                b.to_async(&rt).iter_with_setup(
                    || {
                        // Setup phase - not timed
                        let mut receivers = Vec::new();
                        for _ in 0..num_subscribers {
                            receivers.push(subscribe_to_event::<String>("test_event"));
                        }
                        receivers
                    },
                    |mut receivers| async move {
                        // Benchmark phase - timed
                        let _ = send_event("test_event", String::from("test data"));
                        for rx in &mut receivers {
                            black_box(rx.next().await.unwrap());
                        }
                    },
                );
            },
        );
    }

    // Throughput benchmark
    group.bench_function("event_throughput", |b| {
        b.to_async(&rt).iter(|| async {
            const NUM_EVENTS: usize = 10_000;

            let mut rx = subscribe_to_event::<u64>("counter_event");

            // Send many events in sequence
            for i in 0..NUM_EVENTS {
                let _ = send_event("counter_event", i as u64);
            }

            // Receive all events
            for _ in 0..NUM_EVENTS {
                black_box(rx.next().await.unwrap());
            }
        });
    });

    group.finish();
}

criterion_group!(benches, benchmark_event_system);
criterion_main!(benches);
