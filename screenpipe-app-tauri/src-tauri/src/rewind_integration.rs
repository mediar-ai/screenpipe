//! Rewind AI Integration Module
//!
//! Handles importing screen recording data from Rewind AI into screenpipe.
//! Designed as a standalone integration in the Connections tab.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use image::DynamicImage;
use screenpipe_core::find_ffmpeg_path;
use screenpipe_db::{DatabaseManager, OcrEngine};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::fs;
use tokio::process::Command;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

/// Default Rewind data path on macOS
pub const DEFAULT_REWIND_PATH: &str =
    "Library/Application Support/com.memoryvault.MemoryVault/chunks";

/// Real-time capture rate of Rewind (1 frame every 2 seconds)
const REWIND_CAPTURE_INTERVAL_SECS: f64 = 2.0;

/// State of the migration process
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Type)]
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
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
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

/// Result of scanning Rewind data
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RewindScanResult {
    pub available: bool,
    pub total_video_files: usize,
    pub total_size_bytes: u64,
    pub total_size_formatted: String,
    pub estimated_frame_count: usize,
    pub already_imported_count: usize,
    pub rewind_path: String,
}

/// Persistent checkpoint for resumable migrations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationCheckpoint {
    pub session_id: String,
    pub started_at: DateTime<Utc>,
    pub last_updated_at: DateTime<Utc>,
    pub processed_video_paths: HashSet<String>,
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
            total_frames_imported: 0,
            total_frames_skipped: 0,
        }
    }

    pub fn mark_video_processed(&mut self, path: &str) {
        self.processed_video_paths.insert(path.to_string());
        self.last_updated_at = Utc::now();
    }
}

/// Global migration state (shared across commands)
pub struct RewindMigrationState {
    pub progress: Mutex<MigrationProgress>,
    pub cancel_flag: AtomicBool,
    pub is_running: AtomicBool,
}

impl Default for RewindMigrationState {
    fn default() -> Self {
        Self {
            progress: Mutex::new(MigrationProgress::default()),
            cancel_flag: AtomicBool::new(false),
            is_running: AtomicBool::new(false),
        }
    }
}

/// Get the Rewind data path
pub fn get_rewind_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(DEFAULT_REWIND_PATH))
}

/// Check if Rewind data is available
pub async fn is_rewind_available() -> bool {
    if let Some(path) = get_rewind_path() {
        path.exists() && path.is_dir()
    } else {
        false
    }
}

/// Format bytes to human readable string
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

/// Scan Rewind data and return statistics
pub async fn scan_rewind_data(screenpipe_dir: &Path) -> Result<RewindScanResult> {
    let rewind_path = get_rewind_path()
        .ok_or_else(|| anyhow::anyhow!("Could not determine home directory"))?;

    if !rewind_path.exists() {
        return Ok(RewindScanResult {
            available: false,
            total_video_files: 0,
            total_size_bytes: 0,
            total_size_formatted: "0 bytes".to_string(),
            estimated_frame_count: 0,
            already_imported_count: 0,
            rewind_path: rewind_path.to_string_lossy().to_string(),
        });
    }

    let video_files = find_all_video_files(&rewind_path).await?;

    let mut total_size_bytes: u64 = 0;
    let mut estimated_frames = 0;

    for file in &video_files {
        if let Ok(metadata) = fs::metadata(file).await {
            total_size_bytes += metadata.len();
            // Rough estimate: ~60 frames per video file
            estimated_frames += 60;
        }
    }

    // Check existing checkpoint
    let checkpoint = load_checkpoint(screenpipe_dir).await.ok().flatten();
    let already_imported = checkpoint
        .map(|c| c.processed_video_paths.len())
        .unwrap_or(0);

    Ok(RewindScanResult {
        available: true,
        total_video_files: video_files.len(),
        total_size_bytes,
        total_size_formatted: format_bytes(total_size_bytes),
        estimated_frame_count: estimated_frames,
        already_imported_count: already_imported,
        rewind_path: rewind_path.to_string_lossy().to_string(),
    })
}

