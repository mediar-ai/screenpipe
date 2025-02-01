use crate::cli::{CliVadEngine, CliVadSensitivity};
use crate::db_types::Speaker;
use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use futures::future::join_all;
use futures::StreamExt;
use log::{debug, error, info, warn};
use screenpipe_audio::realtime::RealtimeTranscriptionEvent;
use screenpipe_audio::{
    record_and_transcribe, AudioInput, AudioTranscriptionEngine, TranscriptionResult,
};
use screenpipe_audio::{start_realtime_recording, AudioStream};
use screenpipe_core::pii_removal::remove_pii;
use screenpipe_core::{AudioDevice, DeviceManager, DeviceType, Language};
use screenpipe_vision::core::{RealtimeVisionEvent, WindowOcr};
use screenpipe_vision::OcrEngine;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::task::JoinHandle;

#[derive(Clone)]
pub struct RecordingConfig {
    pub output_path: Arc<String>,
    pub fps: f64,
    pub audio_chunk_duration: Duration,
    pub video_chunk_duration: Duration,
    pub use_pii_removal: bool,
    pub capture_unfocused_windows: bool,
    pub languages: Vec<Language>,
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
    pub ignored_windows: Vec<String>,
    pub include_windows: Vec<String>,
}

#[derive(Clone)]
pub struct RealtimeConfig {
    pub transcription_sender: Arc<tokio::sync::broadcast::Sender<RealtimeTranscriptionEvent>>,
    pub vision_sender: Arc<tokio::sync::broadcast::Sender<RealtimeVisionEvent>>,
}

#[derive(Clone)]
pub struct VideoRecordingConfig {
    pub db: Arc<DatabaseManager>,
    pub output_path: Arc<String>,
    pub fps: f64,
    pub ocr_engine: Arc<OcrEngine>,
    pub monitor_id: u32,
    pub use_pii_removal: bool,
    pub ignored_windows: Vec<String>,
    pub include_windows: Vec<String>,
    pub video_chunk_duration: Duration,
    pub languages: Vec<Language>,
    pub capture_unfocused_windows: bool,
    pub realtime_vision_sender: Arc<tokio::sync::broadcast::Sender<RealtimeVisionEvent>>,
}

pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    recording: RecordingConfig,
    audio: AudioConfig,
    vision: VisionConfig,
    realtime: RealtimeConfig,
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
                realtime.vision_sender,
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
                realtime.transcription_sender,
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
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_vision_sender: Arc<tokio::sync::broadcast::Sender<RealtimeVisionEvent>>,
    ignored_windows: Vec<String>,
    include_windows: Vec<String>,
    video_chunk_duration: Duration,
    use_pii_removal: bool,
) -> Result<()> {
    let mut handles: HashMap<u32, JoinHandle<()>> = HashMap::new();
    let mut device_states = device_manager.watch_devices().await;

    loop {
        tokio::select! {
            Some(state_change) = device_states.next() => {
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
                        let ignored_windows_video = ignored_windows.to_vec();
                        let include_windows_video = include_windows.to_vec();
                        let realtime_vision_sender_clone = realtime_vision_sender.clone();
                        let languages = languages.clone();
                        let device_manager_vision_clone = device_manager.clone();
                        let handle = tokio::spawn(async move {
                            let config = VideoRecordingConfig {
                                db: db_manager_video,
                                output_path: output_path_video,
                                fps,
                                ocr_engine,
                                monitor_id,
                                use_pii_removal,
                                ignored_windows: ignored_windows_video,
                                include_windows: include_windows_video,
                                video_chunk_duration,
                                languages,
                                capture_unfocused_windows,
                                realtime_vision_sender: realtime_vision_sender_clone,
                            };

                            if let Err(e) = record_video(device_manager_vision_clone, config).await {
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

        handles.retain(|monitor_id, handle| {
            if handle.is_finished() {
                info!("handle for monitor {} has finished", monitor_id);
                false
            } else {
                true
            }
        });
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
            _ = tokio::time::sleep(Duration::from_secs_f64(1.0 / config.fps)) => {
                if let Some(frame) = video_capture.ocr_frame_queue.pop() {
                    for window_result in &frame.window_ocr_results {
                        match config.db.insert_frame(&device_name, None).await {
                            Ok(frame_id) => {
                                let text_json =
                                    serde_json::to_string(&window_result.text_json).unwrap_or_default();

                                let text = if config.use_pii_removal {
                                    &remove_pii(&window_result.text)
                                } else {
                                    &window_result.text
                                };

                                let _ = config.realtime_vision_sender.send(RealtimeVisionEvent::Ocr(
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
                                ));

                                if let Err(e) = config
                                    .db
                                    .insert_ocr_text(
                                        frame_id,
                                        text,
                                        &text_json,
                                        &window_result.app_name,
                                        &window_result.window_name,
                                        Arc::clone(&config.ocr_engine),
                                        window_result.focused,
                                    )
                                    .await
                                {
                                    error!(
                                        "Failed to insert OCR text: {}, skipping window {} of frame {}",
                                        e, window_result.window_name, frame_id
                                    );
                                    continue;
                                }
                            }
                            Err(e) => {
                                warn!("Failed to insert frame: {}", e);
                                tokio::time::sleep(Duration::from_millis(100)).await;
                                continue;
                            }
                        }
                    }
                }
            }
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
    languages: Vec<Language>,
    realtime_transcription_sender: Arc<tokio::sync::broadcast::Sender<RealtimeTranscriptionEvent>>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    let mut handles: HashMap<String, JoinHandle<()>> = HashMap::new();
    let mut device_states = device_manager.watch_devices().await;
    let mut previous_transcript = "".to_string();
    let mut previous_transcript_id: Option<i64> = None;
    let realtime_transcription_sender_clone = realtime_transcription_sender.clone();

    loop {
        tokio::select! {
            Some(state_change) = device_states.next() => {
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

                        let whisper_sender_clone = whisper_sender.clone();

                        let audio_device = Arc::new(audio_device);

                        let realtime_audio_devices_clone = realtime_audio_devices.clone();
                        let languages_clone = languages.clone();
                        let realtime_transcription_sender_clone =
                            realtime_transcription_sender_clone.clone();
                        let deepgram_api_key_clone = deepgram_api_key.clone();
                        let device_receiver_clone = device_manager.clone();
                        let device_receiver_clone_clone = device_receiver_clone.clone();
                        let handle = tokio::spawn(async move {
                            info!(
                                "starting audio capture thread for device: {}",
                                &audio_device
                            );

                            let mut did_warn = false;

                            let audio_device_clone = Arc::clone(&audio_device);
                            let deepgram_api_key = deepgram_api_key_clone.clone();
                            let is_running = Arc::new(AtomicBool::new(state_change.control.is_running));

                            while is_running.load(Ordering::Relaxed) {
                                let is_running_clone = is_running.clone();
                                let device_receiver_monitor = device_receiver_clone_clone.clone();
                                let device_id = audio_device_clone.to_string();

                                // Monitor device state changes
                                let mut device_states = device_receiver_monitor.watch_devices().await;
                                tokio::spawn(async move {
                                    while let Some(state_change) = device_states.next().await {
                                        if state_change.device == device_id && !state_change.control.is_running {
                                            is_running_clone.store(false, Ordering::Relaxed);
                                            break;
                                        }
                                    }
                                });

                                let deepgram_api_key = deepgram_api_key.clone();
                                let is_running_loop = Arc::clone(&is_running);
                                let audio_stream = match AudioStream::from_device(
                                    audio_device_clone.clone(),
                                    Arc::clone(&is_running_loop),
                                )
                                .await
                                {
                                    Ok(stream) => stream,
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

                                let mut recording_handles: Vec<JoinHandle<()>> = vec![];

                                let audio_stream = Arc::new(audio_stream);
                                let whisper_sender_clone = whisper_sender_clone.clone();
                                let audio_stream_clone = audio_stream.clone();
                                let is_running_loop_clone = is_running_loop.clone();
                                let record_handle = Some(tokio::spawn(async move {
                                    let _ = record_and_transcribe(
                                        audio_stream,
                                        chunk_duration,
                                        whisper_sender_clone.clone(),
                                        is_running_loop_clone.clone(),
                                    )
                                    .await;
                                }));

                                if let Some(handle) = record_handle {
                                    recording_handles.push(handle);
                                }

                                let audio_device_clone = audio_device_clone.clone();
                                let realtime_audio_devices_clone = realtime_audio_devices_clone.clone();
                                let languages_clone = languages_clone.clone();
                                let is_running_loop = is_running_loop.clone();
                                let realtime_transcription_sender_clone =
                                    realtime_transcription_sender_clone.clone();
                                let live_transcription_handle = Some(tokio::spawn(async move {
                                    if realtime_audio_enabled
                                        && realtime_audio_devices_clone.contains(&audio_device_clone)
                                    {
                                        let _ = start_realtime_recording(
                                            audio_stream_clone,
                                            languages_clone.clone(),
                                            is_running_loop.clone(),
                                            realtime_transcription_sender_clone.clone(),
                                            deepgram_api_key.clone(),
                                        )
                                        .await;
                                    }
                                }));

                                if let Some(handle) = live_transcription_handle {
                                    recording_handles.push(handle);
                                }

                                join_all(recording_handles).await;
                            }
                        });

                        handles.insert(device_id, handle);
                    }
                    _ => continue,
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {

            }
        }
        // Handle cleanup of finished handles
        handles.retain(|device_id, handle| {
            if handle.is_finished() {
                info!("handle for device {} has finished", device_id);
                false
            } else {
                true
            }
        });

        // Process transcription results
        while let Ok(mut transcription) = whisper_receiver.try_recv() {
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
            // Process the audio result
            match process_audio_result(
                &db,
                transcription,
                audio_transcription_engine.clone(),
                processed_previous,
                previous_transcript_id,
            )
            .await
            {
                Err(e) => error!("error processing audio result: {}", e),
                Ok(id) => previous_transcript_id = id,
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
