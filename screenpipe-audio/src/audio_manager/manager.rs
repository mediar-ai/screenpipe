use anyhow::{anyhow, Result};
use dashmap::DashMap;
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{atomic::Ordering, Arc},
};
use tokio::{
    join,
    sync::{Mutex, RwLock},
    task::JoinHandle,
};
use tracing::{error, info, warn};
use whisper_rs::WhisperContext;

use screenpipe_db::DatabaseManager;

use super::{start_device_monitor, stop_device_monitor, AudioManagerOptions};
use crate::{
    core::{
        device::{parse_audio_device, AudioDevice},
        record_and_transcribe,
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

type RecordingHandlesMap = DashMap<AudioDevice, Arc<Mutex<JoinHandle<Result<()>>>>>;

#[derive(Clone)]
pub struct AudioManager {
    options: Arc<RwLock<AudioManagerOptions>>,
    device_manager: Arc<DeviceManager>,
    segmentation_manager: Arc<SegmentationManager>,
    status: Arc<RwLock<AudioManagerStatus>>,
    db: Arc<DatabaseManager>,
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    recording_handles: Arc<RecordingHandlesMap>,
    recording_sender: Arc<crossbeam::channel::Sender<AudioInput>>,
    recording_receiver: Arc<crossbeam::channel::Receiver<AudioInput>>,
    transcription_receiver: Arc<crossbeam::channel::Receiver<TranscriptionResult>>,
    transcription_sender: Arc<crossbeam::channel::Sender<TranscriptionResult>>,
    transcription_receiver_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
    recording_receiver_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
    stt_model_path: PathBuf,
}

impl AudioManager {
    pub async fn new(options: AudioManagerOptions, db: Arc<DatabaseManager>) -> Result<Self> {
        let device_manager = DeviceManager::new().await?;
        let segmentation_manager = Arc::new(SegmentationManager::new().await?);
        let status = RwLock::new(AudioManagerStatus::Stopped);
        let vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>> = match options.vad_engine {
            VadEngineEnum::Silero => Arc::new(Mutex::new(Box::new(SileroVad::new().await?))),
            VadEngineEnum::WebRtc => Arc::new(Mutex::new(Box::new(WebRtcVad::new()))),
        };

        let (recording_sender, recording_receiver) = crossbeam::channel::bounded(1000);
        let (transcription_sender, transcription_receiver) = crossbeam::channel::bounded(1000);

        let recording_handles = DashMap::new();
        let stt_model_path = download_whisper_model(options.transcription_engine.clone())?;

        whisper_rs::install_logging_hooks();

        let manager = Self {
            options: Arc::new(RwLock::new(options)),
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
            recording_receiver_handle: Arc::new(RwLock::new(None)),
            transcription_receiver_handle: Arc::new(RwLock::new(None)),
            stt_model_path,
        };

        Ok(manager)
    }

    pub async fn start(&self) -> Result<()> {
        if self.status().await == AudioManagerStatus::Running {
            return Ok(());
        }

        *self.status.write().await = AudioManagerStatus::Running;
        self.start_internal().await
    }

    async fn start_internal(&self) -> Result<()> {
        *self.status.write().await = AudioManagerStatus::Running;
        let mut transcription_receiver_handle = self.transcription_receiver_handle.write().await;
        *transcription_receiver_handle = Some(self.start_transcription_receiver_handler().await?);

        let mut recording_receiver_handle = self.recording_receiver_handle.write().await;
        *recording_receiver_handle = Some(self.start_audio_receiver_handler().await?);
        let self_arc = Arc::new(self.clone());

        start_device_monitor(self_arc.clone(), self.device_manager.clone()).await?;

        info!("audio manager started");

        Ok(())
    }

    pub async fn restart(&self) -> Result<()> {
        self.stop_internal().await?;
        self.start_internal().await?;
        info!("audio manager restarted");
        Ok(())
    }

    async fn stop_internal(&self) -> Result<()> {
        *self.status.write().await = AudioManagerStatus::Stopped;

        stop_device_monitor().await?;

        let mut recording_receiver_handle = self.recording_receiver_handle.write().await;
        if let Some(handle) = recording_receiver_handle.take() {
            handle.abort();
        }

        let mut transcription_receiver_handle = self.transcription_receiver_handle.write().await;
        if let Some(handle) = transcription_receiver_handle.take() {
            handle.abort();
        }

        for pair in self.recording_handles.iter() {
            let handle = pair.value();
            handle.lock().await.abort();
        }

        self.recording_handles.clear();
        self.device_manager.stop_all_devices().await?;
        info!("audio manager stopped");
        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        if self.status().await == AudioManagerStatus::Stopped {
            return Ok(());
        }
        *self.status.write().await = AudioManagerStatus::Stopped;
        stop_device_monitor().await?;
        self.stop_internal().await
    }

    pub async fn devices(&self) -> Result<Vec<AudioDevice>> {
        let devices = self.device_manager.devices().await;
        Ok(devices)
    }

    pub async fn stop_device(&self, device_name: &str) -> Result<()> {
        let device = match parse_audio_device(device_name) {
            Ok(device) => device,
            Err(_) => return Err(anyhow!("Device {} not found", device_name)),
        };

        self.options
            .write()
            .await
            .enabled_devices
            .remove(device_name);

        self.device_manager.stop_device(&device).await?;

        if let Some(pair) = self.recording_handles.get(&device) {
            let handle = pair.value();

            handle.lock().await.abort();
        }

        self.recording_handles.remove(&device);

        Ok(())
    }

    pub async fn status(&self) -> AudioManagerStatus {
        self.status.read().await.clone()
    }

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

        if !self.enabled_devices().await.contains(&device.to_string()) {
            self.options
                .write()
                .await
                .enabled_devices
                .insert(device.to_string());
        }

        Ok(())
    }

    pub async fn use_all_devices(&self) -> bool {
        self.options.read().await.use_all_devices
    }

    async fn record_device(&self, device: &AudioDevice) -> Result<JoinHandle<Result<()>>> {
        let options = self.options.read().await;
        let stream = self.device_manager.stream(device).unwrap();
        let audio_chunk_duration = options.audio_chunk_duration;
        let recording_sender = self.recording_sender.clone();
        let is_running = self.device_manager.is_running_mut(device).unwrap();
        let languages = options.languages.clone();
        let deepgram_api_key = options.deepgram_api_key.clone();
        let realtime_enabled = options.enable_realtime;
        let device_clone = device.clone();

        let recording_handle = tokio::spawn(async move {
            let record_and_transcribe_handle = tokio::spawn(record_and_transcribe(
                stream.clone(),
                audio_chunk_duration,
                recording_sender.clone(),
                is_running.clone(),
            ));

            let realtime_handle = if realtime_enabled {
                Some(tokio::spawn(stream_transcription_deepgram(
                    stream,
                    languages,
                    is_running,
                    deepgram_api_key,
                )))
            } else {
                None
            };

            let (record_result, realtime_result) = if let Some(handle) = realtime_handle {
                join!(record_and_transcribe_handle, handle)
            } else {
                (record_and_transcribe_handle.await, Ok(Ok(())))
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
        let options = self.options.read().await;
        let output_path = options.output_path.clone();
        let languages = options.languages.clone();
        let deepgram_api_key = options.deepgram_api_key.clone();
        let audio_transcription_engine = options.transcription_engine.clone();
        let vad_engine = self.vad_engine.clone();
        let whisper_receiver = self.recording_receiver.clone();
        let context_param = create_whisper_context_parameters(audio_transcription_engine.clone())?;

        let quantized_path = self.stt_model_path.clone();
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
        let transcription_engine = self.options.read().await.transcription_engine.clone();
        Ok(tokio::spawn(handle_new_transcript(
            db,
            transcription_receiver,
            transcription_engine,
        )))
    }

    pub async fn shutdown(&self) -> Result<()> {
        self.stop().await?;
        let rec = self.recording_handles.clone();
        let recording = self.recording_receiver_handle.clone();
        let transcript = self.transcription_receiver_handle.clone();

        if let Some(handle) = recording.write().await.take() {
            handle.abort();
        }
        if let Some(handle) = transcript.write().await.take() {
            handle.abort();
        }
        for h in rec.iter() {
            h.value().lock().await.abort();
        }

        let _ = stop_device_monitor().await;

        Ok(())
    }

    pub fn current_devices(&self) -> Vec<AudioDevice> {
        self.recording_handles
            .iter()
            .map(|p| p.key().clone())
            .collect::<Vec<AudioDevice>>()
    }

    pub async fn enabled_devices(&self) -> HashSet<String> {
        self.options.read().await.enabled_devices.clone()
    }
}

impl Drop for AudioManager {
    fn drop(&mut self) {
        let rec = self.recording_handles.clone();
        let recording = self.recording_receiver_handle.clone();
        let transcript = self.transcription_receiver_handle.clone();
        let device_manager = self.device_manager.clone();

        tokio::spawn(async move {
            let _ = stop_device_monitor().await;
            let _ = device_manager.stop_all_devices().await;
            if let Some(handle) = recording.write().await.take() {
                handle.abort();
            }
            if let Some(handle) = transcript.write().await.take() {
                handle.abort();
            }
            for h in rec.iter() {
                h.value().lock().await.abort();
            }
        });
    }
}
