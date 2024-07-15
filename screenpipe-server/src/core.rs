use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use crossbeam::channel::{Receiver, Sender};
use log::{debug, error, info, warn};
use screenpipe_audio::{
    create_whisper_channel, record_and_transcribe, AudioDevice, AudioInput, DeviceControl,
    TranscriptionResult,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tokio::task::JoinHandle;
pub enum RecorderControl {
    Pause,
    Resume,
    Stop,
}

pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    audio_chunk_duration: Duration,
    full_control: std::sync::mpsc::Receiver<RecorderControl>,
    vision_control: Arc<AtomicBool>,
    audio_devices_control_receiver: Receiver<(AudioDevice, DeviceControl)>,
) -> Result<()> {
    info!("Recording now");

    let (whisper_sender, whisper_receiver) = create_whisper_channel()?;

    let db_manager_video = Arc::clone(&db);
    let db_manager_audio = Arc::clone(&db);

    let is_running_video = Arc::clone(&vision_control);

    let output_path_video = Arc::clone(&output_path);
    let output_path_audio = Arc::clone(&output_path);

    let video_handle = tokio::spawn(async move {
        record_video(db_manager_video, output_path_video, fps, is_running_video).await
    });

    let audio_handle = tokio::spawn(async move {
        record_audio(
            db_manager_audio,
            output_path_audio,
            audio_chunk_duration,
            whisper_sender,
            whisper_receiver,
            audio_devices_control_receiver,
        )
        .await
    });

    // Control loop
    let control_handle = tokio::spawn(async move {
        while let Ok(ctrl) = full_control.recv() {
            match ctrl {
                RecorderControl::Stop => {
                    vision_control.store(false, Ordering::SeqCst);
                    // stop all audio devices
                    // TODO not implemented
                }
                RecorderControl::Pause => {
                    // pause all audio devices
                }
                RecorderControl::Resume => {
                    vision_control.store(true, Ordering::SeqCst);
                    // resume all audio devices
                }
            }
        }
    });

    video_handle.await??;
    audio_handle.await??;
    control_handle.await?;

    info!("Stopped recording");
    Ok(())
}

async fn record_video(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    let db_chunk_callback = Arc::clone(&db);
    let rt = tokio::runtime::Handle::current();
    let new_chunk_callback = move |file_path: &str| {
        let db_chunk_callback = Arc::clone(&db_chunk_callback);
        let file_path = file_path.to_string();
        rt.spawn(async move {
            if let Err(e) = db_chunk_callback.insert_video_chunk(&file_path).await {
                error!("Failed to insert new video chunk: {}", e);
            }
        });
    };
    let video_capture = VideoCapture::new(&output_path, fps, new_chunk_callback);

    while is_running.load(Ordering::SeqCst) {
        if let Some(frame) = video_capture.get_latest_frame().await {
            match db.insert_frame().await {
                Ok(frame_id) => {
                    if let Err(e) = db.insert_ocr_text(frame_id, &frame.text).await {
                        error!("Failed to insert OCR text: {}", e);
                    }
                    debug!("Inserted frame {} with OCR text", frame_id);
                }
                Err(e) => {
                    warn!("Failed to insert frame: {}", e);
                    // Add a small delay before retrying
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    continue; // Skip to the next iteration
                }
            }
        }
        tokio::time::sleep(Duration::from_secs_f64(1.0 / fps)).await;
    }

    video_capture.stop().await;
    Ok(())
}

use crossbeam::channel::TryRecvError;