/// Find all MP4 files recursively
async fn find_all_video_files(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    let mut stack = vec![dir.to_path_buf()];

    while let Some(current_dir) = stack.pop() {
        let mut entries = fs::read_dir(&current_dir).await?;

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

/// Load checkpoint from disk
async fn load_checkpoint(screenpipe_dir: &Path) -> Result<Option<MigrationCheckpoint>> {
    let checkpoint_path = screenpipe_dir.join("rewind_migration_checkpoint.json");

    if !checkpoint_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&checkpoint_path).await?;
    let checkpoint: MigrationCheckpoint = serde_json::from_str(&content)?;
    Ok(Some(checkpoint))
}

/// Save checkpoint to disk
async fn save_checkpoint(screenpipe_dir: &Path, checkpoint: &MigrationCheckpoint) -> Result<()> {
    let checkpoint_path = screenpipe_dir.join("rewind_migration_checkpoint.json");
    let content = serde_json::to_string_pretty(checkpoint)?;
    fs::write(&checkpoint_path, content).await?;
    Ok(())
}

/// Clear checkpoint
pub async fn clear_checkpoint(screenpipe_dir: &Path) -> Result<()> {
    let checkpoint_path = screenpipe_dir.join("rewind_migration_checkpoint.json");
    if checkpoint_path.exists() {
        fs::remove_file(&checkpoint_path).await?;
    }
    Ok(())
}

/// Run the migration process
pub async fn run_migration(
    db: Arc<DatabaseManager>,
    screenpipe_dir: PathBuf,
    state: Arc<RewindMigrationState>,
    fresh_start: bool,
) -> Result<()> {
    // Check if already running
    if state.is_running.swap(true, Ordering::SeqCst) {
        return Err(anyhow::anyhow!("Migration already in progress"));
    }

    state.cancel_flag.store(false, Ordering::SeqCst);

    let result = run_migration_inner(db, &screenpipe_dir, state.clone(), fresh_start).await;

    state.is_running.store(false, Ordering::SeqCst);
    result
}

async fn run_migration_inner(
    db: Arc<DatabaseManager>,
    screenpipe_dir: &Path,
    state: Arc<RewindMigrationState>,
    fresh_start: bool,
) -> Result<()> {
    let rewind_path =
        get_rewind_path().ok_or_else(|| anyhow::anyhow!("Could not determine Rewind path"))?;

    // Clear checkpoint if fresh start
    if fresh_start {
        clear_checkpoint(screenpipe_dir).await?;
    }

    // Load or create checkpoint
    let mut checkpoint = load_checkpoint(screenpipe_dir)
        .await?
        .unwrap_or_else(MigrationCheckpoint::new);

    let video_files = find_all_video_files(&rewind_path).await?;
    let total_videos = video_files.len();

    // Update initial progress
    {
        let mut progress = state.progress.lock().await;
        progress.state = MigrationState::Importing;
        progress.total_videos = total_videos;
        progress.videos_processed = checkpoint.processed_video_paths.len();
        progress.frames_imported = checkpoint.total_frames_imported;
        progress.frames_skipped = checkpoint.total_frames_skipped;
    }

    for (index, video_file) in video_files.iter().enumerate() {
        // Check for cancellation
        if state.cancel_flag.load(Ordering::SeqCst) {
            let mut progress = state.progress.lock().await;
            progress.state = MigrationState::Cancelled;
            return Ok(());
        }

        let video_path_str = video_file.to_string_lossy().to_string();

        // Skip already processed
        if checkpoint.processed_video_paths.contains(&video_path_str) {
            continue;
        }

        // Update progress
        {
            let mut progress = state.progress.lock().await;
            progress.current_video = Some(
                video_file
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
            );
            progress.percent_complete = (index as f64 / total_videos as f64) * 100.0;
        }

        // Process video
        match process_video_file(&db, video_file, &mut checkpoint).await {
            Ok((imported, skipped)) => {
                checkpoint.total_frames_imported += imported;
                checkpoint.total_frames_skipped += skipped;
                checkpoint.mark_video_processed(&video_path_str);

                // Update progress
                {
                    let mut progress = state.progress.lock().await;
                    progress.videos_processed = index + 1;
                    progress.frames_imported = checkpoint.total_frames_imported;
                    progress.frames_skipped = checkpoint.total_frames_skipped;
                }

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
            save_checkpoint(screenpipe_dir, &checkpoint).await?;
        }

        // Small delay
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    }

    // Final save
    save_checkpoint(screenpipe_dir, &checkpoint).await?;

    // Update final progress
    {
        let mut progress = state.progress.lock().await;
        progress.state = MigrationState::Completed;
        progress.percent_complete = 100.0;
        progress.current_video = None;
    }

    info!(
        "Migration completed: {} frames imported, {} skipped",
        checkpoint.total_frames_imported, checkpoint.total_frames_skipped
    );

    Ok(())
}

/// Process a single video file
async fn process_video_file(
    db: &DatabaseManager,
    video_path: &Path,
    _checkpoint: &mut MigrationCheckpoint,
) -> Result<(usize, usize)> {
    // Extract frames
    let frames = extract_frames(video_path).await?;

    let mut imported = 0;
    let mut skipped = 0;

    // Get file creation time
    let file_metadata = fs::metadata(video_path).await?;
    let creation_time: DateTime<Utc> = file_metadata
        .created()
        .map(|t| t.into())
        .unwrap_or_else(|_| Utc::now());

    let total_frames = frames.len();
    let real_time_duration_secs = total_frames as f64 * REWIND_CAPTURE_INTERVAL_SECS;

    // Create video chunk
    let device_name = "rewind_import";
    let _video_chunk_id = db
        .insert_video_chunk(&video_path.to_string_lossy(), device_name)
        .await?;

    let mut previous_hash: Option<u64> = None;

    for (frame_index, frame) in frames.iter().enumerate() {
        // Calculate timestamp
        let time_offset = if total_frames > 1 {
            (frame_index as f64 / (total_frames - 1) as f64) * real_time_duration_secs
        } else {
            0.0
        };
        let frame_timestamp =
            creation_time + chrono::Duration::milliseconds((time_offset * 1000.0) as i64);

        // Deduplication
        let current_hash = compute_image_hash(&frame);
        if Some(current_hash) == previous_hash {
            skipped += 1;
            continue;
        }
        previous_hash = Some(current_hash);

        // Run OCR
        let ocr_text = run_ocr(&frame).unwrap_or_default();

        if ocr_text.trim().is_empty() {
            skipped += 1;
            continue;
        }

        // Insert frame
        let frame_id = db
            .insert_frame(
                device_name,
                Some(frame_timestamp),
                None,
                Some("Rewind Import"),
                None,
                false,
                Some(frame_index as i64),
            )
            .await?;

        if frame_id > 0 {
            db.insert_ocr_text(frame_id, &ocr_text, "{}", Arc::new(OcrEngine::AppleNative))
                .await?;
            imported += 1;
        }
    }

    Ok((imported, skipped))
}

/// Extract frames from video
async fn extract_frames(video_path: &Path) -> Result<Vec<DynamicImage>> {
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
        let frame_data = fs::read(&path).await?;
        if let Ok(img) = image::load_from_memory(&frame_data) {
            frames.push(img);
        }
    }

    Ok(frames)
}

/// Compute perceptual hash for deduplication
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

/// Run OCR on image (macOS only)
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
