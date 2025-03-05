use anyhow::{anyhow, Result};
use dashmap::DashMap;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{join, sync::Mutex, task::JoinHandle, time::sleep};
use tracing::{error, info, warn};
use whisper_rs::WhisperContext;

use screenpipe_db::DatabaseManager;

use super::AudioManagerOptions;
use crate::{
    core::{
        device::{parse_audio_device, AudioDevice},
        record_and_transcribe, LAST_AUDIO_CAPTURE,
    },
    device::device_manager::DeviceManager,
    segmentation::segmentation_manager::SegmentationManager,
    transcription::{
        deepgram::streaming::stream_transcription_deepgram,
        handle_new_transcript,
        stt::process_audio_input,
        whisper::model::{create_whisper_context_parameters, download_whisper_model},
    },
    vad::{silero::SileroVad, webrtc::WebRtcVad, VadEngine, VadEngineEnum},
    AudioInput, TranscriptionResult,
};

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum AudioManagerStatus {
    Running,
    Paused,
    Stopped,
}

type RecordingHandlesMap = DashMap<AudioDevice, Arc<Mutex<tokio::task::JoinHandle<Result<()>>>>>;

#[derive(Clone)]
pub struct AudioManager {
    options: Arc<AudioManagerOptions>,
    device_manager: Arc<DeviceManager>,
    segmentation_manager: Arc<SegmentationManager>,
    status: Arc<Mutex<AudioManagerStatus>>,
    db: Arc<DatabaseManager>,
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    recording_receiver_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    recording_handles: Arc<RecordingHandlesMap>,
    recording_sender: Arc<crossbeam::channel::Sender<AudioInput>>,
    recording_receiver: Arc<crossbeam::channel::Receiver<AudioInput>>,
    transcription_receiver: Arc<crossbeam::channel::Receiver<TranscriptionResult>>,
    transcription_sender: Arc<crossbeam::channel::Sender<TranscriptionResult>>,
    transcription_receiver_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    device_monitor_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    health_monitor_thread: Arc<Mutex<Option<JoinHandle<()>>>>,
    restart_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    restart_tx: Arc<tokio::sync::mpsc::Sender<()>>,
    restart_rx: Arc<Mutex<tokio::sync::mpsc::Receiver<()>>>,
    restarting: Arc<AtomicBool>,
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

        let (recording_sender, recording_receiver) = crossbeam::channel::bounded(1000);
        let (transcription_sender, transcription_receiver) = crossbeam::channel::bounded(1000);

        let recording_handles = DashMap::new();

        whisper_rs::install_logging_hooks();

        // Create a channel for health monitor restarts
        let (restart_tx, restart_rx) = tokio::sync::mpsc::channel::<()>(1);

        let manager = Self {
            options: Arc::new(options),
            device_manager: Arc::new(device_manager),
            segmentation_manager,
            status: Arc::new(status),
            db,
            vad_engine,
            recording_sender: Arc::new(recording_sender),
            recording_receiver: Arc::new(recording_receiver),
            transcription_receiver: Arc::new(transcription_receiver),
            transcription_sender: Arc::new(transcription_sender),
            recording_handles: Arc::new(recording_handles),
            recording_receiver_handle: Arc::new(Mutex::new(None)),
            transcription_receiver_handle: Arc::new(Mutex::new(None)),
            device_monitor_handle: Arc::new(Mutex::new(None)), // health: AudioManagerHealth::Healthy,
            health_monitor_thread: Arc::new(Mutex::new(None)),
            restart_tx: Arc::new(restart_tx),
            restart_rx: Arc::new(Mutex::new(restart_rx)),
            restart_handle: Arc::new(Mutex::new(None)),
            restarting: Arc::new(AtomicBool::new(false)),
        };

        // Start a dedicated task to handle restart requests
        let manager_clone = manager.clone();
        *manager.restart_handle.lock().await = Some(tokio::spawn(async move {
            let mut rx = manager_clone.restart_rx.lock().await;
            while rx.recv().await.is_some() {
                if let Err(e) = manager_clone.restart().await {
                    error!("error restarting audio manager: {e}");
                }
            }
        }));

