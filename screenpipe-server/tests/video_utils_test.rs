use anyhow::Result;
use dirs::{self, home_dir};
use screenpipe_core::Language;
use screenpipe_server::video_utils::extract_frames_from_video;
use screenpipe_vision::{capture_screenshot_by_window::CapturedWindow, perform_ocr_apple};
use std::path::PathBuf;
use tokio::fs;
use tracing::info;

async fn setup_test_env() -> Result<()> {
    // enable tracing logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .init();
    Ok(())
}

async fn create_test_video() -> Result<PathBuf> {
    let screenpipe_dir = dirs::home_dir()
        .expect("couldn't find home dir")
        .join(".screenpipe")
        .join("data");

    info!("looking for monitor video in {}", screenpipe_dir.display());

    // Read directory and find first video containing "monitor"
    let mut entries = tokio::fs::read_dir(&screenpipe_dir).await?;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
            if filename.contains("monitor") {
                info!("found monitor video: {}", path.display());
                return Ok(path);
            }
        }
    }

    Err(anyhow::anyhow!(
        "no monitor video found in screenpipe data dir"
    ))
}

#[tokio::test]
async fn test_extract_frames() -> Result<()> {
    setup_test_env().await?;
    let video_path = create_test_video().await?;

    println!("testing frame extraction from {}", video_path.display());

    // Test both write_to_disk modes
    for write_to_disk in [true, false] {
        println!("testing with write_to_disk = {}", write_to_disk);

        let output_path = if write_to_disk {
            Some(PathBuf::from(home_dir().unwrap()).join("Downloads"))
        } else {
            None
        };

        let frames = extract_frames_from_video(&video_path, output_path).await?;
        println!("extracted {} frames", frames.len());

        // Verify we got some frames
        assert!(!frames.is_empty(), "should extract at least one frame");

        // Check frame dimensions
        let first_frame = &frames[0];
        println!(
            "frame dimensions: {}x{}",
            first_frame.width(),
            first_frame.height()
        );

        // If write_to_disk is true, verify files exist
        if write_to_disk {
            if let Some(parent) = video_path.parent() {
                let mut entries = fs::read_dir(parent).await?;
                let mut jpg_count = 0;
                while let Some(entry) = entries.next_entry().await? {
                    if entry
                        .path()
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| ext == "jpg")
                        .unwrap_or(false)
                    {
                        jpg_count += 1;
                    }
                }

                println!("found {} jpg files in temp dir", jpg_count);
                assert!(
                    jpg_count > 0,
                    "should find jpg files when write_to_disk is true"
                );
            }
        }
    }

    Ok(())
}

#[tokio::test]
async fn test_extract_frames_and_ocr() -> Result<()> {
    setup_test_env().await?;
    let video_path = create_test_video().await?;

    println!(
        "testing frame extraction and ocr from {}",
        video_path.display()
    );

    // extract frames
    let frames = extract_frames_from_video(
        &video_path,
        Some(PathBuf::from(home_dir().unwrap()).join("Downloads")),
    )
    .await?;

    // verify we got frames
    assert!(!frames.is_empty(), "should extract at least one frame");

    // take first frame
    let first_frame = &frames[0];

    // create a mock captured window for ocr
    let captured_window = CapturedWindow {
        image: first_frame.clone(),
        window_name: "test_window".to_string(),
        app_name: "test_app".to_string(),
        is_focused: true,
    };

    // perform ocr using apple native (macos only)
    let (text, _, confidence) = perform_ocr_apple(&captured_window.image, &vec![Language::English]);

    println!("ocr confidence: {}", confidence.unwrap_or(0.0));
    println!("extracted text: {}", text);

    // basic validation
    assert!(!text.is_empty(), "ocr should extract some text");
    assert!(
        confidence.unwrap_or(0.0) > 0.0,
        "confidence should be greater than 0"
    );

    Ok(())
}

#[tokio::test]
async fn test_get_video_metadata() -> Result<()> {
    setup_test_env().await?;
    let video_path = create_test_video().await?;

    println!("testing metadata extraction from {}", video_path.display());

    let metadata =
        screenpipe_server::video_utils::get_video_metadata(video_path.to_str().unwrap()).await?;

    println!(
        "extracted metadata: creation_time={}, fps={}, duration={}s",
        metadata.creation_time, metadata.fps, metadata.duration
    );

    // basic validation
    assert!(metadata.fps > 0.0, "fps should be positive");
    assert!(metadata.duration > 0.0, "duration should be positive");
    assert!(
        metadata.creation_time <= chrono::Utc::now(),
        "creation time should not be in the future"
    );

    Ok(())
}
