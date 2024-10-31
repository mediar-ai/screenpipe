use anyhow::Result;
use chrono::{Duration, Utc};
use dirs::home_dir;
use std::{path::PathBuf, time::SystemTime};
use tempfile::env::temp_dir;
use tokio::{fs, process::Command};
use tracing::debug;

use screenpipe_server::video_cache::{FrameCache, FrameCacheConfig};

async fn setup_test_env() -> Result<FrameCache> {
    // enabled tracing logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .init();

    let screenpipe_dir = home_dir()
        .expect("couldn't find home dir")
        .join(".screenpipe")
        .join("data");

    println!("using real screenpipe data dir: {:?}", screenpipe_dir);
    let cache = FrameCache::new(screenpipe_dir).await?;
    Ok(cache)
}

#[tokio::test]
async fn test_frame_retrieval() -> Result<()> {
    // Use custom config with shorter timeouts for testing
    let config = FrameCacheConfig {
        prefetch_size: Duration::seconds(10),
        cleanup_interval: Duration::minutes(1),
        fps: 1.0,
    };
    
    let frame_cache = setup_test_env().await?;
    let cache = FrameCache::with_config(frame_cache.screenpipe_dir, config).await?;
    let target_time = Utc::now() - Duration::minutes(30);

    println!("triggering initial frame load for {}", target_time);

    // First trigger the prefetch
    cache.get_frame(target_time).await;

    // Wait for prefetch to complete (30 seconds should be enough)
    println!("waiting for prefetch to complete...");
    tokio::time::sleep(std::time::Duration::from_secs(30)).await;

    println!("attempting to retrieve frame for {}", target_time);

    // Now try to get the frame with timeout
    let frame = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        cache.get_frame(target_time),
    )
    .await
    .unwrap()
    .unwrap();

    println!(
        "successfully retrieved frame for timestamp {}: {:?}",
        target_time, frame
    );
    Ok(())
}

#[tokio::test]
async fn test_skip_recent_videos() -> Result<()> {
    let cache = setup_test_env().await?;

    // Try to get frame from very recent recording
    let target_time = Utc::now() - Duration::seconds(30);
    let frame = cache.get_frame(target_time).await;

    println!("attempted to get frame from recent video: {:?}", frame);
    assert!(
        frame.is_none(),
        "should not get frames from very recent videos"
    );
    Ok(())
}

#[tokio::test]
async fn test_prefetch_mechanism() -> Result<()> {
    // Use custom config with smaller prefetch size for testing
    let config = FrameCacheConfig {
        prefetch_size: Duration::seconds(10), // Smaller window for testing
        cleanup_interval: Duration::minutes(1),
        fps: 1.0,
    };

    let frame_cache = setup_test_env().await?;
    let cache = FrameCache::with_config(frame_cache.screenpipe_dir, config).await?;

    // Request frame from 1 hour ago to trigger prefetch
    let target_time = Utc::now() - Duration::hours(1);
    let frame = cache.get_frame(target_time).await;

    // Check if nearby frames were prefetched
    let nearby_time = target_time + Duration::seconds(10);
    let nearby_frame = cache.get_frame(nearby_time).await;

    println!("prefetch test - initial frame: {:?}", frame);
    println!("prefetch test - nearby frame: {:?}", nearby_frame);
    assert!(nearby_frame.is_some(), "nearby frame should be prefetched");
    Ok(())
}

#[tokio::test]
async fn test_high_speed_streaming() -> Result<()> {
    let cache = setup_test_env().await?;

    let start_time = Utc::now() - Duration::minutes(5);
    let mut frames = Vec::new();

    // Try to get 30 frames (3 seconds at 10fps)
    for i in 0..30 {
        let target_time = start_time + Duration::milliseconds(i * 100);
        if let Some(frame) = cache.get_frame(target_time).await {
            frames.push(frame);
        }

        if i % 10 == 0 {
            println!("retrieved {} frames", frames.len());
        }
    }

    println!("total frames retrieved: {}", frames.len());
    Ok(())
}

#[tokio::test]
async fn test_frame_extraction() -> Result<()> {
    // enabled tracing logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .init();

    let screenpipe_dir = home_dir()
        .expect("couldn't find home dir")
        .join(".screenpipe")
        .join("data");

    // List available files and pick one that's not too recent
    let mut entries = fs::read_dir(&screenpipe_dir).await?;
    let mut test_file = None;

    debug!("looking for suitable test video in {:?}", screenpipe_dir);

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext == "mp4" {
                let metadata = fs::metadata(&path).await?;
                let age = SystemTime::now()
                    .duration_since(metadata.modified()?)?
                    .as_secs();

                // Use a file that's between 5 minutes and 1 hour old
                if age > 300 && age < 3600 {
                    test_file = Some(path.clone());
                    debug!("found suitable test file: {:?} (age: {}s)", path, age);
                    break;
                }
            }
        }
    }

    let test_file = test_file.ok_or_else(|| anyhow::anyhow!("no suitable test file found"))?;

    let metadata = fs::metadata(&test_file).await?;
    let file_modified: std::time::SystemTime = metadata.modified()?.into();

    // Set start time to 30 seconds after file creation
    let start_time = chrono::DateTime::<Utc>::from(file_modified) + Duration::seconds(30);
    let end_time = start_time + Duration::seconds(10); // shorter duration for testing

    debug!(
        "attempting to extract frames from {} to {}",
        start_time, end_time
    );

    let frames =
        FrameCache::extract_frames_batch(test_file.to_str().unwrap(), start_time, end_time, 10.0)
            .await?;

    debug!("extracted {} frames", frames.len());
    assert!(!frames.is_empty(), "Should extract at least one frame");

    Ok(())
}
