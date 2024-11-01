/*

### Video Cache Rules

✅ **DO**
- index ALL files in memory (just paths + metadata, ~10MB RAM)
- cache last 5min full-res, 1h low-res (640px)
- use ffmpeg for frame extraction (JPEG, q=3/8)
- use filesystem metadata for timestamps
- handle timeouts (30s max)
- refresh index every 30s

❌ **DON'T**
- parse filenames for dates
- cache full video files in RAM
- keep file handles open
- use more than 1GB RAM total
- block on frame extraction / slowness
- process files modified in last 60s

We should be able to allow users to:
- stream frames at high speed from current timestamp, 10 min around
- go back in time fast, like 2 months ago


*/

use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use std::collections::BTreeMap;
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc::{channel, Sender};
use tokio::sync::{oneshot, RwLock};
use tracing::{debug, error};

use glob::glob;
use lru::LruCache;
use screenpipe_core::find_ffmpeg_path;
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;

use crate::DatabaseManager;

type FrameChannel = Sender<(DateTime<Utc>, Vec<u8>, String, String, String)>;

#[derive(Debug, Clone)]
struct PreviewFrame {
    timestamp: DateTime<Utc>,
    data: Arc<Vec<u8>>,
    file_path: String,
    app_name: String,
    window_name: String,
    is_preview: bool,
}

#[derive(Debug)]
struct VideoFile {
    path: PathBuf,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    size: u64,
    is_complete: bool,
}

struct VideoIndex {
    files: BTreeMap<DateTime<Utc>, VideoFile>,
    total_size: u64,
}

impl VideoIndex {
    fn new() -> Self {
        Self {
            files: BTreeMap::new(),
            total_size: 0,
        }
    }

    fn find_files_in_range(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> Vec<&VideoFile> {
        self.files
            .range(..=end)
            .filter(|(_, file)| file.end_time >= start)
            .map(|(_, file)| file)
            .collect()
    }

    async fn refresh_index(&mut self, data_dir: &Path) -> Result<()> {
        debug!("refreshing video index...");
        let mut new_files = BTreeMap::new();
        let mut total_size = 0;

        let pattern = data_dir.join("**/monitor_*.mp4");
        for entry in glob(&pattern.to_string_lossy())?.filter_map(Result::ok) {
            let metadata = tokio::fs::metadata(&entry).await?;
            if metadata.len() == 0 {
                continue;
            }

            let is_complete = SystemTime::now()
                .duration_since(metadata.modified()?)?
                .as_secs()
                >= 60;

            let start_time: DateTime<Utc> = metadata.created()?.into();
            let end_time = start_time + Duration::minutes(2);

            new_files.insert(
                start_time,
                VideoFile {
                    path: entry,
                    start_time,
                    end_time,
                    size: metadata.len(),
                    is_complete,
                },
            );

            total_size += metadata.len();
        }

        self.files = new_files;
        self.total_size = total_size;

        debug!(
            "index refreshed: {} files, {:.2}GB total",
            self.files.len(),
            self.total_size as f64 / 1024.0 / 1024.0 / 1024.0
        );
        Ok(())
    }
}

enum CacheMsg {
    GetFrame(i64, oneshot::Sender<Option<PreviewFrame>>),
    InsertFrame(i64, PreviewFrame),
}

struct FrameCacheManager {
    recent_frames: LruCache<i64, PreviewFrame>,
    preview_frames: LruCache<i64, PreviewFrame>,
}

impl FrameCacheManager {
    fn new() -> Self {
        Self {
            recent_frames: LruCache::new(NonZeroUsize::new(300).unwrap()),
            preview_frames: LruCache::new(NonZeroUsize::new(720).unwrap()),
        }
    }

