use anyhow::{anyhow, Result};
use dashmap::DashMap;
use std::{
    sync::{atomic::Ordering, Arc},
    time::Duration,
};
use tokio::{join, sync::Mutex, task::JoinHandle};
use tracing::{error, info, warn};

use screenpipe_db::DatabaseManager;

use crate::{
    core::{
        device::{parse_audio_device, AudioDevice},
        record_and_transcribe,
    },
    device::device_manager::DeviceManager,
    segmentation::segmentation_manager::SegmentationManager,
    transcription::{
        deepgram::streaming::stream_transcription_deepgram, process_transcription_result,
        stt::process_audio_input, whisper::model::WhisperModel,
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

// #[derive(Debug, Clone, Eq, PartialEq)]
// pub enum AudioManagerHealth {
//     Healthy,
//     Unhealthy,
// }

#[derive(Clone)]
pub struct AudioManager {
    options: AudioManagerOptions,
    device_manager: Arc<DeviceManager>,
    segmentation_manager: Arc<SegmentationManager>,
    status: Arc<Mutex<AudioManagerStatus>>,
    db: Arc<DatabaseManager>,
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    whisper_model: Arc<Mutex<WhisperModel>>,
    recording_receiver_handle: Arc<Option<JoinHandle<()>>>,
    recording_handles: DashMap<AudioDevice, Arc<Mutex<tokio::task::JoinHandle<Result<()>>>>>,
    recording_sender: crossbeam::channel::Sender<AudioInput>,
    recording_receiver: crossbeam::channel::Receiver<AudioInput>,
    transcription_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    transcription_sender: crossbeam::channel::Sender<TranscriptionResult>,
    transcription_receiver_handle: Arc<Option<JoinHandle<()>>>,
    // health: AudioManagerHealth,
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
            status: Arc::new(status),
            db,
            vad_engine,
            whisper_model,
            recording_sender: whisper_sender,
            recording_receiver: whisper_receiver,
            transcription_receiver,
            transcription_sender,
            recording_handles,
            recording_receiver_handle: Arc::new(None),
            transcription_receiver_handle: Arc::new(None),
            // health: AudioManagerHealth::Healthy,
        })
    }

    pub async fn use_all_devices(&self) -> bool {
        self.options.use_all_devices
    }

    pub async fn start(&mut self) -> Result<()> {
        info!("Starting audio manager");
        for device_name in &self.options.enabled_devices {
            let device = match self.device_manager.device(device_name) {
                Some(device) => device,
                None => {
                    warn!("Device {} not found", device_name);
                    continue;
                }
            };

            self.start_device(&device).await?;
        }

        let transcription_receiver = self.transcription_receiver.clone();
        let transcription_sender = self.transcription_sender.clone();

        self.transcription_receiver_handle = Arc::new(Some(
            self.start_transcription_receiver_handler(transcription_receiver)
                .await?,
        ));

        self.recording_receiver_handle = Arc::new(Some(
            self.start_audio_receiver_handler(transcription_sender)
                .await?,
        ));

        Ok(())
    }

    pub async fn devices(&self) -> Result<Vec<AudioDevice>> {
        let devices = self.device_manager.devices();
        Ok(devices)
    }

    pub async fn stop_device(&self, device_name: &str) -> Result<()> {
        // Disable specific audio device
        let device = match parse_audio_device(device_name) {
            Ok(device) => device,
            Err(_) => return Err(anyhow!("Device {} not found", device_name)),
        };

        self.device_manager.stop_device(&device)?;

        if let Some(pair) = self.recording_handles.get(&device) {
            let handle = pair.value();

            handle.lock().await.abort();
        }

        self.recording_handles.remove(&device);

        Ok(())
    }

    // Stop all audio processing
    pub async fn stop(&self) -> Result<()> {
        self.recording_handles.clear();
        let _ = self.device_manager.stop_all_devices();
        *self.status.lock().await = AudioManagerStatus::Stopped;
        Ok(())
    }

    pub async fn status(&self) -> AudioManagerStatus {
        self.status.lock().await.clone()
    }

    // pub async fn set_use_all_devices(&mut self, use_all: bool) -> Result<()> {
    //     self.options.use_all_devices = use_all;
    //     Ok(())
    // }

    // TODO: Make sure stopped or return device already running error
    pub async fn start_device(&self, device: &AudioDevice) -> Result<()> {
        self.device_manager.start_device(device).await?;
        if let Some(is_running) = self.device_manager.is_running_mut(device) {
            is_running.store(true, Ordering::Relaxed);
        }
        let handle = self.record_device(device).await?;
        self.recording_handles
            .insert(device.clone(), Arc::new(Mutex::new(handle)));

        // if let Some(mut enabled_devices) = self.options.enabled_devices.as_mut() {
        //     if !enabled_devices.contains(&device.name) {
        //         enabled_devices.push(device.name.clone());
        //     }
        // }
        Ok(())
    }

    async fn record_device(&self, device: &AudioDevice) -> Result<JoinHandle<Result<()>>> {
        let stream = self.device_manager.stream(device).unwrap();
        let audio_chunk_duration = self.options.audio_chunk_duration as u64;
        let recording_sender = self.recording_sender.clone();
        let is_running = self.device_manager.is_running_mut(device).unwrap();
        let languages = self.options.languages.clone();
        let deepgram_api_key = self.options.deepgram_api_key.clone();

        let recording_handle = tokio::spawn(async move {
            let record_and_transcribe_handle = record_and_transcribe(
                stream.clone(),
                Duration::from_secs(audio_chunk_duration),
                recording_sender.clone(),
                is_running.clone(),
            );

            let realtime_handle =
                stream_transcription_deepgram(stream, languages, is_running, deepgram_api_key);

            let (record_result, realtime_result) =
                join!(record_and_transcribe_handle, realtime_handle);

            if record_result.is_err() || realtime_result.is_err() {
                let mut e = anyhow!("record_device failed");

                if record_result.is_err() {
                    let record_error = record_result.err().unwrap();
                    error!("Record and transcribe error: {}", record_error);
                    e = e.context(record_error)
                }

                if realtime_result.is_err() {
                    let realtime_error = realtime_result.err().unwrap();
                    error!("Realtime recording error: {}", realtime_error);
                    e = e.context(realtime_error);
                }

                return Err(e);
            }

            Ok(())
        });

        Ok(recording_handle)
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
        let whisper_receiver = self.recording_receiver.clone();

        Ok(tokio::spawn(async move {
            while let Ok(audio) = whisper_receiver.recv() {
                info!("Received audio from device: {:?}", audio.device.name);
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
