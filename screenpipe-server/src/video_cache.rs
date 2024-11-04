use anyhow::Result;
use bincode;
use chrono::{DateTime, Duration, Utc};
use dirs::cache_dir;
use screenpipe_core::find_ffmpeg_path;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::fs;
use tokio::process::Command;
use tokio::sync::mpsc::Sender;
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, error};

use crate::db::{FrameData, OCREntry};
use crate::DatabaseManager;

type FrameChannel = mpsc::Sender<TimeSeriesFrame>;

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

#[derive(Debug)]
enum CacheMessage {
    Store {
        cache_key: String,
        frame_data: Vec<u8>,
        device_data: OCREntry,
        audio_entries: Vec<AudioEntry>,
        response: oneshot::Sender<Result<()>>,
    },
    Get {
        cache_key: String,
        response:
            oneshot::Sender<Result<Option<(Vec<u8>, FrameMetadata, (DateTime<Utc>, String))>>>,
    },
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
struct CacheEntry {
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

struct FrameDiskCache {
    config: CacheConfig,
    entries: BTreeMap<(DateTime<Utc>, String), CacheEntry>,
    total_size: u64,
    index_path: PathBuf,
}

impl FrameDiskCache {
    async fn new(config: CacheConfig) -> Result<Self> {
        let cache_dir = &config.cache_dir;
        let index_path = cache_dir.join("cache_index.bin");

        fs::create_dir_all(cache_dir).await?;

        let mut cache = Self {
            config,
            entries: BTreeMap::new(),
            total_size: 0,
            index_path,
        };

        if cache.index_path.exists() {
            if let Err(e) = cache.load_index().await {
                debug!("could not load existing cache index: {}", e);
                cache.entries.clear();
                cache.total_size = 0;
            }
        } else {
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
                Err(e) => error!("failed to deserialize cache index: {}", e),
            },
            Ok(_) => debug!("cache index is empty, starting fresh"),
            Err(e) => error!("failed to read cache index: {}", e),
        }
        Ok(())
    }

    async fn save_index(&self) -> Result<()> {
        let frames: Vec<_> = self.entries.values().map(|entry| &entry.frame).collect();
        let temp_path = self.index_path.with_extension("tmp");
        let encoded = if frames.is_empty() {
            bincode::serialize(&Vec::<CachedFrame>::new())?
        } else {
            bincode::serialize(&frames)?
        };

        fs::write(&temp_path, encoded).await?;
        fs::rename(&temp_path, &self.index_path).await?;
        Ok(())
    }

