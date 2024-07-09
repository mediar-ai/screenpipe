use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use log::{debug, error, info};
use screenpipe_audio::{record_and_transcribe, AudioCaptureResult, DeviceSpec};
use screenpipe_vision::CaptureResult;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::time::Duration;
use std::{fs, thread};
use tokio::runtime::Runtime;
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
    control_rx: Receiver<RecorderControl>,
    enable_audio: bool,
    audio_devices: Vec<Arc<DeviceSpec>>,
) -> Result<()> {
    info!("Starting continuous recording");
    if !enable_audio {
        info!("Audio recording disabled");
    }

    let db_manager_video = Arc::clone(&db);
    let db_manager_audio = Arc::clone(&db);

    let is_running = Arc::new(AtomicBool::new(true));
    let is_running_video = Arc::clone(&is_running);
    let is_running_audio = Arc::clone(&is_running);

    let output_path_video = Arc::clone(&output_path);
    let output_path_audio = Arc::clone(&output_path);

    let video_handle = tokio::spawn(async move {
        record_video(db_manager_video, output_path_video, fps, is_running_video).await
    });

    let audio_handle = if enable_audio {
        let handle = tokio::spawn(async move {
            record_audio(
                db_manager_audio,
                output_path_audio,
                audio_chunk_duration,
                is_running_audio,
                audio_devices,
            )
            .await
        });
        Some(handle)
    } else {
        None
    };

    // Control loop
    tokio::spawn(async move {
        while let Ok(ctrl) = control_rx.recv() {
            match ctrl {
                RecorderControl::Stop => {
                    is_running.store(false, Ordering::SeqCst);
                    break;
                }
                _ => {} // Handle Pause and Resume if needed
            }
        }
    });

    video_handle.await??;
    if let Some(handle) = audio_handle {
        handle.await??;
    }

    info!("Continuous recording stopped");
    Ok(())
}

async fn record_video(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    let db_chunk_callback = Arc::clone(&db);
    let new_chunk_callback = move |file_path: &str| {
        let rt = Runtime::new().expect("Failed to create runtime");
        if let Err(e) = rt.block_on(db_chunk_callback.insert_video_chunk(file_path)) {
            error!("Failed to insert new video chunk: {}", e);
        }
    };

    let video_capture = VideoCapture::new(&output_path, fps, new_chunk_callback);

    while is_running.load(Ordering::SeqCst) {
        if let Some(frame) = video_capture.get_latest_frame() {
            match db.insert_frame().await {
                Ok(frame_id) => {
                    if let Err(e) = db.insert_ocr_text(frame_id, &frame.text).await {
                        error!("Failed to insert OCR text: {}", e);
                    }
                    debug!("Inserted frame {} with OCR text", frame_id);
                }
                Err(e) => {
                    error!("Failed to insert frame: {}", e);
                }
            }
        }
        tokio::time::sleep(Duration::from_secs_f64(1.0 / fps)).await;
    }

    video_capture.stop();
    Ok(())
}

async fn record_audio(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    chunk_duration: Duration,
    is_running: Arc<AtomicBool>,
    devices: Vec<Arc<DeviceSpec>>,
) -> Result<()> {
    let mut handles = vec![];

    for device_spec in devices {
        let db_clone = Arc::clone(&db);
        let output_path_clone = Arc::clone(&output_path);
        let is_running_clone = Arc::clone(&is_running);
        let device_spec_clone = Arc::clone(&device_spec);

        let handle = tokio::spawn(async move {
            let (result_tx, result_rx) = mpsc::channel();

            info!(
                "Starting audio capture thread for device: {}",
                &device_spec_clone
            );

            while is_running_clone.load(Ordering::SeqCst) {
                let recording_thread = thread::spawn({
                    let device_spec_clone = Arc::clone(&device_spec_clone);
                    let result_tx = result_tx.clone();
                    let output_path_clone = Arc::clone(&output_path_clone);
                    move || {
                        let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
                        let file_path = format!(
                            "{}/{}_{}.wav",
                            output_path_clone, device_spec_clone, new_file_name
                        );
                        record_and_transcribe(
                            device_spec_clone.as_ref(),
                            chunk_duration,
                            result_tx,
                            file_path.into(),
                        )
                    }
                });

                match recording_thread.join() {
                    Ok(Ok(file_path)) => {
                        info!(
                            "Recording complete for device {}: {:?}",
                            device_spec_clone, file_path
                        );
                        // Process the recorded chunk
                        while let Ok(result) = result_rx.try_recv() {
                            process_audio_result(
                                &db_clone,
                                &file_path.to_str().unwrap(),
                                &device_spec_clone,
                                result,
                            )
                            .await;
                        }
                    }
                    Ok(Err(e)) => error!("Error in record_and_transcribe: {}", e),
                    Err(e) => error!("Thread panicked: {:?}", e),
                }
            }
        });

        handles.push(handle);
    }

    for handle in handles {
        if let Err(e) = handle.await {
            error!("Error in audio recording task: {}", e);
        }
    }

    Ok(())
}

async fn process_audio_result(
    db: &DatabaseManager,
    output_path: &str,
    device_spec: &DeviceSpec,
    result: AudioCaptureResult,
) {
    info!("Inserting audio chunk: {}", output_path);
    match db.insert_audio_chunk(&output_path).await {
        Ok(audio_chunk_id) => {
            if let Err(e) = db
                .insert_audio_transcription(audio_chunk_id, &result.text, 0)
                .await
            {
                error!(
                    "Failed to insert audio transcription for device {}: {}",
                    device_spec, e
                );
            } else {
                debug!(
                    "Inserted audio transcription for chunk {} from device {}",
                    audio_chunk_id, device_spec
                );
            }
        }
        Err(e) => error!(
            "Failed to insert audio chunk for device {}: {}",
            device_spec, e
        ),
    }
}
