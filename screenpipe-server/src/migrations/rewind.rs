//! Rewind AI Migration
//!
//! Import screen recordings from Rewind AI into screenpipe.
//!
//! # Usage
//!
//! ```ignore
//! // CLI
//! screenpipe migrate rewind --scan
//! screenpipe migrate rewind --start
//! screenpipe migrate rewind --start --fresh
//!
//! // Programmatic
//! let migration = RewindMigration::new(db, screenpipe_dir).await?;
//! let scan = migration.scan().await?;
//! migration.start(|progress| println!("{:?}", progress)).await?;
//! ```

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use image::DynamicImage;
use screenpipe_core::find_ffmpeg_path;
use screenpipe_db::{DatabaseManager, OcrEngine};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::fs;
use tokio::process::Command;
use tokio::sync::watch;
use tracing::{debug, info, warn};

/// Default Rewind data path on macOS
pub const DEFAULT_REWIND_PATH: &str =
    "Library/Application Support/com.memoryvault.MemoryVault/chunks";

/// Real-time capture rate of Rewind (1 frame every 2 seconds)
const REWIND_CAPTURE_INTERVAL_SECS: f64 = 2.0;

/// Migration state
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MigrationState {
    Idle,
    Scanning,
    Importing,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Progress information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationProgress {
    pub state: MigrationState,
    pub total_videos: usize,
    pub videos_processed: usize,
    pub frames_imported: usize,
    pub frames_skipped: usize,
    pub current_video: Option<String>,
    pub percent_complete: f64,
    pub error_message: Option<String>,
}

impl Default for MigrationProgress {
    fn default() -> Self {
        Self {
            state: MigrationState::Idle,
            total_videos: 0,
            videos_processed: 0,
            frames_imported: 0,
            frames_skipped: 0,
            current_video: None,
            percent_complete: 0.0,
            error_message: None,
        }
    }
}

/// Scan result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewindScanResult {
    pub available: bool,
    pub total_video_files: usize,
    pub total_size_bytes: u64,
    pub total_size_formatted: String,
    pub estimated_frame_count: usize,
    pub already_imported_count: usize,
    pub rewind_path: String,
}

/// Checkpoint for resumability
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MigrationCheckpoint {
    session_id: String,
    started_at: DateTime<Utc>,
    last_updated_at: DateTime<Utc>,
    processed_video_paths: HashSet<String>,
    total_frames_imported: usize,
    total_frames_skipped: usize,
}

impl MigrationCheckpoint {
    fn new() -> Self {
        Self {
            session_id: uuid::Uuid::new_v4().to_string(),
            started_at: Utc::now(),
            last_updated_at: Utc::now(),
            processed_video_paths: HashSet::new(),
            total_frames_imported: 0,
            total_frames_skipped: 0,
        }
    }

    fn mark_video_processed(&mut self, path: &str) {
        self.processed_video_paths.insert(path.to_string());
        self.last_updated_at = Utc::now();
    }
}

/// Rewind AI Migration
pub struct RewindMigration {
    db: Arc<DatabaseManager>,
    rewind_path: PathBuf,
    checkpoint_path: PathBuf,
    cancel_flag: Arc<AtomicBool>,
    progress_tx: watch::Sender<MigrationProgress>,
    progress_rx: watch::Receiver<MigrationProgress>,
}

impl RewindMigration {
    /// Create a new RewindMigration instance
    pub async fn new(db: Arc<DatabaseManager>, screenpipe_dir: &Path) -> Result<Self> {
        let rewind_path = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not determine home directory"))?
            .join(DEFAULT_REWIND_PATH);

        let checkpoint_path = screenpipe_dir.join("rewind_migration_checkpoint.json");

        let (progress_tx, progress_rx) = watch::channel(MigrationProgress::default());

        Ok(Self {
            db,
            rewind_path,
            checkpoint_path,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            progress_tx,
            progress_rx,
        })
    }

    /// Check if Rewind data is available
    pub fn is_available(&self) -> bool {
        self.rewind_path.exists() && self.rewind_path.is_dir()
    }

    /// Get progress receiver for subscribing to updates
    pub fn progress_receiver(&self) -> watch::Receiver<MigrationProgress> {
        self.progress_rx.clone()
    }