async fn record_audio(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    chunk_duration: Duration,
    whisper_sender: Sender<AudioInput>,
    whisper_receiver: Receiver<TranscriptionResult>,
    audio_devices_control_receiver: Receiver<(AudioDevice, DeviceControl)>,
) -> Result<()> {
    let mut handles: HashMap<String, JoinHandle<()>> = HashMap::new();

    loop {
        match audio_devices_control_receiver.try_recv() {
            Ok((audio_device, device_control)) => {
                info!("Received audio device: {}", &audio_device);
                let device_id = audio_device.to_string();

                let db_clone = Arc::clone(&db);
                let output_path_clone = Arc::clone(&output_path);
                let whisper_sender_clone = whisper_sender.clone();
                let whisper_receiver_clone = whisper_receiver.clone();

                if !device_control.is_running {
                    info!("Device control signaled stop for device {}", &audio_device);
                    if let Some(handle) = handles.remove(&device_id) {
                        handle.await.unwrap();
                        info!("Stopped thread for device {}", &audio_device);
                    }
                    continue;
                }

                let audio_device = Arc::new(audio_device);
                let device_control = Arc::new(device_control);
                let handle = tokio::spawn(async move {
                    let audio_device_clone = Arc::clone(&audio_device);
                    let device_control_clone = Arc::clone(&device_control);
                    info!(
                        "Starting audio capture thread for device: {}",
                        &audio_device
                    );

                    let mut iteration = 0;
                    loop {
                        iteration += 1;
                        info!(
                            "Starting iteration {} for device {}",
                            iteration, audio_device_clone
                        );

                        // TODO: tokio this is bad to mix tokio/os thread
                        let recording_thread = thread::spawn({
                            let output_path_clone = Arc::clone(&output_path_clone);
                            let whisper_sender = whisper_sender_clone.clone();
                            let audio_device_clone = audio_device_clone.clone();
                            let device_control_clone = device_control_clone.clone();
                            move || {
                                let new_file_name =
                                    Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
                                let file_path = format!(
                                    "{}/{}_{}.mp3",
                                    output_path_clone, audio_device_clone, new_file_name
                                );
                                info!(
                                    "Starting record_and_transcribe for device {} (iteration {})",
                                    audio_device_clone, iteration
                                );
                                let result = record_and_transcribe(
                                    &audio_device_clone,
                                    chunk_duration,
                                    file_path.into(),
                                    whisper_sender,
                                    Arc::new(AtomicBool::new(device_control_clone.is_running)),
                                );
                                info!(
                                    "Finished record_and_transcribe for device {} (iteration {})",
                                    audio_device_clone, iteration
                                );
                                result
                            }
                        });

                        // Handle the recording thread result
                        match recording_thread.join() {
                            Ok(Ok(file_path)) => {
                                info!(
                                    "Recording complete for device {} (iteration {}): {:?}",
                                    audio_device, iteration, file_path
                                );
                                let whisper_receiver = whisper_receiver_clone.clone();

                                // Process the recorded chunk
                                match whisper_receiver.recv() {
                                    Ok(transcription) => {
                                        info!(
                                            "Received transcription for device {} (iteration {})",
                                            audio_device, iteration
                                        );
                                        process_audio_result(&db_clone, transcription).await;
                                    }
                                    Err(e) => error!(
                                        "Failed to receive transcription for device {} (iteration {}): {}",
                                        audio_device, iteration, e
                                    ),
                                }
                            }
                            Ok(Err(e)) => error!(
                                "Error in record_and_transcribe for device {} (iteration {}): {}",
                                audio_device, iteration, e
                            ),
                            Err(e) => error!(
                                "Thread panicked for device {} (iteration {}): {:?}",
                                audio_device, iteration, e
                            ),
                        }

                        info!(
                            "Finished iteration {} for device {}",
                            iteration, &audio_device
                        );
                    }
                });

                handles.insert(device_id, handle);
            }
            Err(TryRecvError::Empty) => {
                // No new messages, continue with other tasks
            }
            Err(TryRecvError::Disconnected) => {
                // Channel is closed, exit the loop
                break;
            }
        }

        // Process existing audio devices
        handles.retain(|device_id, handle| {
            if handle.is_finished() {
                info!("Audio capture thread for device {} has finished", device_id);
                false // Remove this handle from the map
            } else {
                true // Keep this handle in the map
            }
        });

        // Short sleep to prevent busy-waiting
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    // Wait for all remaining handles to complete
    for (device_id, handle) in handles {
        if let Err(e) = handle.await {
            error!(
                "Error in audio recording task for device {}: {}",
                device_id, e
            );
        }
    }

    Ok(())
}

async fn process_audio_result(db: &DatabaseManager, result: TranscriptionResult) {
    info!("Inserting audio chunk: {:?}", result.transcription);
    if result.error.is_some() || result.transcription.is_none() {
        error!(
            "Error in audio recording: {}",
            result.error.unwrap_or_default()
        );
        return;
    }
    let transcription = result.transcription.unwrap();
    match db.insert_audio_chunk(&result.input.path).await {
        Ok(audio_chunk_id) => {
            if let Err(e) = db
                .insert_audio_transcription(audio_chunk_id, &transcription, 0) // TODO index is in the text atm
                .await
            {
                error!(
                    "Failed to insert audio transcription for device {}: {}",
                    result.input.device, e
                );
            } else {
                debug!(
                    "Inserted audio transcription for chunk {} from device {}",
                    audio_chunk_id, result.input.device
                );
            }
        }
        Err(e) => error!(
            "Failed to insert audio chunk for device {}: {}",
            result.input.device, e
        ),
    }
}
