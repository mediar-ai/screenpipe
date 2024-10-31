use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use dirs::cache_dir;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc::{channel, Sender};
use tokio::sync::RwLock;
use tracing::{debug, error, info};

use crate::server::ProgressInfo;
use glob::glob;
use screenpipe_core::find_ffmpeg_path;
use std::collections::{HashMap, HashSet};
use std::time::SystemTime;
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;
use tokio::process::ChildStdout;

#[derive(Clone)]
pub struct FrameCacheConfig {
    pub prefetch_size: Duration,
    pub cleanup_interval: Duration,
    pub fps: f32,
    pub cache_dir: Option<PathBuf>,
}

impl Default for FrameCacheConfig {
    fn default() -> Self {
        Self {
            prefetch_size: Duration::minutes(5),
            cleanup_interval: Duration::minutes(5),
            fps: 1.0,
            cache_dir: None,
        }
    }
}

#[derive(Clone)]
pub struct FrameCache {
    pub screenpipe_dir: PathBuf,
    cache_dir: PathBuf,
    cache_tx: Sender<CacheCommand>,
    last_accessed_range: Arc<RwLock<Option<(DateTime<Utc>, DateTime<Utc>)>>>,
    config: FrameCacheConfig,
    validated_files: Arc<RwLock<HashSet<String>>>,
}

#[derive(Debug)]
enum CacheCommand {
    Cleanup,
    ScanForNewFrames,
}

#[derive(Debug)]
struct VideoChunk {
    file_path: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
}

/*

this file should properly:

- maintain a cache of frames on cache dir with frequent cleanup if some timerange not accessed
  - eg: if user starts viewing current time and scrolls up to 1h ago, keep cache from now to 1h30 ago
  - cleanup frames outside this range to save disk space
  - use filesystem timestamps to manage cache, no need for db
  - add proper debug logging for cache operations
  - ensure cache directory exists and is writable

- handle video file access safely
  - skip mp4 files that are less than 60 seconds old (likely being written)
  - use filesystem metadata to check file age
  - parse timestamps from filenames like "monitor_1_2024-10-30_22-02-42.mp4"
  - validate video files using ffmpeg before processing
  - add detailed logging for file validation steps
  - handle file access errors gracefully

- smart prefetching
  - when user requests frames from a specific time, prefetch next N seconds
  - use filesystem glob to find relevant mp4 files
  - extract frames in batches for better performance
  - maintain small time tolerance when matching frames (±1s)
  - verify glob patterns are working correctly
  - add debug logging for file discovery process
  - handle timezone properly

- efficient streaming
  - stream frames to client at requested fps (default 10fps)
  - client controls playback speed
  - use SSE (Server-Sent Events) for streaming
  - base64 encode frames for transport
  - ensure frame extraction matches requested FPS
  - handle frame extraction errors gracefully
  - optimize memory usage during streaming

- filesystem-first approach
  - avoid database queries
  - use file system for storage and lookups
  - maintain in-memory index of available frames
  - use channels for cleanup coordination
  - verify directory paths are correct
  - handle filesystem errors gracefully
  - add metrics for cache performance

- error handling
  - log all errors with context
  - provide meaningful error messages
  - handle filesystem permission issues
  - recover gracefully from corrupted files

- performance considerations
  - minimize disk I/O
  - optimize frame extraction
  - efficient memory usage
  - proper cleanup of temporary files


additional context:
- files in the data dir looks like this:
  - "/Users/louisbeaumont/.screenpipe/data/MacBook Pro Microphone (input)_2024-09-12_05-44-04.mp4"
  - "/Users/louisbeaumont/.screenpipe/data/MacBook Pro Microphone (input)_2024-09-03_01-07-04.mp4"
  - "/Users/louisbeaumont/.screenpipe/data/MacBook Pro Microphone (input)_2024-10-22_02-34-24.mp4"
  - "/Users/louisbeaumont/.screenpipe/data/monitor_1_2024-10-20_21-27-02.mp4"
  - "/Users/louisbeaumont/.screenpipe/data/monitor_1_2024-10-01_02-05-38.mp4"
  - "/Users/louisbeaumont/.screenpipe/data/MacBook Pro Microphone (input)_2024-10-20_08-04-04.mp4"
  - "/Users/louisbeaumont/.screenpipe/data/MacBook Pro Microphone (input)_2024-09-14_04-53-50.mp4"
  - "/Users/louisbeaumont/.screenpipe/data/MacBook Pro Microphone (input)_2024-09-17_03-16-10.mp4"

rules:
- we should not use file name as to parse the date - too risky on cross-platform stuff

*/
#[derive(Clone)]
struct CachedChunk {
    file_path: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    last_check: DateTime<Utc>,
}
impl FrameCache {
    pub async fn new(screenpipe_dir: PathBuf) -> Result<Self> {
        Self::with_config(screenpipe_dir, FrameCacheConfig::default()).await
    }

