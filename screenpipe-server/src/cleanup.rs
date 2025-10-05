use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use screenpipe_db::{CleanupStats, DatabaseManager};
use std::path::Path;
use std::sync::Arc;
use tokio::fs;
use tracing::{debug, error, info, warn};

#[derive(Debug, Clone)]
pub struct CleanupConfig {
    pub retention_days: u64,
    pub delete_files: bool,
    pub dry_run: bool,
}

#[derive(Debug, Clone)]
pub struct CleanupResult {
    pub stats: CleanupStats,
    pub video_files_deleted: u64,
    pub audio_files_deleted: u64,
    pub video_files_failed: u64,
    pub audio_files_failed: u64,
    pub bytes_freed: u64,
}

impl CleanupResult {
    pub fn is_empty(&self) -> bool {
        self.stats.video_chunks == 0
            && self.stats.audio_chunks == 0
            && self.stats.frames == 0
            && self.stats.audio_transcriptions == 0
    }

    pub fn total_records(&self) -> u64 {
        self.stats.video_chunks
            + self.stats.audio_chunks
            + self.stats.frames
            + self.stats.audio_transcriptions
    }

    pub fn total_files_deleted(&self) -> u64 {
        self.video_files_deleted + self.audio_files_deleted
    }

    pub fn total_files_failed(&self) -> u64 {
        self.video_files_failed + self.audio_files_failed
    }
}

/// Cleanup old data from the database and optionally delete associated files
pub async fn cleanup_old_data(
    db: Arc<DatabaseManager>,
    config: CleanupConfig,
) -> Result<CleanupResult> {
    if config.retention_days == 0 {
        info!("Cleanup skipped: retention period is 0 (keep all data)");
        return Ok(CleanupResult {
            stats: CleanupStats {
                video_chunks: 0,
                frames: 0,
                audio_chunks: 0,
                audio_transcriptions: 0,
            },
            video_files_deleted: 0,
            audio_files_deleted: 0,
            video_files_failed: 0,
            audio_files_failed: 0,
            bytes_freed: 0,
        });
    }

    let cutoff_time = Utc::now() - Duration::days(config.retention_days as i64);
    info!(
        "Starting cleanup for data older than {} (retention: {} days, dry_run: {}, delete_files: {})",
        cutoff_time.format("%Y-%m-%d %H:%M:%S"),
        config.retention_days,
        config.dry_run,
        config.delete_files
    );

    // Get statistics first
    let stats = db.get_cleanup_stats(cutoff_time).await?;
    debug!("Cleanup stats: {:?}", stats);

    if stats.video_chunks == 0 && stats.audio_chunks == 0 {
        info!("No data to clean up");
        return Ok(CleanupResult {
            stats,
            video_files_deleted: 0,
            audio_files_deleted: 0,
            video_files_failed: 0,
            audio_files_failed: 0,
            bytes_freed: 0,
        });
    }

    let mut result = CleanupResult {
        stats,
        video_files_deleted: 0,
        audio_files_deleted: 0,
        video_files_failed: 0,
        audio_files_failed: 0,
        bytes_freed: 0,
    };

    if config.dry_run {
        info!("Dry run mode: no actual deletion will occur");
        return Ok(result);
    }

    // Delete video files if requested
    if config.delete_files {
        info!("Deleting video files...");
        let video_chunks = db.get_video_chunks_before(cutoff_time).await?;
        for (_id, file_path) in video_chunks {
            match delete_file_with_stats(&file_path).await {
                Ok(bytes) => {
                    result.video_files_deleted += 1;
                    result.bytes_freed += bytes;
                }
                Err(e) => {
                    warn!("Failed to delete video file {}: {}", file_path, e);
                    result.video_files_failed += 1;
                }
            }
        }

        info!("Deleting audio files...");
        let audio_chunks = db.get_audio_chunks_before(cutoff_time).await?;
        for (_id, file_path) in audio_chunks {
            match delete_file_with_stats(&file_path).await {
                Ok(bytes) => {
                    result.audio_files_deleted += 1;
                    result.bytes_freed += bytes;
                }
                Err(e) => {
                    warn!("Failed to delete audio file {}: {}", file_path, e);
                    result.audio_files_failed += 1;
                }
            }
        }
    }

    // Delete from database
    info!("Deleting video chunks from database...");
    let video_deleted = db.delete_video_chunks_before(cutoff_time).await?;
    debug!("Deleted {} video chunk records", video_deleted);

    info!("Deleting audio chunks from database...");
    let audio_deleted = db.delete_audio_chunks_before(cutoff_time).await?;
    debug!("Deleted {} audio chunk records", audio_deleted);

    info!(
        "Cleanup completed: deleted {} records, {} files ({:.2} MB freed)",
        result.total_records(),
        result.total_files_deleted(),
        result.bytes_freed as f64 / 1024.0 / 1024.0
    );

    if result.total_files_failed() > 0 {
        warn!("{} files failed to delete", result.total_files_failed());
    }

    Ok(result)
}

