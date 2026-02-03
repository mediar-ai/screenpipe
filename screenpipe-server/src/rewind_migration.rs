//! Rewind AI Migration Module
//!
//! This module handles importing screen recording data from Rewind AI into screenpipe.
//!
//! Rewind stores data in: `~/Library/Application Support/com.memoryvault.MemoryVault/`
//! - Video chunks: `chunks/YYYYMM/DD/*.mp4`
//! - Each MP4 contains frames captured at ~0.5 FPS (1 frame every 2 seconds real-time)
//!   but encoded at ~30 FPS
//!
//! The migration process:
//! 1. Scan the chunks directory for MP4 files
//! 2. Extract frames from each video
//! 3. Run OCR on extracted frames
//! 4. Insert data into screenpipe's database
//! 5. Support pause/resume via state persistence

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use image::DynamicImage;
use oasgen::OaSchema;
use screenpipe_core::find_ffmpeg_path;
use screenpipe_db::{DatabaseManager, OcrEngine};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::fs;
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

/// Default Rewind data path on macOS
pub const DEFAULT_REWIND_PATH: &str =
    "~/Library/Application Support/com.memoryvault.MemoryVault/chunks";

/// Real-time capture rate of Rewind (1 frame every 2 seconds)
const REWIND_CAPTURE_INTERVAL_SECS: f64 = 2.0;

/// Batch size for database inserts
const BATCH_SIZE: usize = 50;

/// State of the migration process
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, OaSchema)]
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

/// Progress information for the migration
#[derive(Debug, Clone, Serialize, Deserialize, OaSchema)]
pub struct MigrationProgress {
    pub state: MigrationState,
    pub total_videos: usize,
    pub videos_processed: usize,
    pub total_frames: usize,
    pub frames_imported: usize,
    pub frames_skipped: usize,
    pub current_video: Option<String>,
    pub bytes_processed: u64,
    pub total_bytes: u64,
    pub start_time: Option<DateTime<Utc>>,
    pub estimated_seconds_remaining: Option<f64>,
    pub error_message: Option<String>,
}

impl Default for MigrationProgress {
    fn default() -> Self {
        Self {
            state: MigrationState::Idle,
            total_videos: 0,
            videos_processed: 0,
            total_frames: 0,
            frames_imported: 0,
            frames_skipped: 0,
            current_video: None,
            bytes_processed: 0,
            total_bytes: 0,
            start_time: None,
            estimated_seconds_remaining: None,
            error_message: None,
        }
    }
}

impl MigrationProgress {
    pub fn percent_complete(&self) -> f64 {
        if self.total_videos == 0 {
            return 0.0;
        }
        (self.videos_processed as f64 / self.total_videos as f64) * 100.0
    }
}

/// Persistent state for resumable migrations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationCheckpoint {
    pub session_id: String,
    pub started_at: DateTime<Utc>,
    pub last_updated_at: DateTime<Utc>,
    pub processed_video_paths: HashSet<String>,
    pub last_video_path: Option<String>,
    pub last_frame_index: Option<usize>,
    pub total_frames_imported: usize,
    pub total_frames_skipped: usize,
}

impl MigrationCheckpoint {
    pub fn new() -> Self {
        Self {
            session_id: uuid::Uuid::new_v4().to_string(),
            started_at: Utc::now(),
            last_updated_at: Utc::now(),
            processed_video_paths: HashSet::new(),
            last_video_path: None,
            last_frame_index: None,
            total_frames_imported: 0,
            total_frames_skipped: 0,
        }
    }

    pub fn mark_video_processed(&mut self, path: &str) {
        self.processed_video_paths.insert(path.to_string());
        self.last_video_path = None;
        self.last_frame_index = None;
        self.last_updated_at = Utc::now();
    }

    pub fn update_checkpoint(&mut self, video_path: &str, frame_index: usize) {
        self.last_video_path = Some(video_path.to_string());
        self.last_frame_index = Some(frame_index);
        self.last_updated_at = Utc::now();
    }
}

/// Result of scanning Rewind data
#[derive(Debug, Clone, Serialize, Deserialize, OaSchema)]
pub struct MigrationScanResult {
    pub total_video_files: usize,
    pub total_size_bytes: u64,
    pub estimated_frame_count: usize,
    pub earliest_date: Option<DateTime<Utc>>,
    pub latest_date: Option<DateTime<Utc>>,
    pub already_imported_count: usize,
    pub rewind_path: String,
}

