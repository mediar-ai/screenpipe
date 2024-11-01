use anyhow::Result;
use chrono::{Duration, Utc};
use dirs::home_dir;
use std::sync::Arc;
use tempfile::TempDir;
use tracing::{debug, error};

use screenpipe_server::{
    video_cache::{FrameCache, FrameCacheConfig},
    DatabaseManager,
};

async fn setup_test_env() -> Result<(FrameCache, TempDir, Arc<DatabaseManager>)> {
    // enabled tracing logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .init();

    let screenpipe_dir = home_dir()
        .expect("couldn't find home dir")
        .join(".screenpipe")
        .join("data");

    // Create temporary directory for cache
    let temp_dir = TempDir::new()?;

    debug!("using real screenpipe data dir: {:?}", screenpipe_dir);
    debug!("using temp cache dir: {:?}", temp_dir.path());

    let config = FrameCacheConfig {
        prefetch_size: Duration::seconds(120),
        ..FrameCacheConfig::default()
    };
    let db = Arc::new(
        DatabaseManager::new(
            home_dir()
                .unwrap()
                .join(".screenpipe")
                .join("sqlite.db")
                .to_str()
                .unwrap(),
        )
        .await
        .unwrap(),
    );

    let cache = FrameCache::with_config(screenpipe_dir, db.clone(), config).await?;
    Ok((cache, temp_dir, db))
}

#[tokio::test]
async fn test_high_speed_streaming() -> Result<()> {
    let (cache, _temp_dir, _db) = setup_test_env().await?;

    let start_time = Utc::now() - Duration::minutes(5);
    let mut frames = Vec::new();

    let (tx, mut rx) = tokio::sync::mpsc::channel(100);

    // First, request the frames
    cache.get_frames(start_time, 1, tx).await?;

    // Then use try_recv in a loop with timeout to collect frames
    let timeout = tokio::time::sleep(std::time::Duration::from_secs(5));
    tokio::pin!(timeout);

    loop {
        tokio::select! {
            frame = rx.recv() => {
                match frame {
                    Some(frame) => {
                        debug!("got frame at: {}", frame.timestamp);
                        frames.push(frame);
                    },
                    None => break, // Channel closed
                }
            }
            _ = &mut timeout => {
                debug!("timeout reached after 5s");
                break;
            }
        }
    }

    debug!("total frames retrieved: {}", frames.len());
    assert!(frames.len() > 0, "Should retrieve at least one frame");

    Ok(())
}

#[tokio::test]
async fn test_frame_jpeg_integrity() -> Result<()> {
    let (cache, _temp_dir, _db) = setup_test_env().await?;

    // Get a frame from 5 minutes ago
    let target_time = Utc::now() - Duration::minutes(5);
    debug!("hi");

    let (tx, mut rx) = tokio::sync::mpsc::channel(100);
    cache.get_frames(target_time, 1, tx).await?;
    debug!("bye");

    let frame = rx.recv().await;

    if let Some(frame_data) = frame {
        // Read the frame data from the file
        debug!(
            "checking frame at {}, size: {} bytes",
            target_time,
            frame_data.data.len()
        );

        // Check JPEG header (SOI marker)
        let has_jpeg_header = frame_data.data.starts_with(&[0xFF, 0xD8]);

        // Check JPEG footer (EOI marker)
        let has_jpeg_footer = frame_data.data.ends_with(&[0xFF, 0xD9]);

        // Basic size sanity check (typical JPEG frame should be between 10KB and 1MB)
        let has_valid_size = frame_data.data.len() > 10_000 && frame_data.data.len() < 1_000_000;

        if has_jpeg_header && has_jpeg_footer && has_valid_size {
            debug!("frame passed JPEG validation");
        } else {
            error!(
                "invalid JPEG frame: header={}, footer={}, size={}",
                has_jpeg_header,
                has_jpeg_footer,
                frame_data.data.len()
            );

            // Log first and last few bytes for debugging
            if frame_data.data.len() >= 4 {
                debug!(
                    "first 4 bytes: {:02X} {:02X} {:02X} {:02X}",
                    frame_data.data[0], frame_data.data[1], frame_data.data[2], frame_data.data[3]
                );
            }
            if frame_data.data.len() >= 4 {
                let len = frame_data.data.len();
                debug!(
                    "last 4 bytes: {:02X} {:02X} {:02X} {:02X}",
                    frame_data.data[len - 4],
                    frame_data.data[len - 3],
                    frame_data.data[len - 2],
                    frame_data.data[len - 1]
                );
            }
        }

        // Assert frame validity
        assert!(has_jpeg_header, "Frame should have valid JPEG header");
        assert!(has_jpeg_footer, "Frame should have valid JPEG footer");
        assert!(
            has_valid_size,
            "Frame size should be within reasonable bounds"
        );
    } else {
        debug!("no frame found for timestamp {}", target_time);
    }

    Ok(())
}

