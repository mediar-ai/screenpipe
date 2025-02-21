use std::sync::Arc;

use screenpipe_db::DatabaseManager;
use tokio::sync::Mutex;

use crate::{
    device_manager::device_manager::DeviceManager,
    segmentation_manager::segmentation_manager::SegmentationManager,
    vad::{silero::SileroVad, webrtc::WebRtcVad, VadEngine, VadEngineEnum},
};

use super::AudioManagerOptions;

pub enum AudioManagerStatus {
    Running,
    Paused,
    Stopped,
}

pub struct AudioManager<'a> {
    options: AudioManagerOptions<'a>,
    device_manager: DeviceManager,
    segment_manager: SegmentationManager,
    status: Mutex<AudioManagerStatus>,
    db: DatabaseManager,
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
}

impl<'a> AudioManager<'a> {
    pub async fn new(options: AudioManagerOptions<'a>, db: DatabaseManager) -> Self {
        let device_manager = DeviceManager::new();
        let segment_manager = SegmentationManager::new();
        let status = Mutex::new(AudioManagerStatus::Stopped);
        let vad_engine: Box<dyn VadEngine + Send> = match options.vad_engine {
            VadEngineEnum::Silero => Box::new(SileroVad::new().await.unwrap()),
            VadEngineEnum::WebRtc => Box::new(WebRtcVad::new()),
        };

        let vad_engine = Arc::new(Mutex::new(vad_engine));

        AudioManager {
            options,
            device_manager,
            segment_manager,
            status,
            db,
            vad_engine,
        }
    }
}
