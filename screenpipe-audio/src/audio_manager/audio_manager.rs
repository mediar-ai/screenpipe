use anyhow::Result;
use dashmap::DashMap;
use std::{
    sync::{atomic::Ordering, Arc},
    time::Duration,
};
use tokio::{sync::Mutex, task::JoinHandle};
use tracing::{error, info};

use screenpipe_db::DatabaseManager;

use crate::{
    core::{device::AudioDevice, record_and_transcribe},
    device::device_manager::DeviceManager,
    segmentation::segmentation_manager::SegmentationManager,
    transcription::{
        process_transcription_result, stt::process_audio_input, whisper::model::WhisperModel,
    },
    vad::{silero::SileroVad, webrtc::WebRtcVad, VadEngine, VadEngineEnum},
    AudioInput, TranscriptionResult,
};

use super::AudioManagerOptions;

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum AudioManagerStatus {
    Running,
    Paused,
    Stopped,
}

pub struct AudioManager {
    options: AudioManagerOptions,
    device_manager: Arc<DeviceManager>,
    segmentation_manager: Arc<SegmentationManager>,
    status: Mutex<AudioManagerStatus>,
    db: Arc<DatabaseManager>,
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    whisper_model: Arc<Mutex<WhisperModel>>,
    audio_receiver_handle: Option<JoinHandle<()>>,
    recording_handles: DashMap<AudioDevice, Arc<Mutex<tokio::task::JoinHandle<Result<()>>>>>,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    whisper_receiver: crossbeam::channel::Receiver<AudioInput>,
    transcription_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    transcription_sender: crossbeam::channel::Sender<TranscriptionResult>,
    transcription_receiver_handle: Option<JoinHandle<()>>,
}

impl AudioManager {
    pub async fn new(options: AudioManagerOptions, db: Arc<DatabaseManager>) -> Result<Self> {
        let device_manager = DeviceManager::new().await?;
        let segmentation_manager = Arc::new(SegmentationManager::new().await?);
        let status = Mutex::new(AudioManagerStatus::Stopped);
        let vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>> = match options.vad_engine {
            VadEngineEnum::Silero => Arc::new(Mutex::new(Box::new(SileroVad::new().await?))),
            VadEngineEnum::WebRtc => Arc::new(Mutex::new(Box::new(WebRtcVad::new()))),
        };

        let (whisper_sender, whisper_receiver) = crossbeam::channel::bounded(1000);
        let (transcription_sender, transcription_receiver) = crossbeam::channel::bounded(1000);

        let recording_handles = DashMap::new();

        let whisper_model = Arc::new(Mutex::new(WhisperModel::new(
            &options.transcription_engine,
        )?));

        Ok(AudioManager {
            options,
            device_manager: Arc::new(device_manager),
            segmentation_manager,
            status,
            db,
            vad_engine,
            whisper_model,
            whisper_sender,
            whisper_receiver,
            transcription_receiver,
            transcription_sender,
            recording_handles,
            audio_receiver_handle: None,
            transcription_receiver_handle: None,
        })
    }

    pub async fn use_all_devices(&self) -> bool {
        self.options.use_all_devices
    }

    pub async fn start(&mut self) -> Result<()> {
        info!("Starting audio manager");
        let devices = if let Some(device_names) = &self.options.enabled_devices {
            device_names
                .iter()
                .flat_map(|name| self.device_manager.device(name))
                .collect()
        } else {
            self.device_manager.devices()
        };

        for device in devices {
            self.start_device(&device).await?;
        }

        let transcription_receiver = self.transcription_receiver.clone();
        let transcription_sender = self.transcription_sender.clone();

        self.transcription_receiver_handle = Some(
            self.start_transcription_receiver_handler(transcription_receiver)
                .await?,
        );

        self.audio_receiver_handle = Some(
            self.start_audio_receiver_handler(transcription_sender)
                .await?,
        );

        Ok(())
    }

    // pub async fn enable_device(&mut self, device_name: &str) -> Result<()> {
    //     // Enable specific audio device
    //     Ok(())
    // }

    pub async fn devices(&self) -> Result<Vec<AudioDevice>> {
        let devices = self.device_manager.devices();
        Ok(devices)
    }

    // pub async fn disable_device(&mut self, device_name: &str) -> Result<()> {
    //     // Disable specific audio device
    //     Ok(())
    // }

    pub async fn stop(&mut self) -> Result<()> {
        self.recording_handles.clear();
        self.device_manager.stop_all_devices();
        if let Some(handle) = self.audio_receiver_handle.take() {
            handle.abort()
        };

        if let Some(handle) = self.transcription_receiver_handle.take() {
            handle.abort()
        };

        *self.status.lock().await = AudioManagerStatus::Stopped;

        // Stop all audio processing
        Ok(())
    }

