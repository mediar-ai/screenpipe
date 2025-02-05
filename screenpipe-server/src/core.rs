use crate::cli::{CliVadEngine, CliVadSensitivity};
use crate::db_types::Speaker;
use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use futures::future::join_all;
use futures::StreamExt;
use screenpipe_audio::{
    record_and_transcribe, AudioInput, AudioTranscriptionEngine, TranscriptionResult,
};
use screenpipe_audio::{start_realtime_recording, AudioStream};
use screenpipe_core::pii_removal::remove_pii;
use screenpipe_core::{AudioDevice, DeviceManager, DeviceType, Language};
use screenpipe_events::{poll_meetings_events, send_event};
use screenpipe_vision::core::WindowOcr;
use screenpipe_vision::{CaptureResult, OcrEngine};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, instrument, warn};

#[derive(Clone)]
pub struct RecordingConfig {
    pub output_path: Arc<String>,
    pub fps: f64,
    pub audio_chunk_duration: Duration,
    pub video_chunk_duration: Duration,
    pub use_pii_removal: bool,
    pub capture_unfocused_windows: bool,
    pub languages: Arc<Vec<Language>>,
}

#[derive(Clone)]
pub struct AudioConfig {
    pub disabled: bool,
    pub transcription_engine: Arc<AudioTranscriptionEngine>,
    pub vad_engine: CliVadEngine,
    pub vad_sensitivity: CliVadSensitivity,
    pub deepgram_api_key: Option<String>,
    pub realtime_enabled: bool,
    pub realtime_devices: Vec<Arc<AudioDevice>>,
    pub whisper_sender: crossbeam::channel::Sender<AudioInput>,
    pub whisper_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
}

#[derive(Clone)]
pub struct VisionConfig {
    pub disabled: bool,
    pub ocr_engine: Arc<OcrEngine>,
    pub ignored_windows: Arc<Vec<String>>,
    pub include_windows: Arc<Vec<String>>,
}

#[derive(Clone)]
pub struct VideoRecordingConfig {
    pub db: Arc<DatabaseManager>,
    pub output_path: Arc<String>,
    pub fps: f64,
    pub ocr_engine: Arc<OcrEngine>,
    pub monitor_id: u32,
    pub use_pii_removal: bool,
    pub ignored_windows: Arc<Vec<String>>,
    pub include_windows: Arc<Vec<String>>,
    pub video_chunk_duration: Duration,
    pub languages: Arc<Vec<Language>>,
    pub capture_unfocused_windows: bool,
}

#[instrument(skip(device_manager, db, recording, audio, vision))]
pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    recording: RecordingConfig,
    audio: AudioConfig,
    vision: VisionConfig,
    vision_handle: &Handle,
    audio_handle: &Handle,
    device_manager: Arc<DeviceManager>,
) -> Result<()> {
    let recording_config = recording;

    let output_path_clone = recording_config.output_path.clone();
    let languages_clone = recording_config.languages.clone();
    let db_clone = db.clone();
    let ocr_engine_clone = vision.ocr_engine.clone();
    let device_manager_vision = device_manager.clone();
    let device_manager_audio = device_manager.clone();

    let video_task = if !vision.disabled {
        vision_handle.spawn(async move {
            record_vision(
                device_manager_vision,
                ocr_engine_clone,
                db_clone,
                output_path_clone,
                recording_config.fps,
                languages_clone,
                recording_config.capture_unfocused_windows,
                vision.ignored_windows,
                vision.include_windows,
                recording_config.video_chunk_duration,
                recording_config.use_pii_removal,
            )
            .await
        })
    } else {
        vision_handle.spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            Ok(())
        })
    };

    let whisper_sender_clone = audio.whisper_sender.clone();
    let whisper_receiver_clone = audio.whisper_receiver.clone();
    let db_manager_audio = Arc::clone(&db);

    tokio::spawn(async move {
        let _ = poll_meetings_events().await;
    });

    let audio_task = if !audio.disabled {
        audio_handle.spawn(async move {
            record_audio(
                device_manager_audio,
                db_manager_audio,
                recording_config.audio_chunk_duration,
                whisper_sender_clone,
                whisper_receiver_clone,
                audio.transcription_engine,
                audio.realtime_enabled,
                audio.realtime_devices,
                recording_config.languages,
                audio.deepgram_api_key,
            )
            .await
        })
    } else {
        audio_handle.spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            Ok(())
        })
    };

    if let Err(e) = video_task.await {
        error!("Video recording error: {:?}", e);
    }
    if let Err(e) = audio_task.await {
        error!("Audio recording error: {:?}", e);
    }

    // Shutdown the whisper channel
    drop(audio.whisper_sender); // Close the sender channel

    // TODO: process any remaining audio chunks
    // TODO: wait a bit for whisper to finish processing
    // TODO: any additional cleanup like device controls to release

    info!("Stopped recording");
    Ok(())
}