    async fn store_frame(
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

        if let Some(parent) = frame_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let mut hasher = Sha256::new();
        hasher.update(frame_data);
        let checksum = format!("{:x}", hasher.finalize());

        let cached_frame = CachedFrame {
            timestamp: timestamp.into(),
            device_id: device_id.to_string(),
            checksum,
            metadata: FrameMetadata {
                file_path: device_data.video_file_path.clone(),
                app_name: device_data.app_name.clone(),
                window_name: device_data.window_name.clone(),
                transcription: audio_entries
                    .iter()
                    .map(|a| a.transcription.clone())
                    .collect::<Vec<_>>()
                    .join(" "),
                ocr_text: device_data.text.clone(),
            },
            frame_size: frame_data.len() as u64,
            compression: CompressionType::Jpeg {
                quality: self.config.compression_quality,
            },
            source_video: device_data.video_file_path,
            cached_at: Utc::now(),
            audio_entries: audio_entries.to_vec(),
        };

        fs::write(&frame_path, frame_data).await?;

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

    async fn get_frame_data(
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

async fn run_cache_manager(mut cache: FrameDiskCache, mut rx: mpsc::Receiver<CacheMessage>) {
    while let Some(msg) = rx.recv().await {
        match msg {
            CacheMessage::Store {
                cache_key,
                frame_data,
                device_data,
                audio_entries,
                response,
            } => {
                let result = cache
                    .store_frame(&cache_key, &frame_data, device_data, &audio_entries)
                    .await;
                let _ = response.send(result);
            }
            CacheMessage::Get {
                cache_key,
                response,
            } => {
                let result = cache.get_frame_data(&cache_key).await;
                let _ = response.send(result);
            }
        }
    }
}

#[derive(Clone)]
pub struct FrameCache {
    pub screenpipe_dir: PathBuf,
    cache_tx: mpsc::Sender<CacheMessage>,
    db: Arc<DatabaseManager>,
}

impl FrameCache {
    pub async fn new(screenpipe_dir: PathBuf, db: Arc<DatabaseManager>) -> Result<Self> {
        let cache_config = CacheConfig {
            cache_dir: cache_dir().unwrap().join("screenpipe").join("frames"),
            ..Default::default()
        };

        fs::create_dir_all(&cache_config.cache_dir).await?;

        let (cache_tx, cache_rx) = mpsc::channel(100);
        let disk_cache = FrameDiskCache::new(cache_config).await?;

        tokio::spawn(run_cache_manager(disk_cache, cache_rx));

        Ok(Self {
            screenpipe_dir,
            cache_tx,
            db,
        })
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

        let mut chunks = self.db.find_video_chunks(start_time, end_time).await?;
        
        // Sort frames in descending order by timestamp
        chunks.frames.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        
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

        for chunk in &chunks.frames {
            let mut timeseries_frame = TimeSeriesFrame {
                timestamp: chunk.timestamp,
                frame_data: Vec::new(),
            };

            for device_data in &chunk.ocr_entries {
                let cache_key = format!("{}||{}", chunk.timestamp, device_data.device_name);

                let (response_tx, response_rx) = oneshot::channel();
                self.cache_tx
                    .send(CacheMessage::Get {
                        cache_key: cache_key.clone(),
                        response: response_tx,
                    })
                    .await?;

                if let Ok(Some((frame_data, metadata, _))) = response_rx.await? {
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
                    extraction_queue
                        .entry(device_data.video_file_path.clone())
                        .or_insert_with(Vec::new)
                        .push((chunk.clone(), device_data.clone()));
                }
            }

            if !timeseries_frame.frame_data.is_empty() {
                frame_tx.send(timeseries_frame).await?;
            }
        }

        let ffmpeg = find_ffmpeg_path().ok_or_else(|| anyhow::anyhow!("ffmpeg not found"))?;

        for (file_path, tasks) in extraction_queue {
            extract_frame(
                ffmpeg.clone(),
                file_path,
                tasks,
                frame_tx.clone(),
                self.cache_tx.clone(),
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

        let (extract_tx, mut extract_rx) = mpsc::channel(100);

        let mut extraction_handle = {
            let cache_clone = self.clone();
            tokio::spawn(async move {
                let result = cache_clone
                    .extract_frames_batch(start, end, extract_tx)
                    .await;
                debug!("extraction task finished with result: {:?}", result.is_ok());
                result
            })
        };

        // 30 s x duration of the requested time range
        let timeout_duration = tokio::time::Duration::from_secs(10 * duration_minutes as u64);
        let result = tokio::time::timeout(timeout_duration, async {
            loop {
                tokio::select! {
                    maybe_frame = extract_rx.recv() => {
                        match maybe_frame {
                            Some(frame) => {
                                if let Err(e) = frame_tx.send(frame).await {
                                    debug!("client channel closed, stopping: {}", e);
                                    break;
                                }
                            }
                            None => {
                                debug!("extraction channel closed, stopping");
                                break;
                            }
                        }
                    }
                    result = &mut extraction_handle => {
                        match result {
                            Ok(Ok(())) => debug!("extraction task completed successfully"),
                            Ok(Err(e)) => debug!("extraction task failed: {}", e),
                            Err(e) => debug!("extraction task panicked: {}", e),
                        }
                        break;
                    }
                }
            }
        })
        .await;

        match result {
            Ok(_) => Ok(()),
            Err(_) => {
                debug!(
                    "frame extraction timed out after {} seconds",
                    timeout_duration.as_secs()
                );
                // Err(anyhow::anyhow!("frame extraction timed out"))
                Ok(())
            }
        }
    }
}

async fn extract_frame(
    ffmpeg: PathBuf,
    video_file_path: String,
    tasks: Vec<(FrameData, OCREntry)>,
    frame_tx: FrameChannel,
    cache_tx: mpsc::Sender<CacheMessage>,
) -> Result<()> {
    if !is_video_file_complete(&ffmpeg, &video_file_path).await? {
        debug!("skipping incomplete video file: {}", video_file_path);
        return Ok(());
    }

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

    let mut entries = tokio::fs::read_dir(temp_dir.path()).await?;
    while let Some(entry) = entries.next_entry().await? {
        let frame_data = tokio::fs::read(entry.path()).await?;

        debug!(
            "extracted frame of size {} bytes from {}",
            frame_data.len(),
            video_file_path
        );

        let mut frames_by_timestamp: HashMap<DateTime<Utc>, Vec<DeviceFrame>> = HashMap::new();

        for (chunk, device_data) in &tasks {
            let cache_key = format!("{}||{}", chunk.timestamp, device_data.device_name);

            let (response_tx, response_rx) = oneshot::channel();
            cache_tx
                .send(CacheMessage::Store {
                    cache_key: cache_key.clone(),
                    frame_data: frame_data.clone(),
                    device_data: device_data.clone(),
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
                    response: response_tx,
                })
                .await?;

            response_rx.await??;
            debug!("cached frame for {}", device_data.device_name);

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
