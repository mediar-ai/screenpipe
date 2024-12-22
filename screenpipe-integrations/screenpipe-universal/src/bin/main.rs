use anyhow::{Context, Result};
use btleplug::api::{
    Central, CentralEvent, Characteristic, Manager, Peripheral, ScanFilter, WriteType,
};
use btleplug::platform;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::{
    io::AsyncReadExt,
    process::Command,
    sync::mpsc,
    time::{sleep, Duration},
};
use tracing::{error, info, warn};
use uuid::Uuid;

const BUFFER_DIR: &str = "/tmp/screenpipe_buffer";
const CHUNK_DURATION_SECS: u64 = 30;
const FPS: u32 = 1;
const MAX_BUFFER_SIZE_GB: u64 = 2; // 2GB max buffer
const BLUETOOTH_CHUNK_SIZE: usize = 512; // BLE typically has small MTU
const MAX_RETRIES: u32 = 3;
const RETRY_DELAY: Duration = Duration::from_secs(5);
const TRANSFER_CHARACTERISTIC_UUID: u128 = 0x6E400002_B5A3_F393_E0A9_E50E24DCCA9E; // Custom UUID for data transfer

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CaptureChunk {
    id: Uuid,
    start_time: DateTime<Utc>,
    video_path: PathBuf,
    audio_path: PathBuf,
    device_name: String,
    chunk_size: u64,
    duration_ms: u64,
    sync_status: SyncStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
enum SyncStatus {
    Pending,
    InProgress,
    Completed,
    Failed(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TransferMetadata {
    chunk_info: CaptureChunk,
    total_size: u64,
    file_type: FileType,
    sequence_number: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
enum FileType {
    Video,
    Audio,
}

struct CaptureManager {
    buffer_dir: PathBuf,
    current_chunk: Option<CaptureChunk>,
    sync_tx: mpsc::Sender<CaptureChunk>,
}

impl CaptureManager {
    async fn new(sync_tx: mpsc::Sender<CaptureChunk>) -> Result<Self> {
        let buffer_dir = PathBuf::from(BUFFER_DIR);
        tokio::fs::create_dir_all(&buffer_dir).await?;

        // Test HDMI capture device
        let hdmi_device = find_hdmi_device().await?;
        println!("found hdmi capture device: {}", hdmi_device);

        // Test capture capabilities
        let output = Command::new("ffmpeg")
            .args(["-f", "v4l2", "-list_formats", "all", "-i", &hdmi_device])
            .output()
            .await?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "hdmi device test failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(Self {
            buffer_dir,
            current_chunk: None,
            sync_tx,
        })
    }

    async fn start_capture_loop(&mut self) -> Result<()> {
        info!("starting hdmi capture loop");

        loop {
            self.cleanup_old_files().await?;

            let chunk = CaptureChunk {
                id: Uuid::new_v4(),
                start_time: Utc::now(),
                video_path: self
                    .buffer_dir
                    .join(format!("{}_video.mp4", Uuid::new_v4())),
                audio_path: self
                    .buffer_dir
                    .join(format!("{}_audio.wav", Uuid::new_v4())),
                device_name: String::new(),
                chunk_size: 0,
                duration_ms: 0,
                sync_status: SyncStatus::Pending,
            };

            info!("starting new capture chunk: {:?}", chunk.id);

            self.current_chunk = Some(chunk);
            let chunk = self.current_chunk.as_ref().unwrap();

            // Start captures
            let mut video_handle = self.start_video_capture(&chunk.video_path).await?;
            let mut audio_handle = self.start_audio_capture(&chunk.audio_path).await?;

            // Wait for duration
            sleep(Duration::from_secs(CHUNK_DURATION_SECS)).await;

            // Stop captures
            video_handle.kill().await?;
            audio_handle.kill().await?;

            // Send for sync
            if let Some(chunk) = self.current_chunk.take() {
                if let Err(e) = self.sync_tx.send(chunk).await {
                    error!("failed to send chunk for sync: {:?}", e);
                }
            }
        }
    }

    async fn start_video_capture(&self, output_path: &PathBuf) -> Result<tokio::process::Child> {
        Command::new("ffmpeg")
            .args([
                "-f",
                "v4l2",
                "-framerate",
                &FPS.to_string(),
                "-video_size",
                "1920x1080",
                "-i",
                "/dev/video1",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "18",
                output_path.to_str().unwrap(),
            ])
            .spawn()
            .context("failed to start hdmi capture")
    }

    async fn start_audio_capture(&self, output_path: &PathBuf) -> Result<tokio::process::Child> {
        Command::new("ffmpeg")
            .args([
                "-f",
                "alsa",
                "-i",
                "hw:0",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "44100",
                output_path.to_str().unwrap(),
            ])
            .spawn()
            .context("failed to start audio capture")
    }

    async fn cleanup_old_files(&self) -> Result<()> {
        let mut total_size = 0u64;
        let mut files = Vec::new();

        let mut entries = tokio::fs::read_dir(&self.buffer_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            total_size += metadata.len();
            files.push((entry.path(), metadata.modified()?));
        }

        // If we're over limit, remove oldest files
        if total_size > MAX_BUFFER_SIZE_GB * 1024 * 1024 * 1024 {
            files.sort_by_key(|(_, modified)| *modified);

            for (path, _) in files.iter().take(files.len() / 2) {
                tokio::fs::remove_file(path).await?;
                warn!("removed old file: {:?}", path);
            }
        }

        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt::init();
    info!("starting iphone capture service");

    // Channel for sync communication
    let (sync_tx, mut sync_rx) = mpsc::channel(100);

    // Start capture manager
    let mut manager = CaptureManager::new(sync_tx).await?;

    // Spawn sync handler
    tokio::spawn(async move {
        while let Some(chunk) = sync_rx.recv().await {
            match sync_chunk(&chunk).await {
                Ok(_) => info!("successfully synced chunk: {:?}", chunk.id),
                Err(e) => error!("failed to sync chunk: {:?}", e),
            }
        }
    });

    // Run main capture loop
    manager.start_capture_loop().await?;

    Ok(())
}

async fn sync_chunk(chunk: &CaptureChunk) -> Result<()> {
    let mut retry_count = 0;

    while retry_count < MAX_RETRIES {
        match attempt_sync(chunk).await {
            Ok(_) => {
                println!("successfully synced chunk: {}", chunk.id);
                return Ok(());
            }
            Err(e) => {
                retry_count += 1;
                if retry_count < MAX_RETRIES {
                    println!(
                        "sync attempt {} failed: {}, retrying in {} seconds...",
                        retry_count,
                        e,
                        RETRY_DELAY.as_secs()
                    );
                    sleep(RETRY_DELAY).await;
                } else {
                    return Err(e).context("max retries exceeded for sync");
                }
            }
        }
    }

    Ok(())
}

async fn attempt_sync(chunk: &CaptureChunk) -> Result<()> {
    let manager = platform::Manager::new().await?;
    let adapter = manager
        .adapters()
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no bluetooth adapter found"))?;

    println!("scanning for mac devices...");
    adapter.start_scan(ScanFilter::default()).await?;

    let mut events = adapter.events().await?;
    let mut found_mac = false;

    while let Some(event) = events.next().await {
        if let CentralEvent::DeviceDiscovered(id) = event {
            let peripheral = adapter.peripheral(&id).await?;

            if let Some(properties) = peripheral.properties().await? {
                if let Some(name) = properties.local_name {
                    if name.contains("MacBook") {
                        found_mac = true;
                        println!("found mac device: {}", name);
                        match transfer_chunk(&peripheral, chunk).await {
                            Ok(_) => return Ok(()),
                            Err(e) => {
                                println!("transfer failed: {}", e);
                                // Let the retry mechanism handle it
                                return Err(e);
                            }
                        }
                    }
                }
            }
        }
    }

    if !found_mac {
        return Err(anyhow::anyhow!("no mac found during scan"));
    }

    Ok(())
}

async fn transfer_chunk(peripheral: &platform::Peripheral, chunk: &CaptureChunk) -> Result<()> {
    println!("connecting to mac...");
    peripheral.connect().await?;

    // Find our custom service/characteristic
    let chars = peripheral.characteristics();
    let transfer_char = chars
        .iter()
        .find(|c| c.uuid == Uuid::from_u128(TRANSFER_CHARACTERISTIC_UUID))
        .ok_or_else(|| anyhow::anyhow!("transfer characteristic not found"))?;

    // Transfer video file
    println!("transferring video file...");
    transfer_file(
        peripheral,
        transfer_char,
        chunk,
        &chunk.video_path,
        FileType::Video,
    )
    .await?;

    // Transfer audio file
    println!("transferring audio file...");
    transfer_file(
        peripheral,
        transfer_char,
        chunk,
        &chunk.audio_path,
        FileType::Audio,
    )
    .await?;

    println!("transfer completed for chunk: {}", chunk.id);
    Ok(())
}

async fn transfer_file(
    peripheral: &platform::Peripheral,
    characteristic: &Characteristic,
    chunk: &CaptureChunk,
    file_path: &PathBuf,
    file_type: FileType,
) -> Result<()> {
    let file_size = tokio::fs::metadata(file_path).await?.len();
    let mut file = tokio::fs::File::open(file_path).await?;
    let mut sequence_number = 0;
    let mut bytes_transferred = 0;

    // Send initial metadata
    let metadata = TransferMetadata {
        chunk_info: chunk.clone(),
        total_size: file_size,
        file_type: file_type.clone(),
        sequence_number: 0,
    };

    let metadata_bytes = serde_json::to_vec(&metadata)?;
    peripheral
        .write(characteristic, &metadata_bytes, WriteType::WithResponse)
        .await?;

    // Transfer file in chunks
    let mut buffer = vec![0u8; BLUETOOTH_CHUNK_SIZE];
    while let Ok(n) = file.read(&mut buffer).await {
        if n == 0 {
            break;
        }

        sequence_number += 1;
        bytes_transferred += n as u64;

        // Prepare chunk header
        let header = TransferMetadata {
            chunk_info: chunk.clone(),
            total_size: file_size,
            file_type: file_type.clone(),
            sequence_number,
        };

        // Combine header and data
        let mut packet = serde_json::to_vec(&header)?;
        packet.extend_from_slice(&buffer[..n]);

        // Send with retry mechanism
        let mut retry_count = 0;
        while retry_count < MAX_RETRIES {
            match peripheral
                .write(characteristic, &packet, WriteType::WithResponse)
                .await
            {
                Ok(_) => break,
                Err(e) => {
                    retry_count += 1;
                    if retry_count == MAX_RETRIES {
                        return Err(anyhow::anyhow!(
                            "failed to send chunk after {} retries: {}",
                            MAX_RETRIES,
                            e
                        ));
                    }
                    println!("retry {} for sequence {}", retry_count, sequence_number);
                    sleep(RETRY_DELAY).await;
                }
            }
        }

        // Print progress
        let progress = (bytes_transferred as f64 / file_size as f64 * 100.0) as u32;
        println!(
            "transfer progress: {}% ({}/{} bytes)",
            progress, bytes_transferred, file_size
        );
    }

    Ok(())
}

async fn find_hdmi_device() -> Result<String> {
    let output = Command::new("v4l2-ctl")
        .args(["--list-devices"])
        .output()
        .await?;

    let devices = String::from_utf8_lossy(&output.stdout);

    // Look for HDMI capture device
    for line in devices.lines() {
        if line.to_lowercase().contains("hdmi") || line.to_lowercase().contains("capture") {
            // Usually the device path is on the next line
            if let Some(device_path) = line.lines().next() {
                if device_path.starts_with("/dev/video") {
                    return Ok(device_path.to_string());
                }
            }
        }
    }

    Err(anyhow::anyhow!("no hdmi capture device found"))
}