    /// Scan Rewind data
    pub async fn scan(&self) -> Result<RewindScanResult> {
        if !self.is_available() {
            return Ok(RewindScanResult {
                available: false,
                total_video_files: 0,
                total_size_bytes: 0,
                total_size_formatted: "0 bytes".to_string(),
                estimated_frame_count: 0,
                already_imported_count: 0,
                rewind_path: self.rewind_path.to_string_lossy().to_string(),
            });
        }

        self.update_progress(|p| p.state = MigrationState::Scanning);

        let video_files = self.find_video_files().await?;

        let mut total_size_bytes: u64 = 0;
        let mut estimated_frames = 0;

        for file in &video_files {
            if let Ok(metadata) = fs::metadata(file).await {
                total_size_bytes += metadata.len();
                estimated_frames += 60; // ~60 frames per video
            }
        }

        let checkpoint = self.load_checkpoint().await?;
        let already_imported = checkpoint
            .map(|c| c.processed_video_paths.len())
            .unwrap_or(0);

        self.update_progress(|p| p.state = MigrationState::Idle);

        Ok(RewindScanResult {
            available: true,
            total_video_files: video_files.len(),
            total_size_bytes,
            total_size_formatted: format_bytes(total_size_bytes),
            estimated_frame_count: estimated_frames,
            already_imported_count: already_imported,
            rewind_path: self.rewind_path.to_string_lossy().to_string(),
        })
    }

    /// Start migration
    pub async fn start(&self, fresh_start: bool) -> Result<MigrationProgress> {
        self.cancel_flag.store(false, Ordering::SeqCst);

        if fresh_start {
            self.clear_checkpoint().await?;
        }

        let mut checkpoint = self
            .load_checkpoint()
            .await?
            .unwrap_or_else(MigrationCheckpoint::new);

        let video_files = self.find_video_files().await?;
        let total_videos = video_files.len();

        self.update_progress(|p| {
            p.state = MigrationState::Importing;
            p.total_videos = total_videos;
            p.videos_processed = checkpoint.processed_video_paths.len();
            p.frames_imported = checkpoint.total_frames_imported;
            p.frames_skipped = checkpoint.total_frames_skipped;
        });

        for (index, video_file) in video_files.iter().enumerate() {
            // Check cancellation
            if self.cancel_flag.load(Ordering::SeqCst) {
                self.update_progress(|p| p.state = MigrationState::Cancelled);
                return Ok(self.progress_rx.borrow().clone());
            }

            let video_path_str = video_file.to_string_lossy().to_string();

            // Skip processed
            if checkpoint.processed_video_paths.contains(&video_path_str) {
                continue;
            }

            self.update_progress(|p| {
                p.current_video = Some(
                    video_file
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                );
                p.percent_complete = (index as f64 / total_videos as f64) * 100.0;
            });

            match self.process_video(&video_file, &mut checkpoint).await {
                Ok((imported, skipped)) => {
                    checkpoint.total_frames_imported += imported;
                    checkpoint.total_frames_skipped += skipped;
                    checkpoint.mark_video_processed(&video_path_str);

                    self.update_progress(|p| {
                        p.videos_processed = index + 1;
                        p.frames_imported = checkpoint.total_frames_imported;
                        p.frames_skipped = checkpoint.total_frames_skipped;
                    });

                    debug!(
                        "Processed {}: {} imported, {} skipped",
                        video_file.display(),
                        imported,
                        skipped
                    );
                }
                Err(e) => {
                    warn!("Failed to process {}: {}", video_file.display(), e);
                }
            }

            // Save checkpoint periodically
            if index % 10 == 0 {
                self.save_checkpoint(&checkpoint).await?;
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }

        self.save_checkpoint(&checkpoint).await?;

        self.update_progress(|p| {
            p.state = MigrationState::Completed;
            p.percent_complete = 100.0;
            p.current_video = None;
        });

        info!(
            "Migration completed: {} frames imported, {} skipped",
            checkpoint.total_frames_imported, checkpoint.total_frames_skipped
        );

        Ok(self.progress_rx.borrow().clone())
    }

    /// Cancel migration
    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
    }

    /// Clear checkpoint for fresh start
    pub async fn clear_checkpoint(&self) -> Result<()> {
        if self.checkpoint_path.exists() {
            fs::remove_file(&self.checkpoint_path).await?;
        }
        Ok(())
    }

    /// Get current progress
    pub fn get_progress(&self) -> MigrationProgress {
        self.progress_rx.borrow().clone()
    }

    // Private methods

    fn update_progress<F>(&self, f: F)
    where
        F: FnOnce(&mut MigrationProgress),
    {
        let mut progress = self.progress_rx.borrow().clone();
        f(&mut progress);
        let _ = self.progress_tx.send(progress);
    }

    async fn find_video_files(&self) -> Result<Vec<PathBuf>> {
        let mut files = Vec::new();
        let mut stack = vec![self.rewind_path.clone()];

        while let Some(dir) = stack.pop() {
            let mut entries = fs::read_dir(&dir).await?;

            while let Some(entry) = entries.next_entry().await? {
                let path = entry.path();

                if path.is_dir() {
                    stack.push(path);
                } else if path.extension().map(|e| e == "mp4").unwrap_or(false) {
                    files.push(path);
                }
            }
        }

        files.sort();
        Ok(files)
    }