async fn record_vision(
    device_manager: Arc<DeviceManager>,
    ocr_engine: Arc<OcrEngine>,
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    languages: Arc<Vec<Language>>,
    capture_unfocused_windows: bool,
    ignored_windows: Arc<Vec<String>>,
    include_windows: Arc<Vec<String>>,
    video_chunk_duration: Duration,
    use_pii_removal: bool,
) -> Result<()> {
    let mut handles: HashMap<u32, JoinHandle<()>> = HashMap::new();
    let mut device_states = device_manager.watch_devices().await;

    // Create weak reference to device_manager
    let device_manager_weak = Arc::downgrade(&device_manager);

    loop {
        tokio::select! {
            Some(state_change) = device_states.next() => {
                // Clean up finished handles first
                handles.retain(|monitor_id, handle| {
                    if handle.is_finished() {
                        info!("handle for monitor {} has finished", monitor_id);
                        false
                    } else {
                        true
                    }
                });

                match DeviceType::from_str(&state_change.device) {
                    Ok(DeviceType::Vision(monitor_id)) => {
                        debug!("record_vision: vision state change: {:?}", state_change);
                        if !state_change.control.is_running {
                            if let Some(handle) = handles.remove(&monitor_id) {
                                let _ = handle.await;
                                info!("stopped thread for monitor {}", monitor_id);
                            }
                            continue;
                        }

                        if handles.contains_key(&monitor_id) {
                            continue;
                        }

                        info!("starting vision capture thread for monitor: {}", monitor_id);

                        let db_manager_video = Arc::clone(&db);
                        let output_path_video = Arc::clone(&output_path);
                        let ocr_engine = Arc::clone(&ocr_engine);

                        let languages = languages.clone();
                        // Use weak reference for the device manager
                        let device_manager_weak = device_manager_weak.clone();
                        let ignored_windows = ignored_windows.clone();
                        let include_windows = include_windows.clone();
                        let handle = tokio::spawn(async move {
                            let config = VideoRecordingConfig {
                                db: db_manager_video,
                                output_path: output_path_video,
                                fps,
                                ocr_engine,
                                monitor_id,
                                use_pii_removal,
                                ignored_windows,
                                include_windows,
                                video_chunk_duration,
                                languages,
                                capture_unfocused_windows,
                            };

                            // Upgrade weak reference when needed
                            let device_manager = match device_manager_weak.upgrade() {
                                Some(dm) => dm,
                                None => {
                                    warn!("device manager no longer exists");
                                    return;
                                }
                            };

                            if let Err(e) = record_video(device_manager, config).await {
                                error!(
                                    "Error in video recording thread for monitor {}: {}",
                                    monitor_id, e
                                );
                            }
                        });

                        handles.insert(monitor_id, handle);
                    }
                    _ => continue, // Ignore non-vision devices
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {

            }
        }
    }
}

async fn record_video(
    device_manager: Arc<DeviceManager>,
    config: VideoRecordingConfig,
) -> Result<()> {
    let db_chunk_callback = Arc::clone(&config.db);
    let rt = Handle::current();
    let device_name = Arc::new(format!("monitor_{}", config.monitor_id));

    let new_chunk_callback = {
        let db_chunk_callback = Arc::clone(&db_chunk_callback);
        let device_name = Arc::clone(&device_name);
        move |file_path: &str| {
            let file_path = file_path.to_string();
            let db_chunk_callback = Arc::clone(&db_chunk_callback);
            let device_name = Arc::clone(&device_name);
            rt.spawn(async move {
                if let Err(e) = db_chunk_callback
                    .insert_video_chunk(&file_path, &device_name)
                    .await
                {
                    error!("Failed to insert new video chunk: {}", e);
                }
                debug!("record_video: Inserted new video chunk: {}", file_path);
            });
        }
    };

    let video_capture = VideoCapture::new(
        &config.output_path,
        config.fps,
        config.video_chunk_duration,
        new_chunk_callback,
        Arc::clone(&config.ocr_engine),
        config.monitor_id,
        config.ignored_windows,
        config.include_windows,
        config.languages,
        config.capture_unfocused_windows,
    );

    let mut device_states = device_manager.watch_devices().await;

    loop {
        tokio::select! {
            Some(state_change) = device_states.next() => {
                match DeviceType::from_str(&state_change.device) {
                    Ok(DeviceType::Vision(monitor_id)) if monitor_id == config.monitor_id => {
                        debug!("record_video: vision state change: {:?}", state_change);
                        if !state_change.control.is_running {
                            info!("vision thread for monitor {} received stop signal", monitor_id);
                            let _ = video_capture.shutdown().await;
                            info!("vision thread for monitor {} shutdown complete", monitor_id);
                            return Ok(());
                        }
                    }
                    _ => continue, // Ignore other devices or monitors
                }
            }
            // we should process faster than the fps we use to do OCR
            _ = tokio::time::sleep(Duration::from_secs_f64(1.0 / (config.fps * 2.0))) => {
                let frame = match video_capture.ocr_frame_queue.pop() {
                    Some(f) => f,
                    None => continue,
                };

                process_ocr_frame(
                    frame,
                    &config.db,
                    &device_name,
                    config.use_pii_removal,
                    config.ocr_engine.clone(),
                ).await;
            }
        }
    }
}

async fn process_ocr_frame(
    frame: Arc<CaptureResult>,
    db: &DatabaseManager,
    device_name: &str,
    use_pii_removal: bool,
    ocr_engine: Arc<OcrEngine>,
) {
    for window_result in &frame.window_ocr_results {
        let frame_id = match db.insert_frame(device_name, None).await {
            Ok(id) => id,
            Err(e) => {
                warn!("Failed to insert frame: {}", e);
                tokio::time::sleep(Duration::from_millis(100)).await;
                continue;
            }
        };

        let text_json = serde_json::to_string(&window_result.text_json).unwrap_or_default();

        let text = if use_pii_removal {
            remove_pii(&window_result.text)
        } else {
            window_result.text.clone()
        };

        let _ = send_event(
            "ocr_result",
            WindowOcr {
                image: Some(frame.image.clone()),
                text: text.clone(),
                text_json: window_result.text_json.clone(),
                app_name: window_result.app_name.clone(),
                window_name: window_result.window_name.clone(),
                focused: window_result.focused,
                confidence: window_result.confidence,
                timestamp: frame.timestamp,
            },
        );

        if let Err(e) = db
            .insert_ocr_text(
                frame_id,
                &text,
                &text_json,
                &window_result.app_name,
                &window_result.window_name,
                ocr_engine.clone(),
                window_result.focused,
            )
            .await
        {
            error!(
                "Failed to insert OCR text: {}, skipping window {} of frame {}",
                e, window_result.window_name, frame_id
            );
        }
    }
}

async fn record_audio(
    device_manager: Arc<DeviceManager>,
    db: Arc<DatabaseManager>,
    chunk_duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    whisper_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    realtime_audio_enabled: bool,
    realtime_audio_devices: Vec<Arc<AudioDevice>>,
    languages: Arc<Vec<Language>>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    let mut handles: HashMap<String, JoinHandle<()>> = HashMap::new();
    let mut device_states = device_manager.watch_devices().await;
    let mut previous_transcript = String::new();
    let mut previous_transcript_id: Option<i64> = None;

    // Create a weak reference to device_manager
    let device_manager_weak = Arc::downgrade(&device_manager);

    loop {
        tokio::select! {
            Some(state_change) = device_states.next() => {
                // Handle cleanup of finished handles
                handles.retain(|device_id, handle| {
                    if handle.is_finished() {
                        info!("handle for device {} has finished", device_id);
                        false
                    } else {
                        true
                    }
                });

                match DeviceType::from_str(&state_change.device) {
                    Ok(DeviceType::Audio(audio_device)) => {
                        let device_id = audio_device.to_string();

                        if !state_change.control.is_running {
                            if let Some(handle) = handles.remove(&device_id) {
                                handle.abort();
                                info!("stopped thread for device {}", &audio_device);
                            }
                            continue;
                        }

                        if handles.contains_key(&device_id) {
                            continue;
                        }

                        info!("starting audio capture thread for device: {}", &audio_device);

                        let audio_device = Arc::new(audio_device);
                        let is_running = Arc::new(AtomicBool::new(true));

                        // Use weak reference for the spawned task
                        let device_manager_weak = device_manager_weak.clone();
                        let whisper_sender = whisper_sender.clone();
                        let languages = Arc::clone(&languages);
                        let deepgram_api_key = deepgram_api_key.clone();

                        let handle = tokio::spawn({
                            let audio_device = Arc::clone(&audio_device);
                            let is_running = Arc::clone(&is_running);
                            let realtime_devices = realtime_audio_devices.iter()
                                .map(Arc::clone)
                                .collect::<Vec<_>>();

                            async move {
                                info!("starting audio capture thread for device: {}", &audio_device);
                                let mut did_warn = false;

                                while is_running.load(Ordering::Relaxed) {
                                    let device_id = audio_device.to_string();

                                    // Upgrade weak reference when needed
                                    let device_manager = match device_manager_weak.upgrade() {
                                        Some(dm) => dm,
                                        None => {
                                            warn!("device manager no longer exists");
                                            break;
                                        }
                                    };

                                    // Monitor device state changes
                                    let mut device_states = device_manager.watch_devices().await;
                                    let is_running_clone = Arc::clone(&is_running);

                                    tokio::spawn(async move {
                                        while let Some(state_change) = device_states.next().await {
                                            if state_change.device == device_id && !state_change.control.is_running {
                                                is_running_clone.store(false, Ordering::Relaxed);
                                                break;
                                            }
                                        }
                                    });

                                    let audio_stream = match AudioStream::from_device(
                                        Arc::clone(&audio_device),
                                        Arc::clone(&is_running),
                                    ).await {
                                        Ok(stream) => Arc::new(stream),
                                        Err(e) => {
                                            if e.to_string().contains("audio device not found") {
                                                if !did_warn {
                                                    warn!("audio device not found: {}", audio_device.name);
                                                    did_warn = true;
                                                }
                                                tokio::time::sleep(Duration::from_secs(1)).await;
                                                continue;
                                            } else {
                                                error!("failed to create audio stream: {}", e);
                                                return;
                                            }
                                        }
                                    };

                                    let mut recording_handles = vec![];

                                    // Spawn record and transcribe task
                                    recording_handles.push(tokio::spawn({
                                        let audio_stream = Arc::clone(&audio_stream);
                                        let is_running = Arc::clone(&is_running);
                                        let whisper_sender = whisper_sender.clone();

                                        async move {
                                            let _ = record_and_transcribe(
                                                audio_stream,
                                                chunk_duration,
                                                whisper_sender,
                                                is_running,
                                            ).await;
                                        }
                                    }));

                                    // Spawn realtime recording task if enabled
                                    if realtime_audio_enabled && realtime_devices.contains(&audio_device) {
                                        recording_handles.push(tokio::spawn({
                                            let audio_stream = Arc::clone(&audio_stream);
                                            let is_running = Arc::clone(&is_running);
                                            let languages = Arc::clone(&languages);
                                            let deepgram_api_key = deepgram_api_key.clone();

                                            async move {
                                                let _ = start_realtime_recording(
                                                    audio_stream,
                                                    languages,
                                                    is_running,
                                                    deepgram_api_key,
                                                ).await;
                                            }
                                        }));
                                    }

                                    join_all(recording_handles).await;
                                }
                            }
                        });

                        handles.insert(device_id, handle);
                    }
                    _ => continue,
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
        }

        // Process transcription results
        while let Ok(mut transcription) = whisper_receiver.try_recv() {
            info!(
                "device {} received transcription {:?}",
                transcription.input.device, transcription.transcription
            );

            let mut current_transcript = transcription.transcription.clone();
            let mut processed_previous = None;

            if let Some((previous, current)) = transcription.cleanup_overlap(&previous_transcript) {
                if !previous.is_empty() && !current.is_empty() {
                    if previous != previous_transcript {
                        processed_previous = Some(previous);
                    }
                    if current_transcript.as_ref() != Some(&current) {
                        current_transcript = Some(current);
                    }
                }
            }

            transcription.transcription = current_transcript.clone();

            if let Some(transcript) = current_transcript {
                previous_transcript = transcript;
            } else {
                continue;
            }

            // Process the audio result
            match process_audio_result(
                &db,
                transcription,
                Arc::clone(&audio_transcription_engine),
                processed_previous,
                previous_transcript_id,
            )
            .await
            {
                Ok(id) => previous_transcript_id = id,
                Err(e) => error!("error processing audio result: {}", e),
            }
        }
    }
}

async fn process_audio_result(
    db: &DatabaseManager,
    result: TranscriptionResult,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    previous_transcript: Option<String>,
    previous_transcript_id: Option<i64>,
) -> Result<Option<i64>, anyhow::Error> {
    if result.error.is_some() || result.transcription.is_none() {
        error!(
            "error in audio recording: {}. not inserting audio result",
            result.error.unwrap_or_default()
        );
        return Ok(None);
    }

    let speaker = get_or_create_speaker_from_embedding(db, &result.speaker_embedding).await?;

    info!("detected speaker: {:?}", speaker);

    let transcription = result.transcription.unwrap();
    let transcription_engine = audio_transcription_engine.to_string();
    let mut chunk_id: Option<i64> = None;

    info!(
        "device {} inserting audio chunk: {:?}",
        result.input.device, result.path
    );
    if let Some(id) = previous_transcript_id {
        if let Some(prev_transcript) = previous_transcript {
            match db
                .update_audio_transcription(id, prev_transcript.as_str())
                .await
            {
                Ok(_) => {}
                Err(e) => error!(
                    "failed to update transcription for {}: audio_chunk_id {}",
                    result.input.device, e
                ),
            }
        }
    }
    match db.get_or_insert_audio_chunk(&result.path).await {
        Ok(audio_chunk_id) => {
            if transcription.is_empty() {
                return Ok(Some(audio_chunk_id));
            }

            if let Err(e) = db
                .insert_audio_transcription(
                    audio_chunk_id,
                    &transcription,
                    0,
                    &transcription_engine,
                    &result.input.device,
                    Some(speaker.id),
                    Some(result.start_time),
                    Some(result.end_time),
                )
                .await
            {
                error!(
                    "failed to insert audio transcription for device {}: {}",
                    result.input.device, e
                );
                return Ok(Some(audio_chunk_id));
            } else {
                debug!(
                    "inserted audio transcription for chunk {} from device {} using {}",
                    audio_chunk_id, result.input.device, transcription_engine
                );
                chunk_id = Some(audio_chunk_id);
            }
        }
        Err(e) => error!(
            "failed to insert audio chunk for device {}: {}",
            result.input.device, e
        ),
    }
    Ok(chunk_id)
}

async fn get_or_create_speaker_from_embedding(
    db: &DatabaseManager,
    embedding: &[f32],
) -> Result<Speaker, anyhow::Error> {
    let speaker = db.get_speaker_from_embedding(embedding).await?;
    if let Some(speaker) = speaker {
        Ok(speaker)
    } else {
        let speaker = db.insert_speaker(embedding).await?;
        Ok(speaker)
    }
}

pub async fn merge_speakers(
    db: &DatabaseManager,
    speaker_to_keep_id: i64,
    speaker_to_merge_id: i64,
) -> Result<Speaker, anyhow::Error> {
    // make sure both speakers exist
    let _ = db.get_speaker_by_id(speaker_to_keep_id).await?;
    let _ = db.get_speaker_by_id(speaker_to_merge_id).await?;

    // call merge method from db
    match db
        .merge_speakers(speaker_to_keep_id, speaker_to_merge_id)
        .await
    {
        Ok(speaker) => Ok(speaker),
        Err(e) => Err(anyhow::anyhow!("failed to merge speakers: {}", e)),
    }
}