    pub async fn status(&self) -> AudioManagerStatus {
        self.status.lock().await.clone()
    }

    // pub async fn set_use_all_devices(&mut self, use_all: bool) -> Result<()> {
    //     self.options.use_all_devices = use_all;
    //     Ok(())
    // }

    async fn start_device(&mut self, device: &AudioDevice) -> Result<()> {
        info!("Starting device: {:?}", device.name);
        if let Some(is_running) = self.device_manager.is_running_mut(device) {
            is_running.store(true, Ordering::Relaxed);
        }
        let handle = self.record_device(device).await?;
        self.recording_handles
            .insert(device.clone(), Arc::new(Mutex::new(handle)));
        Ok(())
    }

    async fn record_device(&mut self, device: &AudioDevice) -> Result<JoinHandle<Result<()>>> {
        info!("Recording device: {:?}", device.name);
        let whisper_handle = tokio::spawn(record_and_transcribe(
            self.device_manager.stream(device).unwrap(),
            Duration::from_secs(self.options.audio_chunk_duration as u64),
            self.whisper_sender.clone(),
            self.device_manager.is_running_mut(device).unwrap(),
        ));

        Ok(whisper_handle)
    }

    async fn start_audio_receiver_handler(
        &self,
        transcription_sender: crossbeam::channel::Sender<TranscriptionResult>,
    ) -> Result<JoinHandle<()>> {
        let segmentation_manager = self.segmentation_manager.clone();
        let segmentation_model_path = segmentation_manager.segmentation_model_path.clone();
        let embedding_manager = segmentation_manager.embedding_manager.clone();
        let embedding_extractor = segmentation_manager.embedding_extractor.clone();
        let output_path = self.options.output_path.clone();
        let languages = self.options.languages.clone();
        let deepgram_api_key = self.options.deepgram_api_key.clone();
        let audio_transcription_engine = self.options.transcription_engine.clone();
        let vad_engine = self.vad_engine.clone();
        let whisper_model = self.whisper_model.clone();
        let whisper_receiver = self.whisper_receiver.clone();

        Ok(tokio::spawn(async move {
            while let Ok(audio) = whisper_receiver.recv() {
                info!("Received audio from whisper: {:?}", audio.device.name);
                if let Err(e) = process_audio_input(
                    audio.clone(),
                    whisper_model.clone(),
                    vad_engine.clone(),
                    segmentation_model_path.clone(),
                    embedding_manager.clone(),
                    embedding_extractor.clone(),
                    &output_path.clone().unwrap(),
                    audio_transcription_engine.clone(),
                    deepgram_api_key.clone(),
                    languages.clone(),
                    &transcription_sender.clone(),
                )
                .await
                {
                    error!("Error processing audio: {:?}", e);
                }
            }
        }))
    }

    async fn start_transcription_receiver_handler(
        &self,
        transcription_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    ) -> Result<JoinHandle<()>> {
        let db = self.db.clone();
        let transcription_engine = self.options.transcription_engine.clone();
        Ok(tokio::spawn(async move {
            let mut previous_transcript = "".to_string();
            let mut previous_transcript_id: Option<i64> = None;
            while let Ok(mut transcription) = transcription_receiver.recv() {
                info!(
                    "device {} received transcription {:?}",
                    transcription.input.device, transcription.transcription
                );

                // Insert the new transcript after fetching
                let mut current_transcript: Option<String> = transcription.transcription.clone();
                let mut processed_previous: Option<String> = None;
                if let Some((previous, current)) =
                    transcription.cleanup_overlap(previous_transcript.clone())
                {
                    if !previous.is_empty() && !current.is_empty() {
                        if previous != previous_transcript {
                            processed_previous = Some(previous);
                        }
                        if current_transcript.is_some()
                            && current != current_transcript.clone().unwrap_or_default()
                        {
                            current_transcript = Some(current);
                        }
                    }
                }

                transcription.transcription = current_transcript.clone();
                if current_transcript.is_some() {
                    previous_transcript = current_transcript.unwrap();
                } else {
                    continue;
                }
                // Process the transcription result
                match process_transcription_result(
                    &db,
                    transcription,
                    transcription_engine.clone(),
                    processed_previous,
                    previous_transcript_id,
                )
                .await
                {
                    Err(e) => error!("Error processing audio result: {}", e),
                    Ok(id) => previous_transcript_id = id,
                }
            }
        }))
    }
}
