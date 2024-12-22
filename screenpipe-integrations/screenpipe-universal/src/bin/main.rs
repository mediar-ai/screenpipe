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

        // Find video device
        let hdmi_device = find_hdmi_device().await?;
        println!("found video capture device: {}", hdmi_device);

        // Test device exists but don't fail on format list
        if !tokio::fs::metadata(&hdmi_device).await.is_ok() {
            return Err(anyhow::anyhow!("video device not found: {}", hdmi_device));
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
        let video_device = find_working_video_device().await?;
        
        // Let ffmpeg auto-detect resolution instead of forcing 1920x1080
        Command::new("ffmpeg")
            .args([
                "-f",
                "v4l2",
                "-framerate",
                &FPS.to_string(),
                "-i",
                &video_device,
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "18",
                output_path.to_str().unwrap(),
            ])
            .spawn()
            .context("failed to start video capture")
    }

    async fn start_audio_capture(&self, output_path: &PathBuf) -> Result<tokio::process::Child> {
        // Try different audio capture methods in sequence
        let capture_configs = [
            // Try ALSA first in headless environment
            (vec![
                "-f", "alsa",
                "-i", "default",
                "-acodec", "pcm_s16le",
                "-ar", "44100",
            ]),
            // Fallback to specific ALSA device
            (vec![
                "-f", "alsa",
                "-i", "plughw:CARD=Device,DEV=0",
                "-acodec", "pcm_s16le",
                "-ar", "44100",
            ]),
            // Last resort: try OSS
            (vec![
                "-f", "oss",
                "-i", "/dev/dsp",
                "-acodec", "pcm_s16le",
                "-ar", "44100",
            ])
        ];

        let mut last_error = None;

        for config in capture_configs.iter() {
            let mut args = config.clone();
            args.push(output_path.to_str().unwrap());

            match Command::new("ffmpeg")
                .args(&args)
                .spawn()
            {
                Ok(child) => {
                    println!("audio capture started with config: {:?}", args);
                    return Ok(child);
                }
                Err(e) => {
                    println!("failed to start audio with config {:?}: {}", args, e);
                    last_error = Some(e);
                }
            }
        }

        // If we get here, none of the configs worked
        Err(anyhow::anyhow!("failed to start audio capture: {:?}", last_error))
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
                info!("successfully synced chunk: {}", chunk.id);
                return Ok(());
            }
            Err(e) => {
                retry_count += 1;
                if retry_count < MAX_RETRIES {
                    info!(
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

    info!("scanning for mac devices...");
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
                        info!("found mac device: {}", name);
                        match transfer_chunk(&peripheral, chunk).await {
                            Ok(_) => return Ok(()),
                            Err(e) => {
                                error!("transfer failed: {}", e);
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
    info!("connecting to mac...");
    peripheral.connect().await?;

    // Find our custom service/characteristic
    let chars = peripheral.characteristics();
    let transfer_char = chars
        .iter()
        .find(|c| c.uuid == Uuid::from_u128(TRANSFER_CHARACTERISTIC_UUID))
        .ok_or_else(|| anyhow::anyhow!("transfer characteristic not found"))?;

    // Transfer video file
    info!("transferring video file...");
    transfer_file(
        peripheral,
        transfer_char,
        chunk,
        &chunk.video_path,
        FileType::Video,
    )
    .await?;

    // Transfer audio file
    info!("transferring audio file...");
    transfer_file(
        peripheral,
        transfer_char,
        chunk,
        &chunk.audio_path,
        FileType::Audio,
    )
    .await?;

    info!("transfer completed for chunk: {}", chunk.id);
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
                    info!("retry {} for sequence {}", retry_count, sequence_number);
                    sleep(RETRY_DELAY).await;
                }
            }
        }

        // Print progress
        let progress = (bytes_transferred as f64 / file_size as f64 * 100.0) as u32;
        info!(
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
    println!("available video devices:\n{}", devices);

    // Try to find Cam Link 4K first
    for (i, line) in devices.lines().enumerate() {
        if line.contains("Cam Link 4K") {
            if let Some(next_line) = devices.lines().nth(i + 1) {
                return Ok(next_line.trim().to_string());
            }
        }
    }

    // Fallback: return first video device if no Cam Link found
    for line in devices.lines() {
        if line.trim().starts_with("/dev/video") {
            return Ok(line.trim().to_string());
        }
    }

    Err(anyhow::anyhow!("no video capture device found"))
}

async fn find_working_video_device() -> Result<String> {
    // Try different video devices
    for device in &["/dev/video0", "/dev/video1", "/dev/video2"] {
        let output = Command::new("ffmpeg")
            .args([
                "-f",
                "v4l2",
                "-list_formats",
                "all",
                "-i",
                device,
            ])
            .output()
            .await?;

        if output.status.success() || output.stderr.len() > 0 {
            // If we get format info, device likely works
            println!("found working video device: {}", device);
            return Ok(device.to_string());
        }
    }

    Err(anyhow::anyhow!("no working video device found"))
}

async fn find_working_audio_device() -> Result<String> {
    // Try to detect available audio devices
    let devices = [
        "default",
        "plughw:CARD=Device,DEV=0",
        "hw:0",
        "hw:1",
        "plughw:0,0",
    ];

    for device in &devices {
        let output = Command::new("arecord")
            .args([
                "-D",
                device,
                "--duration=1",
                "/dev/null"
            ])
            .output()
            .await?;

        if output.status.success() {
            println!("found working audio device: {}", device);
            return Ok(device.to_string());
        }
    }

    // If no device works, return default and let ffmpeg handle it
    println!("no working audio device found, falling back to default");
    Ok("default".to_string())
}
