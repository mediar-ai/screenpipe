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
use bincode;
use chrono::{DateTime, Duration, Utc};
use dirs::cache_dir;
use screenpipe_core::find_ffmpeg_path;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::fs;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;
use tokio::sync::mpsc::{channel, Sender};
use tokio::sync::RwLock;
use tracing::{debug, error};

use crate::db::{FrameData, OCREntry};
use crate::DatabaseManager;

type FrameChannel = Sender<TimeSeriesFrame>;

#[derive(Debug, Clone)]
pub struct TimeSeriesFrame {
    pub timestamp: DateTime<Utc>,
    pub frame_data: Vec<DeviceFrame>,
}

#[derive(Debug, Clone)]
pub struct DeviceFrame {
    pub device_id: String,
    pub image_data: Vec<u8>,
    pub metadata: FrameMetadata,
    pub audio_entries: Vec<AudioEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioEntry {
    pub transcription: String,
    pub device_name: String,
    pub is_input: bool,
    pub audio_file_path: String,
    pub duration_secs: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameMetadata {
    pub file_path: String,
    pub app_name: String,
    pub window_name: String,
    pub transcription: String,
    pub ocr_text: String,
}

pub struct FrameInfo {
    pub timestamp: DateTime<Utc>,
    pub data: Vec<u8>,
    pub metadata: FrameMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
struct CachedFrame {
    #[serde(with = "chrono::serde::ts_microseconds")]
    timestamp: DateTime<Utc>,
    device_id: String,
    checksum: String,
    metadata: FrameMetadata,
    frame_size: u64,
    compression: CompressionType,
    source_video: String,
    #[serde(with = "chrono::serde::ts_microseconds")]
    cached_at: DateTime<Utc>,
    audio_entries: Vec<AudioEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
enum CompressionType {
    Jpeg { quality: u8 },
}

#[derive(Debug)]
pub struct CacheEntry {
    frame: CachedFrame,
    path: PathBuf,
    last_accessed: SystemTime,
}

#[derive(Debug, Clone)]
struct CacheConfig {
    cache_dir: PathBuf,
    max_cache_size_gb: f64,
    frame_retention_days: u64,
    compression_quality: u8,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            cache_dir: PathBuf::from("frame_cache"),
            max_cache_size_gb: 10.0,
            frame_retention_days: 7,
            compression_quality: 85,
        }
    }
}

pub struct FrameDiskCache {
    config: CacheConfig,
    entries: BTreeMap<(DateTime<Utc>, String), CacheEntry>,
    total_size: u64,
    index_path: PathBuf,
}

impl FrameDiskCache {
    async fn new(config: CacheConfig) -> Result<Self> {
        let cache_dir = &config.cache_dir;
        let index_path = cache_dir.join("cache_index.bin");

        // Ensure cache directory exists
        fs::create_dir_all(cache_dir).await?;

        // Initialize empty cache
        let mut cache = Self {
            config,
            entries: BTreeMap::new(),
            total_size: 0,
            index_path,
        };

        // Try to load existing index, but don't fail if it doesn't exist
        if cache.index_path.exists() {
            if let Err(e) = cache.load_index().await {
                debug!("could not load existing cache index: {}", e);
                // Clear any partial data
                cache.entries.clear();
                cache.total_size = 0;
            }
        } else {
            // Create empty index file
            cache.save_index().await?;
        }

        Ok(cache)
    }

    async fn load_index(&mut self) -> Result<()> {
        match fs::read(&self.index_path).await {
            Ok(data) if !data.is_empty() => match bincode::deserialize::<Vec<CachedFrame>>(&data) {
                Ok(frames) => {
                    for frame in frames {
                        let path = self.get_frame_path(&frame.timestamp, &frame.device_id);
                        if let Ok(metadata) = fs::metadata(&path).await {
                            self.entries.insert(
                                (frame.timestamp, frame.device_id.clone()),
                                CacheEntry {
                                    frame,
                                    path,
                                    last_accessed: metadata.accessed()?,
                                },
                            );
                            self.total_size += metadata.len();
                        }
                    }
                    debug!("loaded {} cached frames", self.entries.len());
                }
                Err(e) => {
                    error!("failed to deserialize cache index: {}", e);
                }
            },
            Ok(_) => {
                debug!("cache index is empty, starting fresh");
            }
            Err(e) => {
                error!("failed to read cache index: {}", e);
            }
        }
        Ok(())
    }

    async fn save_index(&self) -> Result<()> {
        let frames: Vec<_> = self.entries.values().map(|entry| &entry.frame).collect();
        let temp_path = self.index_path.with_extension("tmp");

        // Initialize with empty Vec if no frames
        let encoded = if frames.is_empty() {
            bincode::serialize(&Vec::<CachedFrame>::new())?
        } else {
            bincode::serialize(&frames)?
        };

        // Write to temporary file
        fs::write(&temp_path, encoded)
            .await
            .map_err(|e| anyhow::anyhow!("failed to write temp index: {}", e))?;

        // Atomically rename
        fs::rename(&temp_path, &self.index_path)
            .await
            .map_err(|e| anyhow::anyhow!("failed to rename temp index: {}", e))?;

        Ok(())
    }

    pub async fn store_frame(
        &mut self,
        cache_key: &str,
        frame_data: &[u8],
        device_data: OCREntry,
        audio_entries: &[AudioEntry],
    ) -> Result<()> {
        debug!("storing frame with cache key: {}", cache_key);
        let (timestamp_str, device_id) = cache_key
            .split_once("||")
            .ok_or_else(|| anyhow::anyhow!("invalid cache key format"))?;

        // Clean up the timestamp string
        let clean_timestamp = timestamp_str
            .trim_end_matches(" UTC")
            .replace(' ', "T")
            .trim()
            .to_string();

        let clean_timestamp = if !clean_timestamp.ends_with('Z') && !clean_timestamp.contains('+') {
            format!("{}Z", clean_timestamp)
        } else {
            clean_timestamp
        };

        let timestamp = DateTime::parse_from_rfc3339(&clean_timestamp).map_err(|e| {
            anyhow::anyhow!("failed to parse timestamp '{}': {}", clean_timestamp, e)
        })?;

        let frame_path = self.get_frame_path(&timestamp.into(), device_id);

        // Ensure parent directory exists
        if let Some(parent) = frame_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Calculate checksum
        let mut hasher = Sha256::new();
        hasher.update(frame_data);
        let checksum = format!("{:x}", hasher.finalize());

        // Create cached frame entry
        let cached_frame = CachedFrame {
            timestamp: timestamp.into(),
            device_id: device_id.to_string(),
            checksum,
            metadata: FrameMetadata {
                file_path: device_data.video_file_path.clone(),
                app_name: device_data.app_name,
                window_name: device_data.window_name,
                transcription: audio_entries
                    .iter()
                    .map(|a| a.transcription.clone())
                    .collect::<Vec<_>>()
                    .join(" "),
                ocr_text: device_data.text,
            },
            frame_size: frame_data.len() as u64,
            compression: CompressionType::Jpeg {
                quality: self.config.compression_quality,
            },
            source_video: device_data.video_file_path,
            cached_at: Utc::now(),
            audio_entries: audio_entries.to_vec(),
        };

        // Write frame data
        fs::write(&frame_path, frame_data)
            .await
            .map_err(|e| anyhow::anyhow!("failed to write frame data: {}", e))?;

        // Update in-memory entries
        self.entries.insert(
            (timestamp.into(), device_id.to_string()),
            CacheEntry {
                frame: cached_frame,
                path: frame_path,
                last_accessed: SystemTime::now(),
            },
        );

        self.total_size += frame_data.len() as u64;
        self.save_index().await?;

        Ok(())
    }

    pub async fn get_frame_data(
        &self,
        cache_key: &str,
    ) -> Result<Option<(Vec<u8>, FrameMetadata, (DateTime<Utc>, String))>> {
        let (timestamp_str, device_id) = match cache_key.split_once("||") {
            Some(parts) => parts,
            None => return Ok(None),
        };

        let timestamp = match DateTime::parse_from_rfc3339(timestamp_str) {
            Ok(ts) => ts,
            Err(_) => return Ok(None),
        };

        let frame_path = self.get_frame_path(&timestamp.into(), device_id);

        if !frame_path.exists() {
            return Ok(None);
        }

        let frame_data = fs::read(&frame_path).await?;

        // Find the entry in our in-memory cache
        if let Some(entry) = self.entries.get(&(timestamp.into(), device_id.to_string())) {
            let mut hasher = Sha256::new();
            hasher.update(&frame_data);
            let checksum = format!("{:x}", hasher.finalize());

            if checksum != entry.frame.checksum {
                debug!("checksum mismatch for frame at {}:{}", timestamp, device_id);
                return Ok(None);
            }

            Ok(Some((
                frame_data,
                entry.frame.metadata.clone(),
                (timestamp.into(), device_id.to_string()),
            )))
        } else {
            Ok(None)
        }
    }

    fn get_frame_path(&self, timestamp: &DateTime<Utc>, device_id: &str) -> PathBuf {
        self.config.cache_dir.join(format!(
            "{}_{}.cache",
            timestamp.timestamp_micros(),
            device_id.replace(['/', '\\', ':'], "_")
        ))
    }
}

#[derive(Clone)]
pub struct FrameCache {
    pub screenpipe_dir: PathBuf,
    pub disk_cache: Arc<RwLock<FrameDiskCache>>,
    db: Arc<DatabaseManager>,
}

impl FrameCache {
    pub async fn new(screenpipe_dir: PathBuf, db: Arc<DatabaseManager>) -> Result<Self> {
        let cache_config = CacheConfig {
            cache_dir: cache_dir().unwrap().join("screenpipe").join("frames"),
            ..Default::default()
        };

        fs::create_dir_all(&cache_config.cache_dir).await?;

        let disk_cache = Arc::new(RwLock::new(FrameDiskCache::new(cache_config).await?));

        let cache = Self {
            screenpipe_dir: screenpipe_dir.clone(),
            disk_cache,
            db,
        };

        Ok(cache)
    }

    async fn extract_frames_batch(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        frame_tx: FrameChannel,
    ) -> Result<()> {
        let mut extraction_queue = HashMap::new();

        debug!(
            "extracting frames for time range: {} to {}",
            start_time, end_time
        );

        // First, get all the video chunks and organize by timestamp
        let chunks = self.db.find_video_chunks(start_time, end_time).await?;

        debug!("found {} chunks", chunks.frames.len());

        let frame_times = chunks
            .frames
            .iter()
            .map(|c| c.timestamp)
            .collect::<Vec<_>>();

        debug!(
            "🎯 requested time range: {} to {} ({} frames)",
            start_time,
            end_time,
            frame_times.len()
        );

        // Process each timestamp
        for chunk in &chunks.frames {
            let mut timeseries_frame = TimeSeriesFrame {
                timestamp: chunk.timestamp,
                frame_data: Vec::new(),
            };

            // Check cache first for each device - acquire lock only when needed
            for device_data in &chunk.ocr_entries {
                let cache_key = format!("{}:{}", chunk.timestamp, device_data.device_name);

                // Acquire read lock only for cache lookup
                if let Some((frame_data, metadata, _)) = self
                    .disk_cache
                    .read()
                    .await
                    .get_frame_data(&cache_key)
                    .await?
                {
                    timeseries_frame.frame_data.push(DeviceFrame {
                        device_id: device_data.device_name.clone(),
                        image_data: frame_data,
                        metadata,
                        audio_entries: chunk
                            .audio_entries
                            .iter()
                            .map(|a| AudioEntry {
                                transcription: a.transcription.clone(),
                                device_name: a.device_name.clone(),
                                is_input: a.is_input,
                                audio_file_path: a.audio_file_path.clone(),
                                duration_secs: a.duration_secs,
                            })
                            .collect(),
                    });
                } else {
                    // Cache miss - queue for extraction
                    extraction_queue
                        .entry(device_data.video_file_path.clone())
                        .or_insert_with(Vec::new)
                        .push((chunk.clone(), device_data.clone()));
                }
            }

            // If we have any frames for this timestamp, send them
            if !timeseries_frame.frame_data.is_empty() {
                frame_tx.send(timeseries_frame).await?;
            }
        }

        // Process extraction queue
        let ffmpeg = find_ffmpeg_path().ok_or_else(|| anyhow::anyhow!("ffmpeg not found"))?;

        // Process each task
        for (file_path, tasks) in extraction_queue {
            extract_frame(
                ffmpeg.clone(),
                file_path,
                tasks,
                frame_tx.clone(),
                self.disk_cache.clone(),
            )
            .await?;
        }
        debug!("extraction queue completed");

        Ok(())
    }

    pub async fn get_frames(
        &self,
        timestamp: DateTime<Utc>,
        duration_minutes: i64,
        frame_tx: Sender<TimeSeriesFrame>,
        _descending: bool,
    ) -> Result<()> {
        let start = timestamp - Duration::minutes(duration_minutes / 2);
        let end = timestamp + Duration::minutes(duration_minutes / 2);

        let (extract_tx, mut extract_rx) = channel(100);
        let done = Arc::new(AtomicBool::new(false));
        let done_clone = done.clone();

        let cache_clone = self.clone();
        let mut extract_handle = tokio::spawn(async move {
            debug!("starting frame extraction");
            let result = cache_clone
                .extract_frames_batch(start, end, extract_tx.clone())
                .await;
            // Explicitly drop the sender after extraction is done to finish the channel
            drop(extract_tx);
            done_clone.store(true, std::sync::atomic::Ordering::Release);
            debug!("frame extraction completed");
            result
        });

        // Create a select future that completes when either:
        // 1. We receive a frame from extract_rx
        // 2. The extract_handle completes
        loop {
            if done.load(std::sync::atomic::Ordering::Acquire) {
                break;
            }

            tokio::select! {
                frame = extract_rx.recv() => {
                    match frame {
                        Some(timeseries_frame) => {
                            debug!("sending frame at {} to client", timeseries_frame.timestamp);
                            frame_tx.send(timeseries_frame).await?;
                        }
                        None => break, // Channel closed, extraction complete
                    }
                }
                result = &mut extract_handle => {
                    result??; // Propagate any errors
                    break;
                }
            }
        }

        Ok(())
    }
}

async fn extract_frame(
    ffmpeg: PathBuf,
    video_file_path: String,
    tasks: Vec<(FrameData, OCREntry)>,
    frame_tx: FrameChannel,
    disk_cache: Arc<RwLock<FrameDiskCache>>,
) -> Result<()> {
    if !is_video_file_complete(&ffmpeg, &video_file_path).await? {
        debug!("skipping incomplete video file: {}", video_file_path);
        return Ok(());
    }

    // Extract ALL frames as separate JPEGs
    let temp_dir = tempfile::tempdir()?;
    let output_pattern = temp_dir.path().join("frame%d.jpg");

    let mut cmd = Command::new(&ffmpeg);
    cmd.args([
        "-i",
        &video_file_path,
        "-c:v",
        "mjpeg",
        "-q:v",
        "3",
        "-vsync",
        "0",
        output_pattern.to_str().unwrap(),
    ]);

    debug!("running ffmpeg command: {:?}", cmd);

    let output = cmd.output().await?;
    if !output.status.success() {
        error!("ffmpeg error: {}", String::from_utf8_lossy(&output.stderr));
        return Ok(());
    }

    // Read all frames
    let mut entries = tokio::fs::read_dir(temp_dir.path()).await?;
    while let Some(entry) = entries.next_entry().await? {
        let frame_data = tokio::fs::read(entry.path()).await?;

        debug!(
            "extracted frame of size {} bytes from {}",
            frame_data.len(),
            video_file_path
        );

        // Group frames by timestamp
        let mut frames_by_timestamp: HashMap<DateTime<Utc>, Vec<DeviceFrame>> = HashMap::new();

        // Process all tasks for this video file
        for (chunk, device_data) in &tasks {
            let cache_key = format!("{}||{}", chunk.timestamp, device_data.device_name);

            // Cache the frame
            {
                let mut cache = disk_cache.write().await;
                cache
                    .store_frame(
                        &cache_key,
                        &frame_data,
                        device_data.clone(),
                        &chunk
                            .audio_entries
                            .iter()
                            .map(|a| AudioEntry {
                                transcription: a.transcription.clone(),
                                device_name: a.device_name.clone(),
                                is_input: a.is_input,
                                audio_file_path: a.audio_file_path.clone(),
                                duration_secs: a.duration_secs,
                            })
                            .collect::<Vec<_>>(),
                    )
                    .await?;
                drop(cache);
            }
            debug!("cached frame for {}", device_data.device_name);

            // Group frames by timestamp
            frames_by_timestamp
                .entry(chunk.timestamp)
                .or_default()
                .push(DeviceFrame {
                    device_id: device_data.device_name.clone(),
                    image_data: frame_data.clone(),
                    metadata: FrameMetadata {
                        file_path: device_data.video_file_path.clone(),
                        app_name: device_data.app_name.clone(),
                        window_name: device_data.window_name.clone(),
                        transcription: chunk
                            .audio_entries
                            .iter()
                            .map(|a| a.transcription.clone())
                            .collect::<Vec<_>>()
                            .join(" "),
                        ocr_text: device_data.text.clone(),
                    },
                    audio_entries: chunk
                        .audio_entries
                        .iter()
                        .map(|a| AudioEntry {
                            transcription: a.transcription.clone(),
                            device_name: a.device_name.clone(),
                            is_input: a.is_input,
                            audio_file_path: a.audio_file_path.clone(),
                            duration_secs: a.duration_secs,
                        })
                        .collect(),
                });
        }

        // Send all frames for each timestamp
        for (timestamp, device_frames) in frames_by_timestamp {
            frame_tx
                .send(TimeSeriesFrame {
                    timestamp,
                    frame_data: device_frames,
                })
                .await?;
        }

        debug!("sent frames for entire video file {}", video_file_path);
    }

    debug!("extraction completed");

    Ok(())
}

async fn is_video_file_complete(ffmpeg_path: &PathBuf, file_path: &str) -> Result<bool> {
    if let Ok(metadata) = tokio::fs::metadata(file_path).await {
        if let Ok(modified) = metadata.modified() {
            let age = SystemTime::now()
                .duration_since(modified)
                .unwrap_or_default();
            if age.as_secs() < 60 {
                return Ok(false);
            }
        }
    }

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
            Ok(is_complete)
        }
        Err(e) => {
            debug!("failed to check file {}: {}", file_path, e);
            Ok(false)
        }
    }
}