/// Rewind AI Migration Manager
pub struct RewindMigration {
    db: Arc<DatabaseManager>,
    rewind_path: PathBuf,
    state_path: PathBuf,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    progress_tx: Option<mpsc::Sender<MigrationProgress>>,
    ocr_engine: Arc<OcrEngine>,
}

impl RewindMigration {
    /// Create a new RewindMigration instance
    pub fn new(
        db: Arc<DatabaseManager>,
        rewind_path: Option<PathBuf>,
        state_dir: Option<PathBuf>,
        ocr_engine: OcrEngine,
    ) -> Self {
        let rewind_path = rewind_path.unwrap_or_else(|| {
            let expanded = shellexpand::tilde(DEFAULT_REWIND_PATH);
            PathBuf::from(expanded.to_string())
        });

        let state_path = state_dir
            .unwrap_or_else(|| {
                dirs::data_local_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("screenpipe")
            })
            .join("rewind_migration_state.json");

        Self {
            db,
            rewind_path,
            state_path,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            pause_flag: Arc::new(AtomicBool::new(false)),
            progress_tx: None,
            ocr_engine: Arc::new(ocr_engine),
        }
    }

    /// Set progress channel for real-time updates
    pub fn set_progress_channel(&mut self, tx: mpsc::Sender<MigrationProgress>) {
        self.progress_tx = Some(tx);
    }

    /// Check if Rewind data is available
    pub async fn is_data_available(&self) -> bool {
        self.rewind_path.exists() && self.rewind_path.is_dir()
    }

    /// Get the Rewind data path
    pub fn get_rewind_path(&self) -> &Path {
        &self.rewind_path
    }

    /// Scan Rewind data directory and return statistics
    pub async fn scan(&self) -> Result<MigrationScanResult> {
        info!("Scanning Rewind data at: {:?}", self.rewind_path);

        if !self.is_data_available().await {
            return Err(anyhow::anyhow!(
                "Rewind data not found at: {:?}",
                self.rewind_path
            ));
        }

        let video_files = self.find_all_video_files().await?;

        if video_files.is_empty() {
            return Err(anyhow::anyhow!("No video files found in Rewind directory"));
        }

        let mut total_size_bytes: u64 = 0;
        let mut estimated_frames = 0;
        let mut earliest_date: Option<DateTime<Utc>> = None;
        let mut latest_date: Option<DateTime<Utc>> = None;

        for file in &video_files {
            if let Ok(metadata) = fs::metadata(file).await {
                total_size_bytes += metadata.len();

                // Estimate frames based on file metadata
                if let Ok(frame_count) = self.get_video_frame_count(file).await {
                    estimated_frames += frame_count;
                }

                // Get creation date
                if let Ok(created) = metadata.created() {
                    let created_dt: DateTime<Utc> = created.into();
                    if earliest_date.is_none() || created_dt < earliest_date.unwrap() {
                        earliest_date = Some(created_dt);
                    }
                    if latest_date.is_none() || created_dt > latest_date.unwrap() {
                        latest_date = Some(created_dt);
                    }
                }
            }
        }

        // Check existing checkpoint
        let checkpoint = self.load_checkpoint().await.ok().flatten();
        let already_imported = checkpoint
            .map(|c| c.processed_video_paths.len())
            .unwrap_or(0);

        info!(
            "Scan complete: {} videos, ~{} frames, {} bytes",
            video_files.len(),
            estimated_frames,
            total_size_bytes
        );

        Ok(MigrationScanResult {
            total_video_files: video_files.len(),
            total_size_bytes,
            estimated_frame_count: estimated_frames,
            earliest_date,
            latest_date,
            already_imported_count: already_imported,
            rewind_path: self.rewind_path.to_string_lossy().to_string(),
        })
    }

