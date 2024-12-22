use anyhow::{anyhow, Result};
use btleplug::api::{Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter};
use btleplug::platform::{Adapter, Manager, PeripheralId};
use chrono::{DateTime, Utc};
use futures::stream::StreamExt;
use screenpipe_audio::pcm_decode::pcm_decode_bytes;
use screenpipe_audio::{
    stt, AudioDevice, AudioTranscriptionEngine, DeviceType, GLOBAL_WHISPER_MODEL,
};
use screenpipe_core::Language;
use screenpipe_vision::core::OcrTaskData;
use screenpipe_vision::{process_ocr_task, OcrEngine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc::channel;
use tracing::info;
use uuid::Uuid;

use crate::DatabaseManager;

const SCREENPIPE_SERVICE_UUID: &str = "00000000-0000-1000-8000-00805F9B34FB"; // Replace with your actual UUID
const HDMI_STREAM_CHARACTERISTIC_UUID: &str = "00000001-0000-1000-8000-00805F9B34FB"; // Replace with your actual UUID

pub struct BluetoothManager {
    adapter: Adapter,
    db: Arc<DatabaseManager>,
    known_devices: HashMap<String, DeviceConfig>,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeviceConfig {
    name: String,
    mac_address: String,
    auto_sync: bool,
    last_sync: Option<DateTime<Utc>>,
}

impl BluetoothManager {
    pub async fn new(
        db: Arc<DatabaseManager>,
        audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    ) -> Result<Self> {
        let manager = Manager::new().await?;
        let adapter = manager
            .adapters()
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("no bluetooth adapter found"))?;

        Ok(Self {
            adapter,
            db,
            known_devices: HashMap::new(),
            audio_transcription_engine,
        })
    }

    pub async fn start_scanning(&self) -> Result<()> {
        println!("starting bluetooth scan");
        self.adapter.start_scan(ScanFilter::default()).await?;

        let mut events = self.adapter.events().await?;

        while let Some(event) = events.next().await {
            match event {
                CentralEvent::DeviceDiscovered(id) => {
                    if let Some(device) = self.known_devices.get(&id.to_string()) {
                        self.handle_known_device(&id).await?;
                    }
                }
                _ => {}
            }
        }

        Ok(())
    }

    async fn handle_known_device(&self, device_id: &PeripheralId) -> Result<()> {
        let peripheral = self.adapter.peripheral(device_id).await?;

        // Connect and authenticate
        peripheral.connect().await?;

        // Find our custom service
        peripheral.discover_services().await?;
        let screenpipe_service = peripheral
            .services()
            .iter()
            .find(|s| s.uuid == Uuid::parse_str(SCREENPIPE_SERVICE_UUID).unwrap())
            .ok_or_else(|| anyhow!("screenpipe service not found"))?;

        // Get the HDMI stream characteristic
        let chars = peripheral.characteristics();
        let hdmi_char = chars
            .iter()
            .find(|c| c.uuid == Uuid::parse_str(HDMI_STREAM_CHARACTERISTIC_UUID).unwrap())
            .ok_or_else(|| anyhow!("hdmi characteristic not found"))?;

        // Subscribe to notifications
        peripheral.subscribe(hdmi_char).await?;

        let mut notifications = peripheral.notifications().await?;

        while let Some(data) = notifications.next().await {
            match data.value[0] {
                0x01 => {
                    // HDMI frame data
                    self.handle_image_data(
                        &data.value[1..],
                        &self.known_devices[&device_id.to_string()].name,
                    )
                    .await?;
                }
                _ => println!("unknown data type received"),
            }
        }

        Ok(())
    }

    async fn handle_image_data(&self, data: &[u8], device_name: &str) -> Result<()> {
        // Decode image
        let img = image::load_from_memory(data)?;

        // Run OCR
        let ocr_engine = OcrEngine::default();
        let (result_tx, mut result_rx) = channel(512);
        process_ocr_task(
            OcrTaskData {
                image: img,
                window_images: vec![],
                frame_number: 0,
                timestamp: Instant::now(),
                result_tx,
            },
            &ocr_engine,
            vec![Language::English],
        )
        .await?;

        let result = result_rx.recv().await.unwrap();
        let text = result.window_ocr_results[0].text.clone();
        let text_json = result.window_ocr_results[0].text_json.clone();

        // First insert video chunk to get an ID
        let _ = self
            .db
            .insert_video_chunk("bluetooth-capture.mp4", device_name)
            .await?;

        // Then insert frame
        let frame_id = self.db.insert_frame(device_name, None).await?;

        // Finally insert OCR text
        self.db
            .insert_ocr_text(
                frame_id,
                &text,
                &serde_json::to_string(&text_json)?,
                "bluetooth-device",
                device_name,
                Arc::new(ocr_engine),
                true,
            )
            .await?;

        Ok(())
    }

    async fn handle_audio_data(&self, data: &[u8], device_name: &str) -> Result<()> {
        // First decode the PCM data using symphonia
        let (pcm_data, sample_rate) = pcm_decode_bytes(data)?;

        // Get global model
        let mut model = GLOBAL_WHISPER_MODEL.lock().await;
        let model = model
            .as_mut()
            .ok_or_else(|| anyhow!("whisper model not initialized"))?;

        // First insert audio chunk
        let audio_chunk_id = self.db.insert_audio_chunk("bluetooth-audio.wav").await?;

        // Use model for transcription
        let transcription = stt(
            &pcm_data,
            sample_rate,
            device_name,
            model,
            self.audio_transcription_engine.clone(),
            None,   // deepgram key
            vec![], // languages
        )
        .await?;

        // Insert transcription with device info
        self.db
            .insert_audio_transcription(
                audio_chunk_id,
                &transcription,
                0, // offset_index
                "whisper",
                &AudioDevice {
                    name: device_name.to_string(),
                    device_type: DeviceType::Input,
                },
                None, // speaker_id
                None, // start_time
                None, // end_time
            )
            .await?;

        Ok(())
    }

    pub async fn register_iphone(&mut self, mac_address: String, name: String) -> Result<()> {
        let device_config = DeviceConfig {
            name: name.clone(),
            mac_address: mac_address.clone(),
            auto_sync: true,
            last_sync: None,
        };

        self.known_devices.insert(mac_address, device_config);
        info!("registered new iphone device: {}", name);
        Ok(())
    }
}