    async fn load_checkpoint(&self) -> Result<Option<MigrationCheckpoint>> {
        if !self.checkpoint_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&self.checkpoint_path).await?;
        let checkpoint: MigrationCheckpoint = serde_json::from_str(&content)?;
        Ok(Some(checkpoint))
    }

    async fn save_checkpoint(&self, checkpoint: &MigrationCheckpoint) -> Result<()> {
        let content = serde_json::to_string_pretty(checkpoint)?;
        fs::write(&self.checkpoint_path, content).await?;
        Ok(())
    }

    async fn process_video(
        &self,
        video_path: &Path,
        _checkpoint: &mut MigrationCheckpoint,
    ) -> Result<(usize, usize)> {
        let frames = self.extract_frames(video_path).await?;

        let mut imported = 0;
        let mut skipped = 0;

        let file_metadata = fs::metadata(video_path).await?;
        let creation_time: DateTime<Utc> = file_metadata
            .created()
            .map(|t| t.into())
            .unwrap_or_else(|_| Utc::now());

        let total_frames = frames.len();
        let real_time_duration = total_frames as f64 * REWIND_CAPTURE_INTERVAL_SECS;

        let device_name = "rewind_import";
        let _video_chunk_id = self
            .db
            .insert_video_chunk(&video_path.to_string_lossy(), device_name)
            .await?;

        let mut previous_hash: Option<u64> = None;

        for (i, frame) in frames.iter().enumerate() {
            let time_offset = if total_frames > 1 {
                (i as f64 / (total_frames - 1) as f64) * real_time_duration
            } else {
                0.0
            };
            let timestamp =
                creation_time + chrono::Duration::milliseconds((time_offset * 1000.0) as i64);

            // Dedup
            let hash = compute_image_hash(&frame);
            if Some(hash) == previous_hash {
                skipped += 1;
                continue;
            }
            previous_hash = Some(hash);

            // OCR
            let text = run_ocr(&frame).unwrap_or_default();
            if text.trim().is_empty() {
                skipped += 1;
                continue;
            }

            // Insert
            let frame_id = self
                .db
                .insert_frame(
                    device_name,
                    Some(timestamp),
                    None,
                    Some("Rewind Import"),
                    None,
                    false,
                    Some(i as i64),
                )
                .await?;

            if frame_id > 0 {
                self.db
                    .insert_ocr_text(frame_id, &text, "{}", Arc::new(OcrEngine::AppleNative))
                    .await?;
                imported += 1;
            }
        }

        Ok((imported, skipped))
    }

    async fn extract_frames(&self, video_path: &Path) -> Result<Vec<DynamicImage>> {
        let ffmpeg_path = find_ffmpeg_path().context("Failed to find ffmpeg")?;
        let temp_dir = tempfile::tempdir()?;
        let output_pattern = temp_dir.path().join("frame%d.jpg");

        let output = Command::new(&ffmpeg_path)
            .args([
                "-i",
                video_path.to_str().unwrap(),
                "-vf",
                "fps=1",
                "-c:v",
                "mjpeg",
                "-q:v",
                "2",
                "-vsync",
                "0",
                "-y",
                output_pattern.to_str().unwrap(),
            ])
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("ffmpeg failed: {}", stderr));
        }

        let mut frames = Vec::new();
        let mut entries = fs::read_dir(temp_dir.path()).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let data = fs::read(&path).await?;
            if let Ok(img) = image::load_from_memory(&data) {
                frames.push(img);
            }
        }

        Ok(frames)
    }
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} bytes", bytes)
    }
}

fn compute_image_hash(image: &DynamicImage) -> u64 {
    let small = image.resize_exact(8, 8, image::imageops::FilterType::Nearest);
    let gray = small.to_luma8();

    let sum: u32 = gray.pixels().map(|p| p.0[0] as u32).sum();
    let avg = sum / 64;

    let mut hash: u64 = 0;
    for (i, pixel) in gray.pixels().enumerate() {
        if pixel.0[0] as u32 >= avg {
            hash |= 1 << i;
        }
    }

    hash
}

fn run_ocr(image: &DynamicImage) -> Result<String> {
    #[cfg(target_os = "macos")]
    {
        use screenpipe_core::Language;
        use screenpipe_vision::perform_ocr_apple;

        let (text, _, _) = perform_ocr_apple(image, &[Language::English]);
        Ok(text)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = image;
        Ok(String::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(0), "0 bytes");
        assert_eq!(format_bytes(1023), "1023 bytes");
        assert_eq!(format_bytes(1024), "1.00 KB");
        assert_eq!(format_bytes(1024 * 1024), "1.00 MB");
        assert_eq!(format_bytes(1024 * 1024 * 1024), "1.00 GB");
    }

    #[test]
    fn test_migration_state_serialize() {
        let state = MigrationState::Importing;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"importing\"");
    }
}