    pub async fn with_config(screenpipe_dir: PathBuf, config: FrameCacheConfig) -> Result<Self> {
        info!("initializing frame cache");
        let cache_dir = match config.clone().cache_dir {
            Some(dir) => dir,
            None => cache_dir().unwrap().join("screenpipe"),
        };
        fs::create_dir_all(&cache_dir).await?;
        let (cache_tx, mut cache_rx) = channel(100);

        let cache = Self {
            screenpipe_dir,
            cache_dir: cache_dir.clone(),
            cache_tx,
            last_accessed_range: Arc::new(RwLock::new(None)),
            config,
            validated_files: Arc::new(RwLock::new(HashSet::new())),
        };

        // Start background scanner task
        let scanner_cache = cache.clone();
        tokio::spawn(async move {
            // scan every prefetch_size / 3
            let mut interval =
                tokio::time::interval(scanner_cache.config.prefetch_size.to_std().unwrap());
            loop {
                interval.tick().await;
                let now = Utc::now();
                let scan_start = now - Duration::minutes(5); // Scan last 5 minutes
                debug!("scanning for new frames from {} to {}", scan_start, now);

                if let Err(e) = scanner_cache.preload_frames(&scan_start, &now).await {
                    error!("failed to scan for new frames: {}", e);
                }
            }
        });

        // Clone the parts needed for the cleanup task
        let cleanup_cache = cache.clone();

        // Modify existing cleanup task to also handle ScanForNewFrames
        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(cleanup_cache.config.cleanup_interval.to_std().unwrap());
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        debug!("performing scheduled cleanup");
                        // if let Err(e) = Self::cleanup_old_frames(&cleanup_cache).await {
                        //     error!("failed to cleanup frames: {}", e);
                        // }
                    }
                    Some(cmd) = cache_rx.recv() => {
                        match cmd {
                            CacheCommand::Cleanup => {
                                debug!("performing requested cleanup");
                                // if let Err(e) = Self::cleanup_old_frames(&cleanup_cache).await {
                                //     error!("failed to cleanup frames: {}", e);
                                // }
                            }
                            CacheCommand::ScanForNewFrames => {
                                let now = Utc::now();
                                // should be a percentage of the prefetch size
                                let scan_start = now - Duration::minutes(
                                    cleanup_cache.config.prefetch_size.num_minutes() / 10
                                );
                                if let Err(e) = cleanup_cache.preload_frames(&scan_start, &now).await {
                                    error!("failed to scan for new frames: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        });

        Ok(cache)
    }

    async fn cleanup_old_frames(cache: &FrameCache) -> Result<()> {
        debug!("cleaning up old frames");
        // Don't lock for writing if we don't have a range yet
        let last_range = cache.last_accessed_range.read().await;
        if last_range.is_none() {
            debug!("no last accessed range, skipping cleanup");
            return Ok(());
        }
        drop(last_range);

        // Now get write lock only if needed
        let last_range = cache.last_accessed_range.write().await;
        if let Some((start, _)) = last_range.as_ref() {
            let cutoff = *start - Duration::hours(1);
            let old_frames: Vec<_> = cache
                .cache_dir
                .read_dir()?
                .filter_map(|e| e.ok())
                .filter(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with("frame_") && name.ends_with(".jpg") {
                        if let Ok(ts) = name[6..name.len() - 4].parse::<i64>() {
                            if ts < cutoff.timestamp() {
                                return true;
                            }
                        }
                    }
                    false
                })
                .map(|e| e.path())
                .collect();

            for path in old_frames {
                if let Err(e) = fs::remove_file(&path).await {
                    error!("failed to remove old frame {}: {}", path.display(), e);
                }
            }
        }

        Ok(())
    }

    pub async fn get_frame(&self, target_time: DateTime<Utc>) -> Option<PathBuf> {
        debug!("getting frame for time: {}", target_time);

        // First check cache
        let frame_path = self
            .cache_dir
            .join(format!("frame_{}.jpg", target_time.timestamp()));

        if frame_path.exists() {
            debug!("frame found in cache: {:?}", frame_path);
            return Some(frame_path);
        }

        // If not in cache, trigger prefetch
        let prefetch_end = target_time + self.config.prefetch_size;
        debug!(
            "frame not in cache, prefetching range {} to {}",
            target_time, prefetch_end
        );

        if let Err(e) = self.preload_frames(&target_time, &prefetch_end).await {
            error!("prefetch failed: {}", e);
            return None;
        }

        // After prefetch, check cache again
        if frame_path.exists() {
            debug!("frame found after prefetch: {:?}", frame_path);
            Some(frame_path)
        } else {
            debug!("frame not found even after prefetch: {}", target_time);
            None
        }
    }

    pub async fn extract_frames_batch(
        file_path: &str,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        fps: f32,
        frame_tx: tokio::sync::mpsc::Sender<(DateTime<Utc>, Vec<u8>)>,
    ) -> Result<()> {
        let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| anyhow::anyhow!("ffmpeg not found"))?;

        // Get file creation time to use as base for seeking
        let metadata = tokio::fs::metadata(file_path).await?;
        let file_start = DateTime::<Utc>::from(metadata.modified()?);

        // Calculate seek offset from file start
        let seek_offset = start_time.signed_duration_since(file_start);
        if seek_offset.num_seconds() < 0 {
            return Err(anyhow::anyhow!("start time is before file creation"));
        }

        let seek_str = format!(
            "{}.{}",
            seek_offset.num_seconds(),
            seek_offset.num_milliseconds() % 1000
        );

        let duration = (end_time - start_time).num_seconds();

        debug!(
            "streaming frames from {} at offset {}s for {}s at {} fps",
            file_path, seek_str, duration, fps
        );

        let mut command = Command::new(&ffmpeg_path);
        command
            .args(&[
                "-hwaccel",
                "auto",
                "-ss",
                &seek_str,
                "-i",
                file_path,
                "-t",
                &duration.to_string(),
                "-vf",
                &format!("fps={}", fps),
                "-f",
                "image2pipe",
                "-vcodec",
                "mjpeg",
                "-",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = command.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("no stdout"))?;
        let mut reader = BufReader::new(stdout);

        // Spawn a task to handle stderr
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("no stderr"))?;
        let stderr_handle = tokio::spawn(async move {
            let mut stderr_reader = BufReader::new(stderr);
            let mut line = String::new();
            while let Ok(n) = stderr_reader.read_line(&mut line).await {
                if n == 0 {
                    break;
                }
                // Only log as error if the line contains error-indicating terms
                if line.to_lowercase().contains("error") || line.to_lowercase().contains("fatal") {
                    error!("ffmpeg error: {}", line.trim());
                } else {
                    debug!("ffmpeg: {}", line.trim());
                }
                line.clear();
            }
        });

        // Read JPEG frames from stdout
        let frame_interval = Duration::milliseconds((1000.0 / fps) as i64);
        let mut current_time = start_time;

        while let Ok(frame_read) = Self::read_jpeg_frame(&mut reader).await {
            match frame_read {
                Some(frame_data) => {
                    // Successfully read a frame, send it through the channel
                    if let Err(e) = frame_tx.send((current_time, frame_data)).await {
                        error!("failed to send frame: {}", e);
                        break;
                    }
                    current_time = current_time + frame_interval;
                }
                None => {
                    // End of stream
                    break;
                }
            }
        }

        // Wait for stderr handler and child process to finish
        stderr_handle.abort();
        let _ = child.wait().await;

        Ok(())
    }

    // Helper function to read a JPEG frame from the stream
    async fn read_jpeg_frame(reader: &mut BufReader<ChildStdout>) -> Result<Option<Vec<u8>>> {
        let mut buffer = Vec::new();

        // Look for JPEG start marker
        let mut marker = [0u8; 2];
        if reader.read_exact(&mut marker).await.is_err() {
            return Ok(None);
        }

        while marker != [0xFF, 0xD8] {
            marker[0] = marker[1];
            if reader.read_exact(&mut marker[1..]).await.is_err() {
                return Ok(None);
            }
        }

        buffer.extend_from_slice(&marker);

        // Read until JPEG end marker
        loop {
            if reader.read_exact(&mut marker).await.is_err() {
                return Ok(None);
            }
            buffer.extend_from_slice(&[marker[0]]);

            if marker == [0xFF, 0xD9] {
                buffer.extend_from_slice(&[marker[1]]);
                return Ok(Some(buffer));
            }
        }
    }

    async fn is_video_file_complete(&self, file_path: &str) -> bool {
        // Add file age check first
        if let Ok(metadata) = tokio::fs::metadata(file_path).await {
            if let Ok(modified) = metadata.modified() {
                let age = SystemTime::now()
                    .duration_since(modified)
                    .unwrap_or_default();

                // Skip validation for files modified in last 60s
                if age.as_secs() < 60 {
                    return false;
                }
            }
        }

        // Check validated cache first
        {
            let validated = self.validated_files.read().await;
            if validated.contains(file_path) {
                return true;
            }
        }

        let ffmpeg_path = match find_ffmpeg_path() {
            Some(path) => path,
            None => {
                error!("failed to find ffmpeg path");
                return false;
            }
        };

        // Just do a quick check if ffmpeg can read the file
        match Command::new(&ffmpeg_path)
            .args(&["-v", "error", "-i", file_path, "-f", "null", "-"])
            .output()
            .await
        {
            Ok(output) => {
                let is_complete = output.status.success();
                if !is_complete {
                    debug!(
                        "file {} is incomplete or corrupted: {:?}",
                        file_path,
                        String::from_utf8_lossy(&output.stderr)
                    );
                }
                if is_complete {
                    let mut validated = self.validated_files.write().await;
                    validated.insert(file_path.to_string());
                }
                is_complete
            }
            Err(e) => {
                debug!("failed to check file {}: {}", file_path, e);
                false
            }
        }
    }

    async fn find_video_chunks(
        data_dir: &PathBuf,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<VideoChunk>> {
        // Add static chunk cache
        use lazy_static::lazy_static;
        use std::sync::Mutex;

        lazy_static! {
            static ref CHUNK_CACHE: Mutex<HashMap<String, CachedChunk>> =
                Mutex::new(HashMap::new());
        }

        let now = Utc::now();
        let cache_ttl = Duration::minutes(5);

        // Check cache first
        let mut chunks = Vec::new();
        {
            let cache = CHUNK_CACHE.lock().unwrap();
            for chunk in cache.values() {
                if (now - chunk.last_check) < cache_ttl
                    && chunk.start_time <= end
                    && chunk.end_time >= start
                {
                    chunks.push(VideoChunk {
                        file_path: chunk.file_path.clone(),
                        start_time: chunk.start_time,
                        end_time: chunk.end_time,
                    });
                }
            }
        }

        if !chunks.is_empty() {
            debug!("using {} cached chunks", chunks.len());
            return Ok(chunks);
        }

        debug!("scanning dir for chunks: {:?}", data_dir);
        let mut chunks = Vec::new();
        let pattern = data_dir.join("monitor_*.mp4").to_string_lossy().to_string();

        let paths: Vec<_> = glob(&pattern)?.filter_map(Result::ok).collect();

        for entry in paths {
            let file_path = entry.to_string_lossy().to_string();

            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let chunk_time = DateTime::<Utc>::from(modified);
                    let chunk_end = chunk_time + Duration::minutes(2);

                    let age = SystemTime::now()
                        .duration_since(modified)
                        .unwrap_or_default();

                    if age.as_secs() < 60 {
                        continue;
                    }

                    if chunk_time <= end && chunk_end >= start {
                        debug!(
                            "found usable chunk: {} ({} to {})",
                            file_path, chunk_time, chunk_end
                        );
                        chunks.push(VideoChunk {
                            file_path,
                            start_time: chunk_time,
                            end_time: chunk_end,
                        });
                    }
                }
            }
        }

        debug!("total usable chunks found: {}", chunks.len());
        chunks.sort_by_key(|chunk| chunk.start_time);

        // Update cache
        {
            let mut cache = CHUNK_CACHE.lock().unwrap();
            for chunk in &chunks {
                cache.insert(
                    chunk.file_path.clone(),
                    CachedChunk {
                        file_path: chunk.file_path.clone(),
                        start_time: chunk.start_time,
                        end_time: chunk.end_time,
                        last_check: Utc::now(),
                    },
                );
            }
        }

        Ok(chunks)
    }

    async fn preload_frames(&self, start: &DateTime<Utc>, end: &DateTime<Utc>) -> Result<()> {
        debug!("preloading frames from {} to {}", start, end);

        // Create channels for internal use
        let (frame_tx, mut frame_rx) = tokio::sync::mpsc::channel::<(DateTime<Utc>, Vec<u8>)>(100);
        let (progress_tx, _progress_rx) = tokio::sync::mpsc::channel::<ProgressInfo>(100);

        // Process chunks and stream frames
        let chunks = Self::find_video_chunks(&self.screenpipe_dir, *start, *end).await?;
        debug!("found {} chunks to process", chunks.len());

        if chunks.is_empty() {
            debug!("no video chunks found for the requested time range");
            return Ok(());
        }

        for chunk in chunks {
            debug!("processing chunk: {}", chunk.file_path);

            if !self.is_video_file_complete(&chunk.file_path).await {
                continue;
            }

            if let Err(e) = Self::extract_frames_batch(
                &chunk.file_path,
                chunk.start_time,
                chunk.end_time,
                self.config.fps,
                frame_tx.clone(),
            )
            .await
            {
                error!("failed to extract frames from {}: {}", chunk.file_path, e);
            }
        }

        // Handle received frames if needed (e.g., caching)
        while let Some((timestamp, frame_data)) = frame_rx.recv().await {
            if let Err(e) = self.insert_frame(timestamp, &frame_data).await {
                error!("failed to cache frame at {}: {}", timestamp, e);
            }
        }

        Ok(())
    }

    pub async fn insert_frame(&self, timestamp: DateTime<Utc>, frame_data: &[u8]) -> Result<()> {
        let cache_path = self
            .cache_dir
            .join(format!("frame_{}.jpg", timestamp.timestamp()));
        fs::write(&cache_path, frame_data).await?;

        Ok(())
    }

    pub async fn preload_frames_with_progress(
        &self,
        start: &DateTime<Utc>,
        end: &DateTime<Utc>,
        progress_tx: tokio::sync::mpsc::Sender<ProgressInfo>,
        frame_tx: tokio::sync::mpsc::Sender<(DateTime<Utc>, Vec<u8>)>,
    ) -> Result<()> {
        debug!("preloading frames from {} to {}", start, end);

        let chunks = Self::find_video_chunks(&self.screenpipe_dir, *start, *end).await?;
        let total_chunks = chunks.len();

        debug!("found {} chunks to process", total_chunks);

        if chunks.is_empty() {
            let _ = progress_tx
                .send(ProgressInfo::new(
                    "no video chunks found".to_string(),
                    100.0,
                    0,
                    0,
                    *start,
                ))
                .await;
            return Ok(());
        }

        for (i, chunk) in chunks.into_iter().enumerate() {
            debug!(
                "processing chunk {}/{}: {}",
                i + 1,
                total_chunks,
                chunk.file_path
            );

            // Send progress update
            let _ = progress_tx
                .send(ProgressInfo::new(
                    format!("processing chunk {}/{}", i + 1, total_chunks),
                    (i as f32 / total_chunks as f32) * 100.0,
                    total_chunks,
                    i,
                    chunk.start_time,
                ))
                .await;

            if !self.is_video_file_complete(&chunk.file_path).await {
                continue;
            }

            // Pass the frame_tx channel to extract_frames_batch
            if let Err(e) = Self::extract_frames_batch(
                &chunk.file_path,
                chunk.start_time,
                chunk.end_time,
                self.config.fps,
                frame_tx.clone(),
            )
            .await
            {
                error!("failed to extract frames from {}: {}", chunk.file_path, e);
            }
        }

        // Send completion progress
        let _ = progress_tx
            .send(ProgressInfo::new(
                "completed frame extraction".to_string(),
                100.0,
                total_chunks,
                total_chunks,
                *end,
            ))
            .await;

        Ok(())
    }
}