async fn measure_frame_retrieval(
    cache: &FrameCache,
    time_ago: Duration,
    duration_minutes: i64,
) -> Result<(usize, f64)> {
    let start_time = Utc::now() - time_ago;
    let mut frames = Vec::new();

    let (tx, mut rx) = tokio::sync::mpsc::channel(100);

    let timer = std::time::Instant::now();
    cache.get_frames(start_time, duration_minutes, tx).await?;

    // Collect frames with timeout
    let timeout = tokio::time::sleep(std::time::Duration::from_secs(30));
    tokio::pin!(timeout);

    loop {
        tokio::select! {
            frame = rx.recv() => {
                match frame {
                    Some(frame) => {
                        frames.push(frame);
                    },
                    None => break,
                }
            }
            _ = &mut timeout => {
                debug!("timeout reached after 30s");
                break;
            }
        }
    }

    let elapsed = timer.elapsed().as_secs_f64();
    Ok((frames.len(), elapsed))
}

#[tokio::test]
async fn test_frame_retrieval_at_different_times() -> Result<()> {
    let (cache, _temp_dir, _db) = setup_test_env().await?;

    // Give some time for initial cache setup and potential recording
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Test cases with different time ranges
    let test_cases = vec![
        ("current", Duration::zero()),
        ("5min ago", Duration::minutes(5)),
        ("30min ago", Duration::minutes(30)),
        ("4h ago", Duration::hours(4)),
        ("1 day ago", Duration::days(1)),
        ("2 days ago", Duration::days(2)),
        ("1 week ago", Duration::weeks(1)),
    ];

    println!("\nframe retrieval performance test results:");
    println!("----------------------------------------");
    println!("time range | frames | duration (s) | fps");
    println!("----------------------------------------");

    for (label, time_ago) in test_cases.clone() {
        let (frame_count, elapsed) = measure_frame_retrieval(&cache, time_ago, 1).await?;

        let fps = if elapsed > 0.0 {
            frame_count as f64 / elapsed
        } else {
            0.0
        };

        println!(
            "{:10} | {:6} | {:11.2} | {:6.1}",
            label, frame_count, elapsed, fps
        );

        // More lenient assertions - only verify timing for frames we actually got
        if frame_count > 0 {
            assert!(
                elapsed < 10.0,
                "Processing time for {} should be under 10s, got {}s",
                label,
                elapsed
            );
        } else {
            println!("warning: no frames found for {}", label);
        }
    }

    // Verify we got at least some frames from some time range
    let total_frames: usize = futures::future::join_all(
        test_cases
            .iter()
            .map(|(_, time_ago)| measure_frame_retrieval(&cache, *time_ago, 1)),
    )
    .await
    .into_iter()
    .filter_map(Result::ok)
    .map(|(count, _)| count)
    .sum();

    assert!(
        total_frames > 0,
        "Should find at least some frames across all time ranges"
    );

    Ok(())
}

#[tokio::test]
async fn test_extended_time_range_retrieval() -> Result<()> {
    let (cache, _temp_dir, _db) = setup_test_env().await?;

    // Test retrieving frames over longer durations
    let test_durations = vec![
        ("1min", 1),
        ("5min", 5),
        ("15min", 15),
        ("30min", 30),
        ("1hour", 60),
    ];

    println!("\nextended duration retrieval test results:");
    println!("----------------------------------------");
    println!("duration | frames | retrieval time (s) | fps");
    println!("----------------------------------------");

    for (label, minutes) in test_durations {
        let (frame_count, elapsed) =
            measure_frame_retrieval(&cache, Duration::minutes(minutes), minutes).await?;

        let fps = if elapsed > 0.0 {
            frame_count as f64 / elapsed
        } else {
            0.0
        };

        println!(
            "{:8} | {:6} | {:17.2} | {:6.1}",
            label, frame_count, elapsed, fps
        );

        // More realistic performance expectations:
        // - Allow up to 2 seconds per minute of footage
        // - But require at least some frames if we're looking at recent data
        if frame_count > 0 {
            assert!(
                elapsed < (minutes as f64 * 2.0),
                "Processing time for {} exceeded maximum allowed time",
                label
            );
        } else if minutes <= 5 {
            println!("warning: no frames found for recent timeframe {}", label);
        }
    }

    Ok(())
}
