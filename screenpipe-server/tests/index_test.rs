use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::Result;
use dirs::home_dir;
use screenpipe_db::DatabaseManager;
use screenpipe_server::{cli::OutputFormat, handle_index_command};
use tempfile::tempdir;
use tokio::fs;
use tracing::debug;

async fn setup_test_env() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .init();
    Ok(())
}

async fn setup_test_db() -> Result<(tempfile::TempDir, Arc<DatabaseManager>)> {
    let temp_dir = tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db = Arc::new(DatabaseManager::new(&db_path.to_string_lossy()).await?);
    Ok((temp_dir, db))
}

async fn copy_test_video(temp_dir: &Path) -> Result<PathBuf> {
    // Find a small video file from .screenpipe
    let screenpipe_dir = home_dir()
        .expect("couldn't find home dir")
        .join(".screenpipe")
        .join("data");

    let mut entries = fs::read_dir(&screenpipe_dir).await?;
    let mut source_video = None;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext == "mp4"
                && fs::metadata(&path).await?.len() < 100_000_000
                && path.to_string_lossy().to_lowercase().contains("monitor")
            {
                source_video = Some(path);
                break;
            }
        }
    }

    let source_path =
        source_video.ok_or_else(|| anyhow::anyhow!("no suitable test video found"))?;
    let target_path = temp_dir.join("test_video.mp4");

    fs::copy(&source_path, &target_path).await?;
    println!("copied test video to {}", target_path.display());
    Ok(target_path)
}

#[tokio::test]
#[ignore]
async fn test_index_command_with_sql() -> Result<()> {
    setup_test_env().await?;

    let (temp_dir, db) = setup_test_db().await?;
    let video_path = copy_test_video(temp_dir.path()).await?;

    debug!("testing indexing with video at {}", video_path.display());

    // Run indexing
    handle_index_command(
        temp_dir.path().into(),
        video_path.to_str().unwrap().to_string(),
        None,
        db.clone(),
        OutputFormat::Text,
        Some(screenpipe_server::cli::CliOcrEngine::Custom),
        None,
        false,
        false,
    )
    .await?;

    // Check video_chunks table
    let video_chunks = db
        .execute_raw_sql("SELECT * FROM video_chunks WHERE file_path LIKE '%test_video.mp4'")
        .await?;
    debug!(
        "video chunks: {}",
        serde_json::to_string_pretty(&video_chunks)?
    );
    assert!(
        !video_chunks.as_array().unwrap().is_empty(),
        "should have video chunk entry"
    );

    // Check frames table
    let frames = db
        .execute_raw_sql(
            "SELECT COUNT(*) as frame_count FROM frames f 
         JOIN video_chunks vc ON f.video_chunk_id = vc.id 
         WHERE vc.file_path LIKE '%test_video.mp4'",
        )
        .await?;
    debug!("frames: {}", serde_json::to_string_pretty(&frames)?);
    assert!(
        frames.as_array().unwrap()[0]["frame_count"]
            .as_i64()
            .unwrap()
            > 0,
        "should have frames"
    );

    // Check OCR results
    let ocr_results = db
        .execute_raw_sql(
            "SELECT COUNT(*) as ocr_count FROM ocr_text ot 
         JOIN frames f ON ot.frame_id = f.id
         JOIN video_chunks vc ON f.video_chunk_id = vc.id 
         WHERE vc.file_path LIKE '%test_video.mp4'",
        )
        .await?;
    debug!(
        "ocr results: {}",
        serde_json::to_string_pretty(&ocr_results)?
    );
    assert!(
        ocr_results.as_array().unwrap()[0]["ocr_count"]
            .as_i64()
            .unwrap()
            > 0,
        "should have OCR results"
    );

    // Check timestamps are valid
    let timestamps = db
        .execute_raw_sql(
            "SELECT f.timestamp FROM frames f
         JOIN video_chunks vc ON f.video_chunk_id = vc.id 
         WHERE vc.file_path LIKE '%test_video.mp4'",
        )
        .await?;
    debug!("timestamps: {}", serde_json::to_string_pretty(&timestamps)?);
    assert!(
        !timestamps.as_array().unwrap().is_empty(),
        "should have timestamps"
    );

    // Check OCR text content
    let ocr_text = db
        .execute_raw_sql(
            "SELECT ot.text, ot.app_name, ot.window_name FROM ocr_text ot
         JOIN frames f ON ot.frame_id = f.id
         JOIN video_chunks vc ON f.video_chunk_id = vc.id 
         WHERE vc.file_path LIKE '%test_video.mp4'
         LIMIT 5",
        )
        .await?;
    debug!(
        "sample ocr text: {}",
        serde_json::to_string_pretty(&ocr_text)?
    );

    Ok(())
}