    fn handle_message(&mut self, msg: CacheMsg) {
        match msg {
            CacheMsg::GetFrame(timestamp, resp) => {
                let value = self
                    .recent_frames
                    .get(&timestamp)
                    .or_else(|| self.preview_frames.get(&timestamp))
                    .cloned();
                let _ = resp.send(value);
            }
            CacheMsg::InsertFrame(timestamp, frame) => {
                if frame.is_preview {
                    self.preview_frames.put(timestamp, frame);
                } else {
                    self.recent_frames.put(timestamp, frame);
                }
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

#[derive(Debug)]
struct VideoChunk {
    file_path: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct FrameInfo {
    pub timestamp: DateTime<Utc>,
    pub data: Vec<u8>,
    pub app_name: String,
    pub window_name: String,
}

#[derive(Clone)]
pub struct FrameCache {
    pub screenpipe_dir: PathBuf,
    config: FrameCacheConfig,
    video_index: Arc<RwLock<VideoIndex>>,
    cache_manager_tx: Sender<CacheMsg>,
    db: Arc<DatabaseManager>,
}

impl FrameCache {
    pub async fn new(screenpipe_dir: PathBuf, db: Arc<DatabaseManager>) -> Result<Self> {
        Self::with_config(screenpipe_dir, db, FrameCacheConfig::default()).await
    }

    pub async fn with_config(
        screenpipe_dir: PathBuf,
        db: Arc<DatabaseManager>,
        config: FrameCacheConfig,
    ) -> Result<Self> {
        debug!("initializing frame cache");

        let video_index = Arc::new(RwLock::new(VideoIndex::new()));
        let (cache_manager_tx, mut cache_manager_rx) = channel::<CacheMsg>(100);

        // Initial index build
        {
            let mut index = video_index.write().await;
            index.refresh_index(&screenpipe_dir).await?;
        }

        // Spawn index refresh and preload task
        let refresh_index = video_index.clone();
        let refresh_dir = screenpipe_dir.clone();
        let cache = Self {
            screenpipe_dir: screenpipe_dir.clone(),
            config: config.clone(),
            video_index: video_index.clone(),
            cache_manager_tx: cache_manager_tx.clone(),
            db: db.clone(),
        };
        let cache_clone = cache.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
            loop {
                interval.tick().await;

                // Refresh index
                {
                    let mut index = refresh_index.write().await;
                    if let Err(e) = index.refresh_index(&refresh_dir).await {
                        error!("failed to refresh index: {}", e);
                    }
                }

                let now = Utc::now();

                // Preload high-res recent frames (last 5 minutes)
                let hi_res_start = now - Duration::minutes(5);
                if let Err(e) = cache.preload_frames(&hi_res_start, &now, false).await {
                    error!("failed to preload high-res frames: {}", e);
                }

                // Preload low-res frames (last hour)
                let low_res_start = now - Duration::minutes(60);
                if let Err(e) = cache.preload_frames(&low_res_start, &now, true).await {
                    error!("failed to preload low-res frames: {}", e);
                }

                debug!("index refresh and frame preload complete (both hi-res and low-res)");
            }
        });

        tokio::spawn(async move {
            let mut manager = FrameCacheManager::new();
            while let Some(msg) = cache_manager_rx.recv().await {
                manager.handle_message(msg);
            }
        });

        Ok(cache_clone)
    }

    async fn extract_frames_batch(
        &self,
        file_path: &str,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        fps: f32,
        frame_tx: FrameChannel,
        is_preview: bool,
    ) -> Result<()> {
        let ffmpeg = find_ffmpeg_path().ok_or_else(|| anyhow::anyhow!("ffmpeg not found"))?;

        let scale_filter = if is_preview {
            "scale=640:-1"
        } else {
            "scale=1280:-1"
        };

        let duration = (end_time - start_time).num_seconds();

        let mut cmd = Command::new(ffmpeg);
        cmd.args([
            "-i",
            file_path,
            "-ss",
            "0",
            "-t",
            &duration.to_string(),
            "-vf",
            &format!("{},fps={}", scale_filter, fps),
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-q:v",
            if is_preview { "8" } else { "3" },
            "-",
        ]);

        let mut child = cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("failed to get stdout"))?;

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

        let mut reader = BufReader::new(stdout);
        let frame_extraction = async {
            let mut frame_count = 0;
            let mut frame_time = start_time;
            let frame_interval = Duration::milliseconds((1000.0 / fps) as i64);

            let metadata = self
                .db
                .get_frame_metadata(file_path)
                .await
                .unwrap_or_default();

            debug!("found {} metadata entries in {}", metadata.len(), file_path);

            let mut magic = [0u8; 2];
            let mut error_count = 0;
            const MAX_ERRORS: u32 = 3;

            while reader.read_exact(&mut magic).await.is_ok() {
                if magic != [0xFF, 0xD8] {
                    continue;
                }

                let mut frame_data = vec![0xFF, 0xD8];
                let mut buf = [0u8; 1];
                let mut last_byte = 0u8;

                while reader.read_exact(&mut buf).await.is_ok() {
                    frame_data.push(buf[0]);
                    if last_byte == 0xFF && buf[0] == 0xD9 {
                        if let Err(e) = frame_tx
                            .send((
                                frame_time,
                                frame_data,
                                file_path.to_string(),  
                                metadata
                                    .get(frame_count)
                                    .map_or("".to_string(), |(app, _)| app.clone()),
                                metadata
                                    .get(frame_count)
                                    .map_or("".to_string(), |(_, win)| win.clone()),
                            ))
                            .await
                        {
                            error_count += 1;
                            error!("failed to send frame: {}", e);

                            if error_count >= MAX_ERRORS {
                                debug!("channel appears closed, stopping extraction");
                                return Ok(());
                            }
                        }

                        frame_count += 1;
                        frame_time = start_time + frame_interval * (frame_count as i32);
                        break;
                    }
                    last_byte = buf[0];
                }
            }

            Ok(())
        };

        // Add 30 second timeout
        match tokio::time::timeout(std::time::Duration::from_secs(30), frame_extraction).await {
            Ok(result) => result,
            Err(_) => {
                // Force kill the ffmpeg process
                let _ = child.kill().await;
                Err(anyhow::anyhow!(
                    "frame extraction timed out after 30 seconds"
                ))
            }
        }?;

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
        frame_tx: FrameChannel,
    ) -> Result<()> {
        let chunks = self.find_video_chunks(*start, *end).await?;

        for chunk in chunks {
            if !self.is_video_file_complete(&chunk.file_path).await {
                continue;
            }

            if let Err(e) = self
                .extract_frames_batch(
                    &chunk.file_path,
                    chunk.start_time,
                    chunk.end_time,
                    self.config.fps,
                    frame_tx.clone(),
                    false,
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
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<VideoChunk>> {
        debug!("finding video chunks from {} to {}", start, end);
        let index = self.video_index.read().await;

        let chunks: Vec<VideoChunk> = index
            .find_files_in_range(start, end)
            .iter()
            .filter(|file| file.is_complete)
            .map(|file| VideoChunk {
                file_path: file.path.to_string_lossy().to_string(),
                start_time: file.start_time,
                end_time: file.end_time,
            })
            .collect();

        debug!(
            "found {} chunks between {} and {}",
            chunks.len(),
            start,
            end
        );

        Ok(chunks)
    }

    async fn preload_frames(
        &self,
        start: &DateTime<Utc>,
        end: &DateTime<Utc>,
        is_preview: bool,
    ) -> Result<()> {
        debug!("preloading frames from {} to {}", start, end);

        let (frame_tx, mut frame_rx) = channel(100);

        let chunks = self.find_video_chunks(*start, *end).await?;
        debug!("found {} chunks to process", chunks.len());

        if chunks.is_empty() {
            debug!("no video chunks found for the requested time range");
            return Ok(());
        }

        for chunk in chunks {
            debug!("processing chunk: {}", chunk.file_path);

            if let Err(e) = self
                .extract_frames_batch(
                    &chunk.file_path,
                    chunk.start_time,
                    chunk.end_time,
                    self.config.fps,
                    frame_tx.clone(),
                    is_preview,
                )
                .await
            {
                error!("failed to extract frames from {}: {}", chunk.file_path, e);
            }
        }

        while let Some((timestamp, frame_data, file_path, app_name, window_name)) =
            frame_rx.recv().await
        {
            let frame = PreviewFrame {
                timestamp,
                data: Arc::new(frame_data),
                file_path,
                app_name,
                window_name,
                is_preview,
            };

            let _ = self
                .cache_manager_tx
                .send(CacheMsg::InsertFrame(timestamp.timestamp(), frame))
                .await;
        }

        Ok(())
    }

    pub async fn get_frames(
        &self,
        timestamp: DateTime<Utc>,
        duration_minutes: i64,
        frame_tx: Sender<FrameInfo>,
    ) -> Result<()> {
        let start = timestamp - Duration::minutes(duration_minutes / 2);
        let end = timestamp + Duration::minutes(duration_minutes / 2);

        let (extract_tx, mut extract_rx) = channel(100);

        let cache_clone = self.clone();
        let extract_handle = tokio::spawn(async move {
            cache_clone
                .extract_frames_range(&start, &end, extract_tx)
                .await
        });

        // Forward frames to the provided channel
        while let Some((timestamp, data, _, app_name, window_name)) = extract_rx.recv().await {
            frame_tx
                .send(FrameInfo {
                    timestamp,
                    data,
                    app_name,
                    window_name,
                })
                .await?;
        }

        extract_handle.await??;
        Ok(())
    }
}