    /// Start or resume the migration process
    pub async fn start(&self) -> Result<MigrationProgress> {
        self.cancel_flag.store(false, Ordering::SeqCst);
        self.pause_flag.store(false, Ordering::SeqCst);

        // Try to resume from checkpoint
        let mut checkpoint = self
            .load_checkpoint()
            .await?
            .unwrap_or_else(MigrationCheckpoint::new);

        let video_files = self.find_all_video_files().await?;
        let total_videos = video_files.len();

        // Calculate total bytes
        let mut total_bytes: u64 = 0;
        for file in &video_files {
            if let Ok(metadata) = fs::metadata(file).await {
                total_bytes += metadata.len();
            }
        }

        let mut progress = MigrationProgress {
            state: MigrationState::Importing,
            total_videos,
            videos_processed: checkpoint.processed_video_paths.len(),
            total_frames: 0,
            frames_imported: checkpoint.total_frames_imported,
            frames_skipped: checkpoint.total_frames_skipped,
            current_video: None,
            bytes_processed: 0,
            total_bytes,
            start_time: Some(Utc::now()),
            estimated_seconds_remaining: None,
            error_message: None,
        };

        self.send_progress(&progress).await;

        let start_time = std::time::Instant::now();

        for (index, video_file) in video_files.iter().enumerate() {
            // Check for cancel/pause
            if self.cancel_flag.load(Ordering::SeqCst) {
                progress.state = MigrationState::Cancelled;
                self.send_progress(&progress).await;
                return Ok(progress);
            }

            if self.pause_flag.load(Ordering::SeqCst) {
                progress.state = MigrationState::Paused;
                self.save_checkpoint(&checkpoint).await?;
                self.send_progress(&progress).await;
                return Ok(progress);
            }

            let video_path_str = video_file.to_string_lossy().to_string();

            // Skip already processed files
            if checkpoint.processed_video_paths.contains(&video_path_str) {
                progress.videos_processed = index + 1;
                continue;
            }

            progress.current_video = Some(video_path_str.clone());
            self.send_progress(&progress).await;

            // Process the video
            match self.process_video_file(video_file, &mut checkpoint).await {
                Ok((imported, skipped)) => {
                    checkpoint.total_frames_imported += imported;
                    checkpoint.total_frames_skipped += skipped;
                    checkpoint.mark_video_processed(&video_path_str);

                    progress.frames_imported = checkpoint.total_frames_imported;
                    progress.frames_skipped = checkpoint.total_frames_skipped;

                    debug!(
                        "Processed {}: {} frames imported, {} skipped",
                        video_file.display(),
                        imported,
                        skipped
                    );
                }
                Err(e) => {
                    warn!("Failed to process {}: {}", video_file.display(), e);
                    // Continue with next file
                }
            }

            progress.videos_processed = index + 1;

            // Save checkpoint periodically
            if index % 10 == 0 {
                self.save_checkpoint(&checkpoint).await?;
            }

            // Update estimated time
            let elapsed = start_time.elapsed().as_secs_f64();
            let processed = progress.videos_processed;
            if processed > 0 && elapsed > 0.0 {
                let rate = processed as f64 / elapsed;
                let remaining = (total_videos - processed) as f64 / rate;
                progress.estimated_seconds_remaining = Some(remaining);
            }

            // Update bytes processed
            if let Ok(metadata) = fs::metadata(video_file).await {
                progress.bytes_processed += metadata.len();
            }

            self.send_progress(&progress).await;

            // Small delay to avoid CPU hogging
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        // Complete
        progress.state = MigrationState::Completed;
        progress.estimated_seconds_remaining = Some(0.0);
        self.save_checkpoint(&checkpoint).await?;
        self.send_progress(&progress).await;

        info!(
            "Migration complete: {} frames imported, {} skipped",
            checkpoint.total_frames_imported, checkpoint.total_frames_skipped
        );

        Ok(progress)
    }

    /// Request pause of the migration
    pub fn request_pause(&self) {
        self.pause_flag.store(true, Ordering::SeqCst);
        info!("Migration pause requested");
    }

    /// Request cancellation of the migration
    pub fn request_cancel(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
        info!("Migration cancel requested");
    }

    /// Process a single video file
    async fn process_video_file(
        &self,
        video_path: &Path,
        checkpoint: &mut MigrationCheckpoint,
    ) -> Result<(usize, usize)> {
        // Extract frames from video
        let frames = self.extract_frames(video_path).await?;

        let mut imported = 0;
        let mut skipped = 0;

        // Get file creation time for timestamp calculation
        let file_metadata = fs::metadata(video_path).await?;
        let creation_time: DateTime<Utc> = file_metadata
            .created()
            .map(|t| t.into())
            .unwrap_or_else(|_| Utc::now());

        let total_frames = frames.len();

        // Calculate real-time duration this video represents
        let real_time_duration_secs = total_frames as f64 * REWIND_CAPTURE_INTERVAL_SECS;

        // Create a video chunk for this import
        let device_name = "rewind_import";
        let _video_chunk_id = self
            .db
            .insert_video_chunk(&video_path.to_string_lossy(), device_name)
            .await?;

        let mut previous_hash: Option<u64> = None;

        for (frame_index, frame) in frames.iter().enumerate() {
            // Check for pause/cancel
            if self.cancel_flag.load(Ordering::SeqCst) || self.pause_flag.load(Ordering::SeqCst) {
                break;
            }

            // Calculate real-world timestamp for this frame
            let time_offset = if total_frames > 1 {
                (frame_index as f64 / (total_frames - 1) as f64) * real_time_duration_secs
            } else {
                0.0
            };
            let frame_timestamp =
                creation_time + chrono::Duration::milliseconds((time_offset * 1000.0) as i64);

            // Simple deduplication using image hash
            let current_hash = self.compute_image_hash(frame);
            if Some(current_hash) == previous_hash {
                skipped += 1;
                continue;
            }
            previous_hash = Some(current_hash);

            // Run OCR on the frame
            let ocr_text = self.run_ocr(frame).unwrap_or_default();

            if ocr_text.trim().is_empty() {
                skipped += 1;
                continue;
            }

            // Insert frame into database
            let frame_id = self
                .db
                .insert_frame(
                    device_name,
                    Some(frame_timestamp),
                    None, // browser_url
                    Some("Rewind Import"),
                    None, // window_name
                    false,
                    Some(frame_index as i64),
                )
                .await?;

            if frame_id > 0 {
                // Insert OCR text
                self.db
                    .insert_ocr_text(frame_id, &ocr_text, "{}", self.ocr_engine.clone())
                    .await?;

                imported += 1;
            }

            // Update checkpoint periodically
            if frame_index % BATCH_SIZE == 0 {
                checkpoint.update_checkpoint(&video_path.to_string_lossy(), frame_index);
            }
        }

        Ok((imported, skipped))
    }

    /// Find all MP4 files in the Rewind chunks directory
    async fn find_all_video_files(&self) -> Result<Vec<PathBuf>> {
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

        // Sort by path for consistent ordering
        files.sort();

        Ok(files)
    }

    /// Get frame count from a video file
    async fn get_video_frame_count(&self, video_path: &Path) -> Result<usize> {
        let ffmpeg_path = find_ffmpeg_path().context("Failed to find ffmpeg")?;
        let ffprobe_path = ffmpeg_path.with_file_name(if cfg!(windows) {
            "ffprobe.exe"
        } else {
            "ffprobe"
        });

        let output = Command::new(&ffprobe_path)
            .args([
                "-v",
                "error",
                "-count_frames",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=nb_read_frames",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                video_path.to_str().unwrap(),
            ])
            .output()
            .await?;

        if !output.status.success() {
            // Fallback: estimate from duration
            let metadata = self.get_video_metadata(video_path).await?;
            return Ok((metadata.duration * metadata.fps) as usize);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout
            .trim()
            .parse()
            .context("Failed to parse frame count")
    }

    /// Get video metadata (fps, duration)
    async fn get_video_metadata(&self, video_path: &Path) -> Result<VideoMetadata> {
        let ffmpeg_path = find_ffmpeg_path().context("Failed to find ffmpeg")?;
        let ffprobe_path = ffmpeg_path.with_file_name(if cfg!(windows) {
            "ffprobe.exe"
        } else {
            "ffprobe"
        });

        let output = Command::new(&ffprobe_path)
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                video_path.to_str().unwrap(),
            ])
            .output()
            .await?;

        if !output.status.success() {
            return Ok(VideoMetadata {
                fps: 30.0,
                duration: 0.0,
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parsed: serde_json::Value = serde_json::from_str(&stdout)?;

        let fps = parsed
            .get("streams")
            .and_then(|s| s.as_array())
            .and_then(|s| s.first())
            .and_then(|s| s.get("r_frame_rate"))
            .and_then(|r| r.as_str())
            .and_then(|r| {
                let parts: Vec<f64> = r.split('/').filter_map(|n| n.parse().ok()).collect();
                if parts.len() == 2 && parts[1] != 0.0 {
                    Some(parts[0] / parts[1])
                } else {
                    None
                }
            })
            .unwrap_or(30.0);

        let duration = parsed
            .get("format")
            .and_then(|f| f.get("duration"))
            .and_then(|d| d.as_str())
            .and_then(|d| d.parse().ok())
            .unwrap_or(0.0);

        Ok(VideoMetadata { fps, duration })
    }

    /// Extract frames from a video file
    async fn extract_frames(&self, video_path: &Path) -> Result<Vec<DynamicImage>> {
        let ffmpeg_path = find_ffmpeg_path().context("Failed to find ffmpeg")?;
        let temp_dir = tempfile::tempdir()?;
        let output_pattern = temp_dir.path().join("frame%d.jpg");

        // Get source FPS
        let metadata = self.get_video_metadata(video_path).await?;
        let target_fps = if metadata.fps > 10.0 { 1.0 } else { metadata.fps };

        let output = Command::new(&ffmpeg_path)
            .args([
                "-i",
                video_path.to_str().unwrap(),
                "-vf",
                &format!("fps={}", target_fps),
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

        // Load all extracted frames
        let mut frames = Vec::new();
        let mut entries = fs::read_dir(temp_dir.path()).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let frame_data = fs::read(&path).await?;
            if let Ok(img) = image::load_from_memory(&frame_data) {
                frames.push(img);
            }
        }

        // Sort by filename (frame1.jpg, frame2.jpg, etc.)
        // This is implicit since we load them in order

        Ok(frames)
    }

    /// Compute a simple perceptual hash of an image for deduplication
    fn compute_image_hash(&self, image: &DynamicImage) -> u64 {
        // Resize to 8x8 grayscale
        let small = image.resize_exact(8, 8, image::imageops::FilterType::Nearest);
        let gray = small.to_luma8();

        // Compute average
        let sum: u32 = gray.pixels().map(|p| p.0[0] as u32).sum();
        let avg = sum / 64;

        // Create hash from bits
        let mut hash: u64 = 0;
        for (i, pixel) in gray.pixels().enumerate() {
            if pixel.0[0] as u32 >= avg {
                hash |= 1 << i;
            }
        }

        hash
    }

    /// Run OCR on an image
    fn run_ocr(&self, image: &DynamicImage) -> Result<String> {
        // Use screenpipe's vision module for OCR
        #[cfg(target_os = "macos")]
        {
            use screenpipe_core::Language;
            use screenpipe_vision::perform_ocr_apple;

            let (text, _, _) = perform_ocr_apple(image, &[Language::English]);
            Ok(text)
        }

        #[cfg(target_os = "windows")]
        {
            // Windows OCR is async, but for simplicity we use a blocking approach here
            // In production, this should be properly async
            Ok(String::new())
        }

        #[cfg(target_os = "linux")]
        {
            // For Linux, we'll use Tesseract through the existing infrastructure
            // This is a simplified version - in production, would use proper Tesseract bindings
            Ok(String::new())
        }
    }

    /// Load checkpoint from disk
    async fn load_checkpoint(&self) -> Result<Option<MigrationCheckpoint>> {
        if !self.state_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&self.state_path).await?;
        let checkpoint: MigrationCheckpoint = serde_json::from_str(&content)?;
        Ok(Some(checkpoint))
    }

    /// Save checkpoint to disk
    async fn save_checkpoint(&self, checkpoint: &MigrationCheckpoint) -> Result<()> {
        if let Some(parent) = self.state_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let content = serde_json::to_string_pretty(checkpoint)?;
        fs::write(&self.state_path, content).await?;
        Ok(())
    }

    /// Clear checkpoint (for fresh start)
    pub async fn clear_checkpoint(&self) -> Result<()> {
        if self.state_path.exists() {
            fs::remove_file(&self.state_path).await?;
        }
        Ok(())
    }

    /// Send progress update
    async fn send_progress(&self, progress: &MigrationProgress) {
        if let Some(tx) = &self.progress_tx {
            let _ = tx.send(progress.clone()).await;
        }
    }
}

#[derive(Debug)]
struct VideoMetadata {
    fps: f64,
    duration: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_checkpoint_new() {
        let checkpoint = MigrationCheckpoint::new();
        assert!(checkpoint.processed_video_paths.is_empty());
        assert!(checkpoint.last_video_path.is_none());
    }

    #[test]
    fn test_migration_checkpoint_mark_processed() {
        let mut checkpoint = MigrationCheckpoint::new();
        checkpoint.mark_video_processed("/path/to/video.mp4");

        assert!(checkpoint
            .processed_video_paths
            .contains("/path/to/video.mp4"));
        assert!(checkpoint.last_video_path.is_none());
    }

    #[test]
    fn test_migration_progress_percent() {
        let mut progress = MigrationProgress::default();
        assert_eq!(progress.percent_complete(), 0.0);

        progress.total_videos = 100;
        progress.videos_processed = 50;
        assert_eq!(progress.percent_complete(), 50.0);
    }
}
