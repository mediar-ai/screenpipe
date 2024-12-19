use crate::cli::{CliVadEngine, CliVadSensitivity};
use crate::db_types::Speaker;
use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use crossbeam::queue::SegQueue;
use log::{debug, error, info, warn};
use screenpipe_audio::vad_engine::VadSensitivity;
use screenpipe_audio::AudioStream;
use screenpipe_audio::{
    create_whisper_channel, record_and_transcribe, vad_engine::VadEngineEnum, AudioDevice,
    AudioInput, AudioTranscriptionEngine, DeviceControl, TranscriptionResult,
};
use screenpipe_core::pii_removal::remove_pii;
use screenpipe_core::Language;
use screenpipe_vision::OcrEngine;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

#[derive(Clone)]
pub struct ShutdownSignal {
    tx: broadcast::Sender<()>,
}

impl ShutdownSignal {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.tx.subscribe()
    }

    pub fn signal(&self) {
        let _ = self.tx.send(());
    }
}

pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    audio_chunk_duration: Duration,
    video_chunk_duration: Duration,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    audio_disabled: bool,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    ocr_engine: Arc<OcrEngine>,
    monitor_ids: Vec<u32>,
    use_pii_removal: bool,
    vision_disabled: bool,
    vad_engine: CliVadEngine,
    ignored_windows: &[String],
    include_windows: &[String],
    deepgram_api_key: Option<String>,
    vad_sensitivity: CliVadSensitivity,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    shutdown: ShutdownSignal,
    #[cfg(feature = "keyboard")] enable_keyboard: bool,
) -> Result<()> {
    let mut shutdown_rx = shutdown.subscribe();

    // Create channels for each component
    let (whisper_sender, whisper_receiver, whisper_shutdown_flag) = if audio_disabled {
        create_dummy_channels()
    } else {
        create_whisper_channel(
            audio_transcription_engine.clone(),
            VadEngineEnum::from(vad_engine),
            deepgram_api_key,
            &PathBuf::from(output_path.as_ref()),
            VadSensitivity::from(vad_sensitivity),
            languages.clone(),
        )
        .await?
    };

    let whisper_sender_shutdown = whisper_sender.clone();

    // Spawn video recording tasks
    let video_tasks = if !vision_disabled {
        monitor_ids
            .iter()
            .map(|&monitor_id| {
                let db = Arc::clone(&db);
                let output_path = Arc::clone(&output_path);
                let ocr_engine = Arc::clone(&ocr_engine);
                let ignored_windows = ignored_windows.to_vec();
                let include_windows = include_windows.to_vec();
                let languages = languages.clone();
                let mut shutdown_rx = shutdown.subscribe();

                tokio::spawn(async move {
                    loop {
                        tokio::select! {
                            result = record_video(
                                db.clone(),
                                output_path.clone(),
                                fps,
                                ocr_engine.clone(),
                                monitor_id,
                                use_pii_removal,
                                &ignored_windows,
                                &include_windows,
                                video_chunk_duration,
                                languages.clone(),
                                capture_unfocused_windows,
                            ) => {
                                if let Err(e) = result {
                                    error!("video recording error: {}", e);
                                }
                                break;
                            }
                            _ = shutdown_rx.recv() => {
                                debug!("received shutdown signal for video recording");
                                break;
                            }
                        }
                    }
                    Ok::<(), anyhow::Error>(())
                })
            })
            .collect()
    } else {
        vec![]
    };

    // Spawn audio recording task
    let audio_task = if !audio_disabled {
        let db = Arc::clone(&db);
        let mut shutdown_rx = shutdown.subscribe();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = record_audio(
                        db.clone(),
                        audio_chunk_duration,
                        whisper_sender_shutdown.clone(),
                        whisper_receiver.clone(),
                        audio_devices_control.clone(),
                        audio_transcription_engine.clone(),
                    ) => {
                        if let Err(e) = result {
                            error!("audio recording error: {}", e);
                        }
                        break;
                    }
                    _ = shutdown_rx.recv() => {
                        debug!("received shutdown signal for audio recording");
                        break;
                    }
                }
            }
            Ok::<(), anyhow::Error>(())
        })
    } else {
        tokio::spawn(async { Ok(()) })
    };

    // Spawn keyboard recording task if enabled
    #[cfg(feature = "keyboard")]
    let keyboard_task = if enable_keyboard {
        let db = Arc::clone(&db);
        let mut shutdown_rx = shutdown.subscribe();

        tokio::spawn(async move {
            use screenpipe_core::KeyboardCapture;
            use tokio::sync::mpsc;

            let (tx, mut rx) = mpsc::channel(100);
            let keyboard_capture = Arc::new(KeyboardCapture::new(tx));
            let keyboard_capture_clone = keyboard_capture.clone();

            tokio::select! {
                _ = async {
                    let keyboard_future = keyboard_capture.start();
                    tokio::select! {
                        _ = keyboard_future => {},
                        _ = async {
                            while let Some(event) = rx.recv().await {
                                if let Err(e) = db.insert_keyboard_event(
                                    event.timestamp,
                                    &event.key,
                                    &event.event_type.to_string(),
                                ).await {
                                    error!("Failed to insert keyboard event: {}", e);
                                }
                            }
                        } => {}
                    }
                } => {},
                _ = shutdown_rx.recv() => {
                    debug!("received shutdown signal for keyboard recording");
                    keyboard_capture_clone.stop();
                }
            }

            Ok::<(), anyhow::Error>(())
        })
    } else {
        tokio::spawn(async { Ok::<(), anyhow::Error>(()) })
    };

    // Wait for shutdown signal
    shutdown_rx.recv().await?;
    info!("initiating graceful shutdown");

    // Signal whisper to shutdown
    whisper_shutdown_flag.store(true, Ordering::Relaxed);

    // Wait for all tasks to complete
    let results = futures::future::join_all(video_tasks).await;
    for (i, result) in results.into_iter().enumerate() {
        if let Err(e) = result {
            error!("video task {} error during shutdown: {:?}", i, e);
        }
    }

    if let Err(e) = audio_task.await {
        error!("audio task error during shutdown: {:?}", e);
    }

    #[cfg(feature = "keyboard")]
    if let Err(e) = keyboard_task.await {
        error!("keyboard task error during shutdown: {:?}", e);
    }

    info!("all recording tasks completed");
    Ok(())
}

