use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;

/// Test that reproduces the "channel lagged" error from Sentry
/// Issue: SCREENPIPE-CLI-22 - "error receiving audio data: channel lagged by 214"
///
/// The broadcast channel with capacity 1000 returns RecvError::Lagged when
/// the receiver falls behind. Currently this causes the entire recording to fail.
#[tokio::test]
async fn test_broadcast_channel_lag_causes_error() {
    // Create a broadcast channel with small capacity to trigger lag quickly
    let (tx, mut rx) = broadcast::channel::<Vec<f32>>(10);

    // Simulate fast producer (audio input) - send more messages than buffer can hold
    for i in 0..20 {
        let chunk = vec![i as f32; 100];
        let _ = tx.send(chunk);
    }

    // Now try to receive - this should return Lagged error
    let result = rx.recv().await;

    match result {
        Err(broadcast::error::RecvError::Lagged(n)) => {
            println!("Received expected Lagged error: {} messages skipped", n);
            // This is the current behavior that causes the recording to restart
            assert!(n > 0, "Should have lagged by at least 1 message");
        }
        Ok(_) => {
            panic!("Expected Lagged error but got Ok");
        }
        Err(broadcast::error::RecvError::Closed) => {
            panic!("Expected Lagged error but channel was closed");
        }
    }
}

/// Test that demonstrates the fix: handle Lagged error gracefully
/// Instead of terminating, we should continue receiving after lag
#[tokio::test]
async fn test_broadcast_channel_lag_recovery() {
    let (tx, mut rx) = broadcast::channel::<Vec<f32>>(10);
    let received_count = Arc::new(AtomicU32::new(0));
    let lag_count = Arc::new(AtomicU32::new(0));

    // Send 25 messages (more than buffer size of 10)
    for i in 0..25 {
        let chunk = vec![i as f32; 100];
        let _ = tx.send(chunk);
    }

    // Try to receive with graceful lag handling
    loop {
        match rx.recv().await {
            Ok(chunk) => {
                received_count.fetch_add(1, Ordering::Relaxed);
                // Successfully received a chunk after potential lag
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                lag_count.fetch_add(1, Ordering::Relaxed);
                println!("Lagged by {} messages, continuing...", n);
                // Key fix: continue instead of returning error
                continue;
            }
            Err(broadcast::error::RecvError::Closed) => {
                break;
            }
        }

        // Stop after receiving some messages
        if received_count.load(Ordering::Relaxed) >= 5 {
            break;
        }
    }

    let received = received_count.load(Ordering::Relaxed);
    let lagged = lag_count.load(Ordering::Relaxed);

    println!(
        "Received {} messages, experienced {} lag events",
        received, lagged
    );

    // With graceful handling, we should have received some messages despite lag
    assert!(received > 0, "Should have received at least some messages");
    assert!(lagged > 0, "Should have experienced at least one lag event");
}

/// Test simulating real audio recording scenario with slow consumer
#[tokio::test]
async fn test_slow_consumer_causes_lag() {
    let (tx, mut rx) = broadcast::channel::<Vec<f32>>(100);
    let is_running = Arc::new(AtomicBool::new(true));
    let is_running_producer = is_running.clone();
    let lag_detected = Arc::new(AtomicBool::new(false));
    let lag_detected_clone = lag_detected.clone();

    // Producer: simulates fast audio input (~44100 samples/sec in chunks)
    let producer = tokio::spawn(async move {
        for i in 0..200 {
            if !is_running_producer.load(Ordering::Relaxed) {
                break;
            }
            let chunk = vec![0.0f32; 1024]; // ~23ms of audio at 44.1kHz
            let _ = tx.send(chunk);
            // Audio comes in faster than we process
            tokio::time::sleep(Duration::from_micros(100)).await;
        }
    });

    // Consumer: simulates slow transcription processing
    let consumer = tokio::spawn(async move {
        let mut received = 0;
        loop {
            match rx.recv().await {
                Ok(_chunk) => {
                    received += 1;
                    // Simulate slow processing (transcription takes time)
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    println!("Consumer lagged by {} chunks at message {}", n, received);
                    lag_detected_clone.store(true, Ordering::Relaxed);
                    // With fix: continue instead of failing
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    break;
                }
            }

            if received >= 10 {
                break;
            }
        }
        received
    });

    let _ = producer.await;
    is_running.store(false, Ordering::Relaxed);
    let received = consumer.await.unwrap();

    println!("Consumer received {} chunks", received);
    assert!(
        lag_detected.load(Ordering::Relaxed),
        "Slow consumer should have experienced lag"
    );
    assert!(received > 0, "Should have received some chunks despite lag");
}
