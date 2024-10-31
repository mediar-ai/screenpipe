use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use dirs::cache_dir;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc::{channel, Sender};
use tracing::{debug, error, info};

use crate::server::ProgressInfo;
use glob::glob;
use screenpipe_core::find_ffmpeg_path;
use std::time::SystemTime;
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;

// Add these new imports at the top
use lru::LruCache;
use std::num::NonZeroUsize;
use tokio::sync::oneshot;

// Add these new types after the existing imports
#[derive(Debug, Clone)]
struct CachedFrame {
    timestamp: DateTime<Utc>,
    data: Arc<Vec<u8>>,
    last_accessed: DateTime<Utc>,
}

enum CacheMsg {
    GetFrame(i64, oneshot::Sender<Option<CachedFrame>>), // timestamp as key
    InsertFrame(i64, CachedFrame),
    Clear,
}

struct FrameCacheManager {
    frames: LruCache<i64, CachedFrame>, // timestamp -> frame
}

impl FrameCacheManager {
    fn new(capacity: usize) -> Self {
        Self {
            frames: LruCache::new(NonZeroUsize::new(capacity).unwrap()),
        }
    }

    fn handle_message(&mut self, msg: CacheMsg) {
        match msg {
            CacheMsg::GetFrame(timestamp, resp) => {
                let value = self.frames.get(&timestamp).cloned();
                let _ = resp.send(value);
            }
            CacheMsg::InsertFrame(timestamp, frame) => {
                self.frames.put(timestamp, frame);
            }
            CacheMsg::Clear => {
                self.frames.clear();
            }
        }
    }
}

#[derive(Clone)]
pub struct FrameCacheConfig {
    pub prefetch_size: Duration,
    pub cleanup_interval: Duration,
    pub fps: f32,
}

impl Default for FrameCacheConfig {
    fn default() -> Self {
        Self {
            prefetch_size: Duration::minutes(5),
            cleanup_interval: Duration::minutes(5),
            fps: 1.0,
        }
    }
}

#[derive(Clone)]
pub struct FrameCache {
    pub screenpipe_dir: PathBuf,
    cache_dir: PathBuf,
    config: FrameCacheConfig,
    cache_manager_tx: Sender<CacheMsg>,
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

impl FrameCache {
    pub async fn new(screenpipe_dir: PathBuf, cache_dir: Option<PathBuf>) -> Result<Self> {
        Self::with_config(screenpipe_dir, cache_dir, FrameCacheConfig::default()).await
    }