        Ok(manager)
    }

    pub async fn use_all_devices(&self) -> bool {
        self.options.use_all_devices
    }

    pub async fn start(&self) -> Result<()> {
        if self.status().await == AudioManagerStatus::Running {
            return Err(anyhow!("AudioManager is already running"));
        }

        info!("Starting audio manager");
        *self.status.lock().await = AudioManagerStatus::Running;
        self.start_device_monitor().await?;

        let mut transcription_receiver_handle = self.transcription_receiver_handle.lock().await;
        *transcription_receiver_handle = Some(self.start_transcription_receiver_handler().await?);

        let mut recording_receiver_handle = self.recording_receiver_handle.lock().await;
        *recording_receiver_handle = Some(self.start_audio_receiver_handler().await?);

        if !self.restarting.load(Ordering::Relaxed) {
            self.start_health_monitor().await?;
        }

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

    pub async fn restart(&self) -> Result<()> {
        info!("restarting audio manager");
        self.restarting.store(true, Ordering::SeqCst);
        self.stop().await?;
        self.start().await?;
        self.restarting.store(false, Ordering::SeqCst);
        Ok(())
    }

    // Stop all audio processing
    pub async fn stop(&self) -> Result<()> {
        if self.status().await == AudioManagerStatus::Stopped {
            return Err(anyhow!("AudioManager already stopped"));
        }

        *self.status.lock().await = AudioManagerStatus::Stopped;

        info!("Stopping device manager");
        let mut recording_receiver_handle = self.recording_receiver_handle.lock().await;
        if let Some(handle) = recording_receiver_handle.take() {
            handle.abort();
        }

        let mut transcription_receiver_handle = self.transcription_receiver_handle.lock().await;
        if let Some(handle) = transcription_receiver_handle.take() {
            handle.abort();
        }

        self.stop_device_monitor().await?;

        for pair in self.recording_handles.iter() {
            let handle = pair.value();
            handle.lock().await.abort();
        }

        self.recording_handles.clear();
        let _ = self.device_manager.stop_all_devices().await;
        sleep(Duration::from_secs(1)).await;
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

            if err_str.contains("Failed to build input stream") {
                return Err(anyhow!("Device {device} not found"));
            } else if !err_str.contains("already running") {
                return Err(e);
            }
        }

        if !self.recording_handles.contains_key(device) {
            if let Some(is_running) = self.device_manager.is_running_mut(device) {
                is_running.store(true, Ordering::Relaxed);
            }
            let handle = self.record_device(device).await?;
            self.recording_handles
                .insert(device.clone(), Arc::new(Mutex::new(handle)));
        }

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
        let device_clone = device.clone();

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

            warn!(
                "recording handle for device {} quit unexpectedly",
                device_clone
            );

            Ok(())
        });

        Ok(recording_handle)
    }

    async fn start_audio_receiver_handler(&self) -> Result<JoinHandle<()>> {
        let transcription_sender = self.transcription_sender.clone();
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
        let context_param =
            create_whisper_context_parameters(self.options.transcription_engine.clone())?;

        let quantized_path = download_whisper_model(self.options.transcription_engine.clone())?;
        let whisper_context = Arc::new(
            WhisperContext::new_with_params(&quantized_path.to_string_lossy(), context_param)
                .expect("failed to load model"),
        );

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

    async fn start_transcription_receiver_handler(&self) -> Result<JoinHandle<()>> {
        let transcription_receiver = self.transcription_receiver.clone();
        let db = self.db.clone();
        let transcription_engine = self.options.transcription_engine.clone();
        Ok(tokio::spawn(handle_new_transcript(
            db,
            transcription_receiver,
            transcription_engine,
        )))
    }

    async fn start_device_monitor(&self) -> Result<()> {
        if self.device_monitor_handle.lock().await.is_some() {
            self.stop_device_monitor().await?;
        }

        let self_clone = self.clone();
        *self.device_monitor_handle.lock().await = Some(tokio::spawn(async move {
            while self_clone.status().await != AudioManagerStatus::Stopped {
                let currently_available_devices = self_clone.device_manager.devices().await;
                for device_name in self_clone.options.enabled_devices.iter() {
                    let device = match parse_audio_device(device_name) {
                        Ok(device) => device,
                        Err(e) => {
                            error!("Device name {} invalid: {}", device_name, e);
                            continue;
                        }
                    };

                    if self_clone.device_manager.is_running(&device)
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
                                error!("device check error: {e}");
                            }
                        }
                    }
                }
                sleep(Duration::from_secs(1)).await;
            }
        }));
        Ok(())
    }

    async fn stop_device_monitor(&self) -> Result<()> {
        if let Some(handle) = self.device_monitor_handle.lock().await.take() {
            handle.abort();
        }

        Ok(())
    }

    async fn start_health_monitor(&self) -> Result<()> {
        if self.health_monitor_thread.lock().await.is_some() {
            self.stop_health_monitor().await?;
        }

        let grace_period = self.options.health_check_grace_period;
        let restart_tx = self.restart_tx.clone();

        *self.health_monitor_thread.lock().await = Some(tokio::spawn(async move {
            loop {
                let current_time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                if LAST_AUDIO_CAPTURE.load(Ordering::Relaxed) < current_time - grace_period {
                    warn!("health check failed. attempting to restart audio manager");

                    // Send a restart signal through the channel
                    let _ = restart_tx.send(()).await;

                    LAST_AUDIO_CAPTURE.store(current_time, Ordering::SeqCst);
                }

                sleep(Duration::from_secs(grace_period)).await;
            }
        }));

        Ok(())
    }

    async fn stop_health_monitor(&self) -> Result<()> {
        if let Some(handle) = self.health_monitor_thread.lock().await.take() {
            handle.abort();
        }

        Ok(())
    }
}

impl Drop for AudioManager {
    // TODO: IS THIS NECESSARY?
    fn drop(&mut self) {
        let health_monitor_handle = self.health_monitor_thread.clone();
        let restart_handle = self.restart_handle.clone();
        tokio::spawn(async move {
            if let Some(handle) = health_monitor_handle.lock().await.take() {
                handle.abort();
            }

            if let Some(handle) = restart_handle.lock().await.take() {
                handle.abort();
            }
        });
    }
}
