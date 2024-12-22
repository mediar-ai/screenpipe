use anyhow::Result;
use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::stream::StreamExt;
use screenpipe_audio::GLOBAL_WHISPER_MODEL;
use tokio::sync::mpsc;

pub struct BluetoothManager {
    adapter: Adapter,
    db: Arc<DatabaseManager>,
    known_devices: HashMap<String, DeviceConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeviceConfig {
    name: String,
    mac_address: String,
    auto_sync: bool,
    last_sync: Option<DateTime<Utc>>,
}

impl BluetoothManager {
    pub async fn new(db: Arc<DatabaseManager>) -> Result<Self> {
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
        })
    }

    pub async fn start_scanning(&self) -> Result<()> {
        println!("starting bluetooth scan");
        self.adapter.start_scan(ScanFilter::default()).await?;

        let mut events = self.adapter.events().await?;

        while let Some(event) = events.next().await {
            match event {
                btleplug::api::Event::DeviceDiscovered(id) => {
                    if let Some(device) = self.known_devices.get(&id.to_string()) {
                        self.handle_known_device(&id).await?;
                    }
                }
                _ => {}
            }
        }

        Ok(())
    }

    async fn handle_known_device(&self, device_id: &str) -> Result<()> {
        let peripheral = self.adapter.peripheral(device_id).await?;

        // Connect and authenticate
        peripheral.connect().await?;

        // Set up characteristic for receiving data
        let chars = peripheral.characteristics();
        let data_char = chars
            .iter()
            .find(|c| c.uuid == UUID::from_str("YOUR-UUID-HERE").unwrap())
            .ok_or_else(|| anyhow!("data characteristic not found"))?;

        // Subscribe to notifications
        peripheral.subscribe(data_char).await?;

        let mut notifications = peripheral.notifications().await?;

        while let Some(data) = notifications.next().await {
            match data.value[0] {
                0x01 => {
                    self.handle_image_data(&data.value[1..], &self.known_devices[&device_id].name)
                        .await?
                }
                0x02 => {
                    self.handle_audio_data(&data.value[1..], &self.known_devices[&device_id].name)
                        .await?
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
        let (text, text_json, confidence) = ocr_engine
            .process_image(&img, vec![Language::English])
            .await?;

        // First insert video chunk to get an ID
        let video_chunk_id = self
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
                &text_json,
                "bluetooth-device",
                device_name,
                Arc::new(ocr_engine),
                true, // focused since it's the only window
            )
            .await?;

        Ok(())
    }

    async fn handle_audio_data(&self, data: &[u8], device_name: &str) -> Result<()> {
        // Convert audio data
        let audio = rodio::Decoder::new(std::io::Cursor::new(data))?;

        // Get global model
        let model = GLOBAL_WHISPER_MODEL.lock().await;
        let model = model
            .as_ref()
            .ok_or_else(|| anyhow!("whisper model not initialized"))?;

        // First insert audio chunk
        let audio_chunk_id = self.db.insert_audio_chunk("bluetooth-audio.wav").await?;

        // Use model for transcription
        let transcription = stt(
            &audio_data,
            sample_rate,
            device_name,
            model,
            audio_transcription_engine.clone(),
            None,   // deepgram key
            vec![], // languages
        )
        .await?;

        // Insert transcription with device info
        self.db
            .insert_audio_transcription(
                audio_chunk_id,
                &transcription.text,
                0, // offset_index
                "whisper",
                &AudioDevice {
                    name: device_name.to_string(),
                    device_type: DeviceType::Input,
                },
                transcription.speaker_id,
                transcription.start_time,
                transcription.end_time,
            )
            .await?;

        Ok(())
    }

    pub async fn register_iphone(&mut self, mac_address: String, name: String) -> Result<()> {
        let device_config = DeviceConfig {
            name,
            mac_address,
            auto_sync: true,
            last_sync: None,
        };

        self.known_devices.insert(mac_address, device_config);
        println!("registered new iphone device: {}", name);
        Ok(())
    }
}