/// Delete a file and return the number of bytes freed
async fn delete_file_with_stats(file_path: &str) -> Result<u64> {
    let path = Path::new(file_path);

    if !path.exists() {
        debug!("File does not exist (already deleted?): {}", file_path);
        return Ok(0);
    }

    let metadata = fs::metadata(path).await?;
    let bytes = metadata.len();

    fs::remove_file(path).await?;
    debug!("Deleted file: {} ({} bytes)", file_path, bytes);

    Ok(bytes)
}

/// Format cleanup result for display
pub fn format_cleanup_result(result: &CleanupResult, dry_run: bool) -> String {
    let mode = if dry_run { " (DRY RUN)" } else { "" };

    format!(
        r#"
Cleanup Summary{}
================

Database Records:
  Video chunks:           {}
  Frames:                 {}
  Audio chunks:           {}
  Audio transcriptions:   {}
  Total records:          {}

Files:
  Video files deleted:    {}
  Audio files deleted:    {}
  Failed deletions:       {}
  Total files:            {}

Storage:
  Bytes freed:            {:.2} MB
"#,
        mode,
        result.stats.video_chunks,
        result.stats.frames,
        result.stats.audio_chunks,
        result.stats.audio_transcriptions,
        result.total_records(),
        result.video_files_deleted,
        result.audio_files_deleted,
        result.total_files_failed(),
        result.total_files_deleted(),
        result.bytes_freed as f64 / 1024.0 / 1024.0
    )
}

/// Start background cleanup task
pub async fn start_background_cleanup(
    db: Arc<DatabaseManager>,
    retention_days: u64,
) -> Result<()> {
    if retention_days == 0 {
        info!("Background cleanup disabled: retention period is 0");
        return Ok(());
    }

    info!(
        "Starting background cleanup task (retention: {} days)",
        retention_days
    );

    let config = CleanupConfig {
        retention_days,
        delete_files: true,
        dry_run: false,
    };

    tokio::spawn(async move {
        // Run cleanup every 24 hours
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(24 * 60 * 60));

        loop {
            interval.tick().await;
            info!("Running scheduled cleanup...");

            match cleanup_old_data(db.clone(), config.clone()).await {
                Ok(result) => {
                    if result.is_empty() {
                        debug!("Scheduled cleanup found no data to delete");
                    } else {
                        info!(
                            "Scheduled cleanup completed: {} records, {} files, {:.2} MB freed",
                            result.total_records(),
                            result.total_files_deleted(),
                            result.bytes_freed as f64 / 1024.0 / 1024.0
                        );
                    }
                }
                Err(e) => {
                    error!("Scheduled cleanup failed: {}", e);
                }
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cleanup_result_empty() {
        let result = CleanupResult {
            stats: CleanupStats {
                video_chunks: 0,
                frames: 0,
                audio_chunks: 0,
                audio_transcriptions: 0,
            },
            video_files_deleted: 0,
            audio_files_deleted: 0,
            video_files_failed: 0,
            audio_files_failed: 0,
            bytes_freed: 0,
        };

        assert!(result.is_empty());
        assert_eq!(result.total_records(), 0);
        assert_eq!(result.total_files_deleted(), 0);
    }

    #[test]
    fn test_cleanup_result_not_empty() {
        let result = CleanupResult {
            stats: CleanupStats {
                video_chunks: 10,
                frames: 100,
                audio_chunks: 5,
                audio_transcriptions: 50,
            },
            video_files_deleted: 10,
            audio_files_deleted: 5,
            video_files_failed: 1,
            audio_files_failed: 0,
            bytes_freed: 1024 * 1024 * 100, // 100 MB
        };

        assert!(!result.is_empty());
        assert_eq!(result.total_records(), 165);
        assert_eq!(result.total_files_deleted(), 15);
        assert_eq!(result.total_files_failed(), 1);
    }

    #[test]
    fn test_format_cleanup_result() {
        let result = CleanupResult {
            stats: CleanupStats {
                video_chunks: 10,
                frames: 100,
                audio_chunks: 5,
                audio_transcriptions: 50,
            },
            video_files_deleted: 10,
            audio_files_deleted: 5,
            video_files_failed: 0,
            audio_files_failed: 0,
            bytes_freed: 1024 * 1024 * 100,
        };

        let output = format_cleanup_result(&result, false);
        assert!(output.contains("Video chunks:           10"));
        assert!(output.contains("Frames:                 100"));
        assert!(output.contains("100.00 MB"));
    }
}
