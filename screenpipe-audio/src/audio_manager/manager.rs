use anyhow::{anyhow, Result};
use dashmap::DashMap;
use std::{
    sync::{atomic::Ordering, Arc},
    time::Duration,
};
use tokio::{join, sync::Mutex, task::JoinHandle, time::sleep};
use tracing::{error, info};
use whisper_rs::{WhisperContext, WhisperContextParameters};

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
        stt::process_audio_input, whisper::model::download_quantized_whisper,
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
    whisper_context: Arc<WhisperContext>,
    recording_receiver_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    recording_handles: DashMap<AudioDevice, Arc<Mutex<tokio::task::JoinHandle<Result<()>>>>>,
    recording_sender: crossbeam::channel::Sender<AudioInput>,
    recording_receiver: crossbeam::channel::Receiver<AudioInput>,
    transcription_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    transcription_sender: crossbeam::channel::Sender<TranscriptionResult>,
    transcription_receiver_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    device_check_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
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

        whisper_rs::install_logging_hooks();
        let mut context_param = WhisperContextParameters::default();
        context_param.dtw_parameters.mode = whisper_rs::DtwMode::ModelPreset {
            model_preset: whisper_rs::DtwModelPreset::LargeV3Turbo,
        };
        context_param.use_gpu(true);

        let quantized_path = download_quantized_whisper(options.transcription_engine.clone())?;
        let whisper_context =
            WhisperContext::new_with_params(&quantized_path.to_string_lossy(), context_param)
                .expect("failed to load model");

        Ok(AudioManager {
            options,
            device_manager: Arc::new(device_manager),
            segmentation_manager,
            status: Arc::new(status),
            db,
            vad_engine,
            recording_sender: whisper_sender,
            recording_receiver: whisper_receiver,
            transcription_receiver,
            transcription_sender,
            recording_handles,
            recording_receiver_handle: Arc::new(Mutex::new(None)),
            transcription_receiver_handle: Arc::new(Mutex::new(None)),
            whisper_context: Arc::new(whisper_context),
            device_check_handle: Arc::new(Mutex::new(None)), // health: AudioManagerHealth::Healthy,
        })
    }

    pub async fn use_all_devices(&self) -> bool {
        self.options.use_all_devices
    }

    pub async fn start(&self) -> Result<()> {
        if self.status().await == AudioManagerStatus::Running {
            return Err(anyhow!("AudioManager is already running"));
        }

        info!("Starting audio manager");
        let _ = self.start_device_check().await;

        let transcription_receiver = self.transcription_receiver.clone();
        let transcription_sender = self.transcription_sender.clone();

        let mut transcription_receiver_handle = self.transcription_receiver_handle.lock().await;
        *transcription_receiver_handle = Some(
            self.start_transcription_receiver_handler(transcription_receiver)
                .await?,
        );

        let mut recording_receiver_handle = self.recording_receiver_handle.lock().await;
        *recording_receiver_handle = Some(
            self.start_audio_receiver_handler(transcription_sender)
                .await?,
        );

        let mut status = self.status.lock().await;

        *status = AudioManagerStatus::Running;

        Ok(())
    }

    pub async fn devices(&self) -> Result<Vec<AudioDevice>> {
        let devices = self.device_manager.devices().await;
        Ok(devices)
    }

    pub async fn stop_device(&self, device_name: &str) -> Result<()> {
        // Disable specific audio device
        let device = match parse_audio_device(device_name) {
            Ok(device) => device,
            Err(_) => return Err(anyhow!("Device {} not found", device_name)),
        };

        self.device_manager.stop_device(&device).await?;

        if let Some(pair) = self.recording_handles.get(&device) {
            let handle = pair.value();

            handle.lock().await.abort();
        }

        self.recording_handles.remove(&device);

        Ok(())
    }

    // Stop all audio processing
    pub async fn stop(&self) -> Result<()> {
        if self.status().await == AudioManagerStatus::Stopped {
            return Err(anyhow!("AudioManager already stopped"));
        }

        let mut recording_receiver_handle = self.recording_receiver_handle.lock().await;
        if let Some(handle) = recording_receiver_handle.take() {
            handle.abort();
        }

        let mut transcription_receiver_handle = self.transcription_receiver_handle.lock().await;
        if let Some(handle) = transcription_receiver_handle.take() {
            handle.abort();
        }

        let mut device_check_handle = self.device_check_handle.lock().await;
        if let Some(handle) = device_check_handle.take() {
            handle.abort();
        }

        self.recording_handles.clear();

        let _ = self.device_manager.stop_all_devices().await;
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

    pub async fn start_device(&self, device: &AudioDevice) -> Result<()> {
        if let Err(e) = self.device_manager.start_device(device).await {
            let err_str = e.to_string();
            if err_str.contains("already running") {
                return Ok(());
            } else if err_str.contains("Failed to build input stream") {
                return Err(anyhow!("Device {device} not found"));
            } else {
                return Err(e);
            }
        }

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
        let audio_chunk_duration = self.options.audio_chunk_duration;
        let recording_sender = self.recording_sender.clone();
        let is_running = self.device_manager.is_running_mut(device).unwrap();
        let languages = self.options.languages.clone();
        let deepgram_api_key = self.options.deepgram_api_key.clone();
        let realtime_enabled = self.options.enable_realtime;

        let recording_handle = tokio::spawn(async move {
            let record_and_transcribe_handle = record_and_transcribe(
                stream.clone(),
                audio_chunk_duration,
                recording_sender.clone(),
                is_running.clone(),
            );

            let realtime_handle = if realtime_enabled {
                Some(stream_transcription_deepgram(
                    stream,
                    languages,
                    is_running,
                    deepgram_api_key,
                ))
            } else {
                None
            };

            let (record_result, realtime_result) = if let Some(handle) = realtime_handle {
                join!(record_and_transcribe_handle, handle)
            } else {
                (record_and_transcribe_handle.await, Ok(()))
            };

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
        let whisper_receiver = self.recording_receiver.clone();
        let whisper_context = self.whisper_context.clone();

        Ok(tokio::spawn(async move {
            while let Ok(audio) = whisper_receiver.recv() {
                info!("Received audio from device: {:?}", audio.device.name);
                if let Err(e) = process_audio_input(
                    audio.clone(),
                    vad_engine.clone(),
                    segmentation_model_path.clone(),
                    embedding_manager.clone(),
                    embedding_extractor.clone(),
                    &output_path.clone().unwrap(),
                    audio_transcription_engine.clone(),
                    deepgram_api_key.clone(),
                    languages.clone(),
                    &transcription_sender.clone(),
                    whisper_context.clone(),
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

    pub async fn start_device_check(&self) -> Result<()> {
        let enabled_devices = self.options.enabled_devices.clone();
        let self_clone = self.clone();
        let device_manager = self.device_manager.clone();

        *self.device_check_handle.lock().await = Some(tokio::spawn(async move {
            while self_clone.status().await != AudioManagerStatus::Stopped {
                let currently_available_devices = device_manager.devices().await;
                for device_name in enabled_devices.iter() {
                    let device = match parse_audio_device(device_name) {
                        Ok(device) => device,
                        Err(e) => {
                            error!("Device name {} invalid: {}", device_name, e);
                            continue;
                        }
                    };

                    if device_manager.is_running(&device)
                        && !currently_available_devices.contains(&device)
                    {
                        info!("Device {device_name} disconnected");
                        let _ = self_clone.stop_device(device_name).await;
                    } else {
                        match self_clone.start_device(&device).await {
                            Ok(()) => {
                                //
                            }
                            Err(e) => {
                                let e_str = e.to_string();
                                if e_str.contains("already running") || e_str.contains("not found")
                                {
                                    continue;
                                }
                            }
                        }
                    }
                }
                sleep(Duration::from_secs(1)).await;
            }
        }));

        Ok(())
    }
}
