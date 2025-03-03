use crate::cli::{CliVadEngine, CliVadSensitivity};
use crate::db_types::Speaker;
use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use dashmap::DashMap;
use futures::future::join_all;
use screenpipe_audio::vad_engine::VadSensitivity;
use screenpipe_audio::{
    create_whisper_channel, record_and_transcribe, vad_engine::VadEngineEnum, AudioDevice,
    AudioInput, AudioTranscriptionEngine, DeviceControl, TranscriptionResult,
};
use screenpipe_audio::{start_realtime_recording, AudioStream};
use screenpipe_core::pii_removal::remove_pii;
use screenpipe_core::Language;
use screenpipe_events::{poll_meetings_events, send_event};
use screenpipe_vision::core::WindowOcr;
use screenpipe_vision::OcrEngine;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

#[allow(clippy::too_many_arguments)]
pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    audio_chunk_duration: Duration,
    video_chunk_duration: Duration,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<DashMap<AudioDevice, DeviceControl>>,
    audio_disabled: bool,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    ocr_engine: Arc<OcrEngine>,
    monitor_ids: Vec<u32>,
    use_pii_removal: bool,
    vision_disabled: bool,
    vad_engine: CliVadEngine,
    vision_handle: &Handle,
    audio_handle: &Handle,
    ignored_windows: &[String],
    include_windows: &[String],
    deepgram_api_key: Option<String>,
    vad_sensitivity: CliVadSensitivity,
    languages: Vec<Language>,
    capture_unfocused_windows: bool,
    realtime_audio_devices: Vec<Arc<AudioDevice>>,
    realtime_audio_enabled: bool,
) -> Result<()> {
    debug!("Starting video recording for monitor {:?}", monitor_ids);
    let video_tasks = if !vision_disabled {
        monitor_ids
            .iter()
            .map(|&monitor_id| {
                let db_manager_video = Arc::clone(&db);
                let output_path_video = Arc::clone(&output_path);
                let is_running_video = Arc::clone(&vision_control);
                let ocr_engine = Arc::clone(&ocr_engine);
                let ignored_windows_video = ignored_windows.to_vec();
                let include_windows_video = include_windows.to_vec();

                let languages = languages.clone();

                debug!("Starting video recording for monitor {}", monitor_id);
                vision_handle.spawn(async move {
                    record_video(
                        db_manager_video,
                        output_path_video,
                        fps,
                        is_running_video,
                        ocr_engine,
                        monitor_id,
                        use_pii_removal,
                        &ignored_windows_video,
                        &include_windows_video,
                        video_chunk_duration,
                        languages.clone(),
                        capture_unfocused_windows,
                    )
                    .await
                })
            })
            .collect::<Vec<_>>()
    } else {
        vec![vision_handle.spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            Ok(())
        })]
    };

    let (whisper_sender, whisper_receiver, whisper_shutdown_flag) = if audio_disabled {
        // Create a dummy channel if no audio devices are available, e.g. audio disabled
        let (input_sender, _): (
            crossbeam::channel::Sender<AudioInput>,
            crossbeam::channel::Receiver<AudioInput>,
        ) = crossbeam::channel::bounded(100);
        let (_, output_receiver): (
            crossbeam::channel::Sender<TranscriptionResult>,
            crossbeam::channel::Receiver<TranscriptionResult>,
        ) = crossbeam::channel::bounded(100);
        (
            input_sender,
            output_receiver,
            Arc::new(AtomicBool::new(false)),
        )
    } else {
        create_whisper_channel(
            audio_transcription_engine.clone(),
            VadEngineEnum::from(vad_engine),
            deepgram_api_key.clone(),
            &PathBuf::from(output_path.as_ref()),
            VadSensitivity::from(vad_sensitivity),
            languages.clone(),
            Some(audio_devices_control.clone()),
        )
        .await
        .map_err(|e| {
            if e.to_string().contains("ORT API") {
                anyhow::anyhow!("ONNX Runtime initialization failed. This is likely due to missing Visual C++ Redistributable packages. Please install the latest Visual C++ Redistributable from https://aka.ms/vs/17/release/vc_redist.x64.exe and restart your computer. For more information, see: https://github.com/mediar-ai/screenpipe/issues/1034")
            } else {
                e
            }
        })?
    };
    let whisper_sender_clone = whisper_sender.clone();
    let db_manager_audio = Arc::clone(&db);

    tokio::spawn(async move {
        let _ = poll_meetings_events().await;
    });

    let audio_task = if !audio_disabled {
        audio_handle.spawn(async move {
            record_audio(
                db_manager_audio,
                audio_chunk_duration,
                whisper_sender,
                whisper_receiver,
                audio_devices_control,
                audio_transcription_engine,
                realtime_audio_enabled,
                realtime_audio_devices,
                languages,
                deepgram_api_key,
            )
            .await
        })
    } else {
        audio_handle.spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            Ok(())
        })
    };

    // Join all video tasks
    let video_results = join_all(video_tasks);

    // Handle any errors from the tasks
    for (i, result) in video_results.await.into_iter().enumerate() {
        if let Err(e) = result {
            error!("Video recording error for monitor {}: {:?}", i, e);
        }
    }
    if let Err(e) = audio_task.await {
        error!("Audio recording error: {:?}", e);
    }

    // Shutdown the whisper channel
    whisper_shutdown_flag.store(true, Ordering::Relaxed);
    drop(whisper_sender_clone); // Close the sender channel

    // TODO: process any remaining audio chunks
    // TODO: wait a bit for whisper to finish processing
    // TODO: any additional cleanup like device controls to release

    info!("Stopped recording");
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn record_video(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    is_running: Arc<AtomicBool>,
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

    while is_running.load(Ordering::SeqCst) {
        if let Some(frame) = video_capture.ocr_frame_queue.pop() {
            for window_result in &frame.window_ocr_results {
                match db
                    .insert_frame(
                        &device_name,
                        None,
                        window_result.browser_url.as_deref(),
                        Some(window_result.app_name.as_str()),
                        Some(window_result.window_name.as_str()),
                        window_result.focused,
                    )
                    .await
                {
                    Ok(frame_id) => {
                        let text_json =
                            serde_json::to_string(&window_result.text_json).unwrap_or_default();

                        let text = if use_pii_removal {
                            &remove_pii(&window_result.text)
                        } else {
                            &window_result.text
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
                                browser_url: window_result.browser_url.clone(),
                            },
                        );
                        if let Err(e) = db
                            .insert_ocr_text(frame_id, text, &text_json, Arc::clone(&ocr_engine))
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

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn record_audio(
    db: Arc<DatabaseManager>,
    chunk_duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    whisper_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    audio_devices_control: Arc<DashMap<AudioDevice, DeviceControl>>,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    realtime_audio_enabled: bool,
    realtime_audio_devices: Vec<Arc<AudioDevice>>,
    languages: Vec<Language>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    let mut handles: HashMap<String, JoinHandle<()>> = HashMap::new();
    let mut previous_transcript = "".to_string();
    let mut previous_transcript_id: Option<i64> = None;
    loop {
        // Iterate over DashMap entries and process each device
        for entry in audio_devices_control.iter() {
            let audio_device = entry.key().clone();
            let device_control = entry.value().clone();
            let device_id = audio_device.to_string();

            // Skip if we're already handling this device
            if handles.contains_key(&device_id) {
                continue;
            }

            info!("Received audio device: {}", &audio_device);

            if !device_control.is_running {
                info!("Device control signaled stop for device {}", &audio_device);
                if let Some(handle) = handles.remove(&device_id) {
                    handle.abort();
                    info!("Stopped thread for device {}", &audio_device);
                }
                // Remove from DashMap
                audio_devices_control.remove(&audio_device);
                continue;
            }

            let whisper_sender_clone = whisper_sender.clone();

            let audio_device = Arc::new(audio_device);
            let device_control = Arc::new(device_control);

            let realtime_audio_devices_clone = realtime_audio_devices.clone();
            let languages_clone = languages.clone();
            let deepgram_api_key_clone = deepgram_api_key.clone();
            let handle = tokio::spawn(async move {
                let audio_device_clone = Arc::clone(&audio_device);
                let deepgram_api_key = deepgram_api_key_clone.clone();
                debug!(
                    "Starting audio capture thread for device: {}",
                    &audio_device
                );

                let mut did_warn = false;
                let is_running = Arc::new(AtomicBool::new(device_control.is_running));

                while is_running.load(Ordering::Relaxed) {
                    let deepgram_api_key = deepgram_api_key.clone();
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
                    let live_transcription_handle = Some(tokio::spawn(async move {
                        if realtime_audio_enabled
                            && realtime_audio_devices_clone.contains(&audio_device_clone)
                        {
                            let _ = start_realtime_recording(
                                audio_stream_clone,
                                languages_clone.clone(),
                                is_running_loop.clone(),
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

            let offset_index = db
                .count_audio_transcriptions(audio_chunk_id)
                .await
                .unwrap_or(0);

            if let Err(e) = db
                .insert_audio_transcription(
                    audio_chunk_id,
                    &transcription,
                    offset_index,
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