fn create_dummy_channels() -> (
    crossbeam::channel::Sender<AudioInput>,
    crossbeam::channel::Receiver<TranscriptionResult>,
    Arc<AtomicBool>,
) {
    let (input_sender, _) = crossbeam::channel::bounded(1);
    let (_, output_receiver) = crossbeam::channel::bounded(1);
    (
        input_sender,
        output_receiver,
        Arc::new(AtomicBool::new(false)),
    )
}

async fn record_video(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    ocr_engine: Arc<OcrEngine>,
    monitor_id: u32,
    use_pii_removal: bool,
    ignored_windows: &[String],
    include_windows: &[String],
    video_chunk_duration: Duration,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
) -> Result<()> {
    debug!("record_video: Starting");
    let db_chunk_callback = Arc::clone(&db);
    let rt = Handle::current();
    let device_name = Arc::new(format!("monitor_{}", monitor_id));

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
        &output_path,
        fps,
        video_chunk_duration,
        new_chunk_callback,
        Arc::clone(&ocr_engine),
        monitor_id,
        ignored_windows,
        include_windows,
        languages,
        capture_unfocused_windows,
    );

    loop {
        if let Some(frame) = video_capture.ocr_frame_queue.pop() {
            for window_result in &frame.window_ocr_results {
                match db.insert_frame(&device_name, None).await {
                    Ok(frame_id) => {
                        let text_json =
                            serde_json::to_string(&window_result.text_json).unwrap_or_default();

                        let text = if use_pii_removal {
                            &remove_pii(&window_result.text)
                        } else {
                            &window_result.text
                        };
                        if let Err(e) = db
                            .insert_ocr_text(
                                frame_id,
                                text,
                                &text_json,
                                &window_result.app_name,
                                &window_result.window_name,
                                Arc::clone(&ocr_engine),
                                window_result.focused, // Add this line
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
        tokio::time::sleep(Duration::from_secs_f64(1.0 / fps)).await;
    }
}

async fn record_audio(
    db: Arc<DatabaseManager>,
    chunk_duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    whisper_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
) -> Result<()> {
    let mut handles: HashMap<String, JoinHandle<()>> = HashMap::new();
    let mut previous_transcript = "".to_string();
    let mut previous_transcript_id: Option<i64> = None;
    loop {
        while let Some((audio_device, device_control)) = audio_devices_control.pop() {
            debug!("Received audio device: {}", &audio_device);
            let device_id = audio_device.to_string();

            if !device_control.is_running {
                info!("Device control signaled stop for device {}", &audio_device);
                if let Some(handle) = handles.remove(&device_id) {
                    handle.abort();
                    info!("Stopped thread for device {}", &audio_device);
                }
                continue;
            }

            let whisper_sender_clone = whisper_sender.clone();

            let audio_device = Arc::new(audio_device);
            let device_control = Arc::new(device_control);

            let handle = tokio::spawn(async move {
                let audio_device_clone = Arc::clone(&audio_device);
                // let error = Arc::new(AtomicBool::new(false));
                debug!(
                    "Starting audio capture thread for device: {}",
                    &audio_device
                );

                let mut did_warn = false;
                let is_running = Arc::new(AtomicBool::new(device_control.is_running));

                while is_running.load(Ordering::Relaxed) {
                    let is_running_loop = Arc::clone(&is_running); // Create separate reference for the loop
                    let audio_stream = match AudioStream::from_device(
                        audio_device_clone.clone(),
                        Arc::clone(&is_running_loop), // Clone from original Arc
                    )
                    .await
                    {
                        Ok(stream) => stream,
                        Err(e) => {
                            if e.to_string().contains("Audio device not found") {
                                if !did_warn {
                                    warn!("Audio device not found: {}", audio_device.name);
                                    did_warn = true;
                                }
                                tokio::time::sleep(Duration::from_secs(1)).await;
                                continue;
                            } else {
                                error!("Failed to create audio stream: {}", e);
                                return;
                            }
                        }
                    };

                    let audio_stream = Arc::new(audio_stream);
                    let whisper_sender_clone = whisper_sender_clone.clone();
                    let record_handle = Some(tokio::spawn(async move {
                        let _ = record_and_transcribe(
                            audio_stream,
                            chunk_duration,
                            whisper_sender_clone.clone(),
                            is_running_loop.clone(),
                        )
                        .await;
                    }));

                    // let live_transcription_handle = tokio::spawn(async move {
                    //     let _ = live_transcription(audio_stream, whisper_sender_clone.clone()).await;
                    // });

                    if let Some(handle) = record_handle {
                        handle.await.unwrap();
                    }
                }

                info!("exiting audio capture thread for device: {}", &audio_device);
            });

            handles.insert(device_id, handle);
        }

        handles.retain(|device_id, handle| {
            if handle.is_finished() {
                info!("Handle for device {} has finished", device_id);
                false
            } else {
                true
            }
        });

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
                Err(e) => error!("Error processing audio result: {}", e),
                Ok(id) => previous_transcript_id = id,
            }
        }

        tokio::time::sleep(Duration::from_millis(100)).await;
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
            "Error in audio recording: {}. Not inserting audio result",
            result.error.unwrap_or_default()
        );
        return Ok(None);
    }

    let speaker = get_or_create_speaker_from_embedding(db, &result.speaker_embedding).await?;

    info!("Detected speaker: {:?}", speaker);

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
                    "Failed to update transcription for {}: audio_chunk_id {}",
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
                    "Failed to insert audio transcription for device {}: {}",
                    result.input.device, e
                );
                return Ok(Some(audio_chunk_id));
            } else {
                debug!(
                    "Inserted audio transcription for chunk {} from device {} using {}",
                    audio_chunk_id, result.input.device, transcription_engine
                );
                chunk_id = Some(audio_chunk_id);
            }
        }
        Err(e) => error!(
            "Failed to insert audio chunk for device {}: {}",
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
        Err(e) => Err(anyhow::anyhow!("Failed to merge speakers: {}", e)),
    }
}
