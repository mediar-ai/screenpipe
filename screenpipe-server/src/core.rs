use crate::cli::{CliVadEngine, CliVadSensitivity};
use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use crossbeam::queue::SegQueue;
use futures::future::join_all;
use log::{debug, error, info, warn};
use screenpipe_audio::audio_processing::AudioInput;
use screenpipe_audio::encode::encode_single_audio;
use screenpipe_audio::vad_engine::{SileroVad, VadEngine};
use screenpipe_audio::{
    create_whisper_channel, AudioDevice, AudioTranscriptionEngine, DeviceControl,
    TranscriptionResult,
};
use screenpipe_audio::{record_and_transcribe, AudioStream};
use screenpipe_core::pii_removal::remove_pii;
use screenpipe_core::Language;
use screenpipe_vision::OcrEngine;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    data_dir: Arc<PathBuf>,
    fps: f64,
    audio_chunk_duration: Duration,
    video_chunk_duration: Duration,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    audio_disabled: bool,
    save_text_files: bool,
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
    transcription_sender: Arc<broadcast::Sender<TranscriptionResult>>,
) -> Result<()> {
    debug!("Starting video recording for monitor {:?}", monitor_ids);
    let video_tasks = if !vision_disabled {
        monitor_ids
            .iter()
            .map(|&monitor_id| {
                let db_manager_video = Arc::clone(&db);
                let data_dir_video = Arc::clone(&data_dir);
                let is_running_video = Arc::clone(&vision_control);
                let ocr_engine = Arc::clone(&ocr_engine);
                let ignored_windows_video = ignored_windows.to_vec();
                let include_windows_video = include_windows.to_vec();

                let languages = languages.clone();

                debug!("Starting video recording for monitor {}", monitor_id);
                vision_handle.spawn(async move {
                    record_video(
                        db_manager_video,
                        data_dir_video,
                        fps,
                        is_running_video,
                        save_text_files,
                        ocr_engine,
                        monitor_id,
                        use_pii_removal,
                        &ignored_windows_video,
                        &include_windows_video,
                        video_chunk_duration,
                        languages.clone(),
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
            deepgram_api_key,
            languages.clone(),
        )
        .await?
    };

    let mut vad_engine: Box<dyn VadEngine + Send> = match vad_engine {
        CliVadEngine::Silero => Box::new(SileroVad::new().await?),
    };
    vad_engine.set_sensitivity(vad_sensitivity.into());
    let vad_engine = Arc::new(Mutex::new(vad_engine));

    let whisper_sender_clone = whisper_sender.clone();
    let db_manager_audio = Arc::clone(&db);

    let audio_task = if !audio_disabled {
        audio_handle.spawn(async move {
            record_audio(
                db_manager_audio,
                audio_chunk_duration,
                whisper_sender,
                whisper_receiver,
                audio_devices_control,
                audio_transcription_engine,
                vad_engine,
                data_dir,
                transcription_sender,
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

async fn record_video(
    db: Arc<DatabaseManager>,
    data_dir: Arc<PathBuf>,
    fps: f64,
    is_running: Arc<AtomicBool>,
    save_text_files: bool,
    ocr_engine: Arc<OcrEngine>,
    monitor_id: u32,
    use_pii_removal: bool,
    ignored_windows: &[String],
    include_windows: &[String],
    video_chunk_duration: Duration,
    languages: Vec<Language>,
) -> Result<()> {
    debug!("record_video: Starting");
    let db_chunk_callback = Arc::clone(&db);
    let rt = Handle::current();
    let new_chunk_callback = move |file_path: &str| {
        let db_chunk_callback = Arc::clone(&db_chunk_callback);
        let file_path = file_path.to_string();
        rt.spawn(async move {
            if let Err(e) = db_chunk_callback.insert_video_chunk(&file_path).await {
                error!("Failed to insert new video chunk: {}", e);
            }
            debug!("record_video: Inserted new video chunk: {}", file_path);
        });
    };

    let video_capture = VideoCapture::new(
        Arc::clone(&data_dir),
        fps,
        video_chunk_duration,
        new_chunk_callback,
        save_text_files,
        Arc::clone(&ocr_engine),
        monitor_id,
        ignored_windows,
        include_windows,
        languages,
    );

    while is_running.load(Ordering::SeqCst) {
        if let Some(frame) = video_capture.ocr_frame_queue.pop() {
            for window_result in &frame.window_ocr_results {
                match db.insert_frame().await {
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

    Ok(())
}

async fn record_audio(
    db: Arc<DatabaseManager>,
    chunk_duration: Duration,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    whisper_receiver: crossbeam::channel::Receiver<TranscriptionResult>,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    data_dir: Arc<PathBuf>,
    transcription_sender: Arc<broadcast::Sender<TranscriptionResult>>,
) -> Result<()> {
    let mut handles: HashMap<String, JoinHandle<()>> = HashMap::new();
    let mut device_transcripts: HashMap<String, (String, Option<i64>)> = HashMap::new();
    let mut buffer_frames: HashMap<String, (Vec<String>, Vec<f32>)> = HashMap::new();

    // Clone data_dir once, outside all loops
    let data_dir_clone = Arc::clone(&data_dir);

    loop {
        while let Some((audio_device, device_control)) = audio_devices_control.pop() {
            let vad_engine_clone = vad_engine.clone();
            let data_dir_clone = Arc::clone(&data_dir_clone);

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
                // Use data_dir_clone here
                let audio_device_clone = Arc::clone(&audio_device);
                // let error = Arc::new(AtomicBool::new(false));
                debug!(
                    "Starting audio capture thread for device: {}",
                    &audio_device
                );

                let audio_stream = match AudioStream::from_device(
                    audio_device_clone.clone(),
                    Arc::new(AtomicBool::new(device_control.clone().is_running)),
                    vad_engine_clone,
                    Duration::from_millis(100),
                )
                .await
                {
                    Ok(stream) => stream,
                    Err(e) => {
                        error!("Failed to create audio stream: {}", e);
                        return;
                    }
                };

                let audio_stream = Arc::new(audio_stream);
                let device_control_clone = Arc::clone(&device_control);
                let whisper_sender_clone = whisper_sender_clone.clone();
                let audio_device = Arc::clone(&audio_device_clone);

                let stt_handle = tokio::spawn(async move {
                    let _ = record_and_transcribe(
                        audio_stream,
                        chunk_duration,
                        whisper_sender_clone.clone(),
                        Arc::new(AtomicBool::new(device_control_clone.is_running)),
                        data_dir_clone.clone(),
                    )
                    .await;
                });

                // let live_transcription_handle = tokio::spawn(async move {
                //     let _ = live_transcription(audio_stream, whisper_sender_clone.clone()).await;
                // });

                stt_handle.await.unwrap();
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

            // Broadcast the transcription // TODO: should also broadcast updates below somehow good ux
            if let Err(e) = transcription_sender.send(transcription.clone()) {
                error!("failed to broadcast transcription: {}", e);
            }

            // Get device-specific previous transcript
            let device_id = transcription.input.device.to_string();
            let (previous_transcript, previous_transcript_id) = device_transcripts
                .entry(device_id.clone())
                .or_insert((String::new(), None));

            // Process with device-specific state
            let mut current_transcript: Option<String> = transcription.transcription.clone();
            let mut processed_previous = String::new();
            if let Some((previous, current)) =
                transcription.cleanup_overlap(previous_transcript.clone())
            {
                current_transcript = Some(current);
                processed_previous = previous;
            }

            transcription.transcription = current_transcript.clone();
            *previous_transcript = current_transcript.unwrap_or_default();
            let sample_rate = transcription.input.sample_rate;
            // buffer frames & transcript unless we have reached the chunk duration
            let frames = buffer_frames
                .entry(device_id.clone())
                .or_insert((Vec::new(), Vec::new()));

            // Buffer both transcription and frames
            if let Some(transcript) = transcription.transcription {
                frames.0.push(transcript);
            }
            frames.1.extend(
                transcription
                    .input
                    .data
                    .iter()
                    .flat_map(|segment| segment.frames.iter())
                    .copied(), // Add .copied() to get owned f32 values
            );

            // Check if we've reached the chunk duration
            let total_frames = frames.1.len();
            let frames_per_chunk =
                (chunk_duration.as_secs_f32() * transcription.input.sample_rate as f32) as usize;

            if total_frames < frames_per_chunk {
                info!(
                    "buffering frames until encoding & saving to db: {}/{}",
                    total_frames, frames_per_chunk
                );
                continue; // Wait for more frames
            }

            // We have enough frames, process them but keep remainder
            let (mut buffered_transcripts, mut frames_to_process) = buffer_frames
                .get_mut(&device_id)
                .map(|f| (std::mem::take(&mut f.0), std::mem::take(&mut f.1)))
                .unwrap_or_default();

            // Split frames at chunk boundary
            let remainder_frames = frames_to_process.split_off(frames_per_chunk);

            // Keep the last transcript if there are remaining frames
            let remainder_transcript = if !remainder_frames.is_empty() {
                buffered_transcripts.pop()
            } else {
                None
            };

            // Put remainder back in buffer
            if !remainder_frames.is_empty() || remainder_transcript.is_some() {
                if let Some(buffer) = buffer_frames.get_mut(&device_id) {
                    if let Some(transcript) = remainder_transcript {
                        buffer.0.push(transcript);
                    }
                    buffer.1 = remainder_frames;
                }
            }

            // Join transcripts with spaces
            let combined_transcript = buffered_transcripts.join(" ");

            // Update device state with new transcript ID
            let device_name = transcription.input.device.to_string();
            if let Ok(new_id) = process_audio_result(
                &db,
                TranscriptionResult {
                    transcription: Some(combined_transcript),
                    ..transcription
                },
                audio_transcription_engine.clone(),
                processed_previous,
                *previous_transcript_id,
            )
            .await
            {
                *previous_transcript_id = new_id;
            }
            let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
            let sanitized_device_name = device_name.replace(['/', '\\'], "_");
            let file_path =
                data_dir_clone.join(format!("{}_{}.mp4", sanitized_device_name, new_file_name));
            encode_single_audio(&frames_to_process, sample_rate, 1, Arc::new(file_path)).unwrap();
        }

        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn process_audio_result(
    db: &DatabaseManager,
    result: TranscriptionResult,
    audio_transcription_engine: Arc<AudioTranscriptionEngine>,
    previous_transcript: String,
    previous_transcript_id: Option<i64>,
) -> Result<Option<i64>, anyhow::Error> {
    if result.error.is_some() || result.transcription.is_none() {
        error!(
            "Error in audio recording: {}. Not inserting audio result",
            result.error.unwrap_or_default()
        );
        return Ok(None);
    }

    let transcription = result.transcription.unwrap();
    let transcription_engine = audio_transcription_engine.to_string();
    let mut chunk_id: Option<i64> = None;

    info!(
        "device {} inserting audio chunk: {:?}",
        result.input.device, result.input.output_path
    );
    if let Some(id) = previous_transcript_id {
        match db
            .update_audio_transcription(id, previous_transcript.as_str())
            .await
        {
            Ok(_) => {}
            Err(e) => error!(
                "Failed to update transcription for {}: audio_chunk_id {}",
                result.input.device, e
            ),
        }
    }
    match db
        .insert_audio_chunk(&result.input.output_path.to_string_lossy())
        .await
    {
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