    pub async fn with_config(
        screenpipe_dir: PathBuf,
        cache_dir_: Option<PathBuf>,
        config: FrameCacheConfig,
    ) -> Result<Self> {
        info!("initializing frame cache");
        let cache_dir = match cache_dir_ {
            Some(dir) => dir,
            None => cache_dir().unwrap().join("screenpipe"),
        };
        fs::create_dir_all(&cache_dir).await?;

        // Add chunk cache manager channel
        let (cache_manager_tx, mut cache_manager_rx) = channel::<CacheMsg>(100);

        // Spawn cache manager task
        tokio::spawn(async move {
            let mut manager = FrameCacheManager::new(1000); // Adjust capacity as needed
            while let Some(msg) = cache_manager_rx.recv().await {
                manager.handle_message(msg);
            }
        });

        let cache = Self {
            screenpipe_dir,
            cache_dir: cache_dir.clone(),
            config,
            cache_manager_tx,
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

        Ok(cache)
    }

    pub async fn get_frame(&self, target_time: DateTime<Utc>) -> Option<Vec<u8>> {
        let timestamp = target_time.timestamp();

        // Try cache first
        let (tx, rx) = oneshot::channel();
        if let Ok(()) = self
            .cache_manager_tx
            .send(CacheMsg::GetFrame(timestamp, tx))
            .await
        {
            if let Ok(Some(frame)) = rx.await {
                debug!("cache hit for frame at {}", target_time);
                return Some(frame.data.as_ref().clone());
            }
        }

        // Cache miss - extract from video
        debug!("cache miss for frame at {}", target_time);
        let prefetch_end = target_time + self.config.prefetch_size;

        let (_, mut rx) = tokio::sync::mpsc::channel::<(DateTime<Utc>, Vec<u8>)>(100);

        // Spawn prefetch task
        let cache = self.clone();
        tokio::spawn(async move {
            if let Err(e) = cache.preload_frames(&target_time, &prefetch_end).await {
                debug!("failed to preload frames: {}", e);
            }
        });

        // Wait for the specific frame we need
        while let Some((frame_time, frame_data)) = rx.recv().await {
            // Cache the frame
            let frame = CachedFrame {
                timestamp: frame_time,
                data: Arc::new(frame_data.clone()),
                last_accessed: Utc::now(),
            };

            let _ = self
                .cache_manager_tx
                .send(CacheMsg::InsertFrame(frame_time.timestamp(), frame))
                .await;

            // Return if this is the frame we wanted
            if (frame_time - target_time).num_milliseconds().abs() < 1000 {
                return Some(frame_data);
            }
        }

        None
    }

    pub async fn extract_frames_batch(
        file_path: &str,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        fps: f32,
        frame_tx: Sender<(DateTime<Utc>, Vec<u8>)>,
    ) -> Result<()> {
        let ffmpeg = find_ffmpeg_path().ok_or_else(|| anyhow::anyhow!("ffmpeg not found"))?;

        // Calculate duration in seconds
        let duration = (end_time - start_time).num_seconds();

        let mut cmd = Command::new(ffmpeg);
        cmd.args([
            "-i",
            file_path,
            "-ss",
            "0", // Start from beginning of file
            "-t",
            &duration.to_string(),
            "-vf",
            &format!("fps={}", fps),
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-",
        ]);

        let mut child = cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        // Get stdout handle
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("failed to get stdout"))?;

        // Spawn task to read stderr and log it
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("failed to get stderr"))?;
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                debug!("ffmpeg: {}", line);
            }
        });

        // Process frames in chunks
        let mut reader = BufReader::new(stdout);
        let mut frame_count = 0;
        let mut frame_time = start_time;
        let frame_interval = Duration::milliseconds((1000.0 / fps) as i64);

        loop {
            // Read JPEG header marker
            let mut buf = [0u8; 2];
            if reader.read_exact(&mut buf).await.is_err() {
                break;
            }
            if buf != [0xFF, 0xD8] {
                continue;
            }

            // Read until JPEG end marker
            let mut frame_data = vec![0xFF, 0xD8];
            let mut last_byte = 0;
            loop {
                match reader.read_u8().await {
                    Ok(byte) => {
                        frame_data.push(byte);
                        if last_byte == 0xFF && byte == 0xD9 {
                            break;
                        }
                        last_byte = byte;
                    }
                    Err(_) => break,
                }
            }

            // Send frame if it's complete
            if frame_data.ends_with(&[0xFF, 0xD9]) {
                if let Err(e) = frame_tx.send((frame_time, frame_data)).await {
                    println!("failed to send frame: {}", e);
                    break;
                }
                frame_count += 1;
                frame_time = start_time + frame_interval * frame_count;
            }
        }

        // Ensure child process is terminated
        let status = child.wait().await?;
        if !status.success() {
            return Err(anyhow::anyhow!("ffmpeg failed with status: {}", status));
        }

        Ok(())
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
                is_complete
            }
            Err(e) => {
                debug!("failed to check file {}: {}", file_path, e);
                false
            }
        }
    }
    pub async fn extract_frames_range(
        &self,
        start: &DateTime<Utc>,
        end: &DateTime<Utc>,
        frame_tx: tokio::sync::mpsc::Sender<(DateTime<Utc>, Vec<u8>)>,
    ) -> Result<()> {
        let chunks = self
            .find_video_chunks(&self.screenpipe_dir, *start, *end)
            .await?;

        for chunk in chunks {
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

        Ok(())
    }
    async fn find_video_chunks(
        &self,
        data_dir: &PathBuf,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<VideoChunk>> {
        let mut chunks = Vec::new();

        debug!("scanning dir for chunks: {:?}", data_dir);
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

        Ok(chunks)
    }

    async fn preload_frames(&self, start: &DateTime<Utc>, end: &DateTime<Utc>) -> Result<()> {
        debug!("preloading frames from {} to {}", start, end);

        // Create channels for internal use
        let (frame_tx, mut frame_rx) = tokio::sync::mpsc::channel::<(DateTime<Utc>, Vec<u8>)>(100);

        // Process chunks and stream frames
        let chunks = self
            .find_video_chunks(&self.screenpipe_dir, *start, *end)
            .await?;
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
            self.insert_frame(timestamp, frame_data).await;
        }

        Ok(())
    }

    async fn insert_frame(&self, timestamp: DateTime<Utc>, frame_data: Vec<u8>) {
        let frame = CachedFrame {
            timestamp,
            data: Arc::new(frame_data),
            last_accessed: Utc::now(),
        };

        let _ = self
            .cache_manager_tx
            .send(CacheMsg::InsertFrame(timestamp.timestamp(), frame))
            .await;
    }

    pub async fn preload_frames_with_progress(
        &self,
        start: &DateTime<Utc>,
        end: &DateTime<Utc>,
        progress_tx: tokio::sync::mpsc::Sender<ProgressInfo>,
        frame_tx: tokio::sync::mpsc::Sender<(DateTime<Utc>, Vec<u8>)>,
    ) -> Result<()> {
        debug!("preloading frames from {} to {}", start, end);

        let chunks = self
            .find_video_chunks(&self.screenpipe_dir, *start, *end)
            .await?;
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
