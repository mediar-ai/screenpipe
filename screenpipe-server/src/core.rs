use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use crossbeam::channel::{Receiver, Sender};
use log::{debug, error, info};
use screenpipe_audio::{
    create_whisper_channel, record_and_transcribe, AudioInput, DeviceControl, DeviceSpec,
    TranscriptionResult,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;
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
    control_rx: std::sync::mpsc::Receiver<RecorderControl>,
    enable_audio: bool,
    audio_devices: Vec<Arc<DeviceSpec>>,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<RwLock<HashMap<String, Arc<DeviceControl>>>>,
) -> Result<()> {
    info!("Starting continuous recording");
    if !enable_audio {
        info!("Audio recording disabled");
    }

    let (whisper_sender, whisper_receiver) = create_whisper_channel()?;

    let db_manager_video = Arc::clone(&db);
    let db_manager_audio = Arc::clone(&db);

    let is_running_video = Arc::clone(&vision_control);
    let is_running_audio = Arc::clone(&vision_control);
    let device_controls_clone = Arc::clone(&audio_devices_control);

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
                whisper_sender,
                whisper_receiver,
                Arc::clone(&audio_devices_control),
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
                    vision_control.store(false, Ordering::SeqCst);
                    control_all_devices(&device_controls_clone, RecorderControl::Stop);
                    break;
                }
                RecorderControl::Pause => {
                    control_all_devices(&device_controls_clone, RecorderControl::Pause)
                }
                RecorderControl::Resume => {
                    control_all_devices(&device_controls_clone, RecorderControl::Resume)
                }
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
    whisper_sender: Sender<AudioInput>,
    whisper_receiver: Receiver<TranscriptionResult>,
    device_controls: Arc<RwLock<HashMap<String, Arc<DeviceControl>>>>,
) -> Result<()> {
    let mut handles = vec![];

    for device_spec in devices {
        let db_clone = Arc::clone(&db);
        let output_path_clone = Arc::clone(&output_path);
        let is_running_clone = Arc::clone(&is_running);
        let device_spec_clone = Arc::clone(&device_spec);
        let whisper_sender_clone = whisper_sender.clone();
        let whisper_receiver_clone = whisper_receiver.clone();

        let device_control = Arc::new(DeviceControl {
            is_running: Arc::new(AtomicBool::new(true)),
            is_paused: Arc::new(AtomicBool::new(false)),
        });

        device_controls
            .write()
            .unwrap()
            .insert(device_spec.to_string(), Arc::clone(&device_control));

        let handle = tokio::spawn(async move {
            info!(
                "Starting audio capture thread for device: {}",
                &device_spec_clone
            );

            let mut iteration = 0;
            while is_running_clone.load(Ordering::SeqCst) {
                iteration += 1;
                info!(
                    "Starting iteration {} for device {}",
                    iteration, &device_spec_clone
                );

                let recording_thread = thread::spawn({
                    let device_spec_clone = Arc::clone(&device_spec_clone);
                    let output_path_clone = Arc::clone(&output_path_clone);
                    let whisper_sender = whisper_sender_clone.clone();
                    let device_control_clone = Arc::clone(&device_control);

                    move || {
                        let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
                        let file_path = format!(
                            "{}/{}_{}.mp3",
                            output_path_clone, device_spec_clone, new_file_name
                        );
                        info!(
                            "Starting record_and_transcribe for device {} (iteration {})",
                            device_spec_clone, iteration
                        );
                        let result = record_and_transcribe(
                            device_spec_clone.as_ref(),
                            chunk_duration,
                            file_path.into(),
                            whisper_sender,
                            device_control_clone,
                        );
                        info!(
                            "Finished record_and_transcribe for device {} (iteration {})",
                            device_spec_clone, iteration
                        );
                        result
                    }
                });

                // Handle the recording thread result
                match recording_thread.join() {
                    Ok(Ok(file_path)) => {
                        info!(
                            "Recording complete for device {} (iteration {}): {:?}",
                            device_spec_clone, iteration, file_path
                        );
                        let whisper_receiver = whisper_receiver_clone.clone();

                        // Process the recorded chunk
                        match whisper_receiver.recv() {
                            Ok(transcription) => {
                                info!(
                                    "Received transcription for device {} (iteration {})",
                                    device_spec_clone, iteration
                                );
                                process_audio_result(&db_clone, transcription).await;
                            }
                            Err(e) => error!(
                                "Failed to receive transcription for device {} (iteration {}): {}",
                                device_spec_clone, iteration, e
                            ),
                        }
                    }
                    Ok(Err(e)) => error!(
                        "Error in record_and_transcribe for device {} (iteration {}): {}",
                        device_spec_clone, iteration, e
                    ),
                    Err(e) => error!(
                        "Thread panicked for device {} (iteration {}): {:?}",
                        device_spec_clone, iteration, e
                    ),
                }

                if !device_control.is_running.load(Ordering::SeqCst) {
                    info!(
                        "Device control signaled stop for device {} after iteration {}",
                        device_spec_clone, iteration
                    );
                    break;
                }

                info!(
                    "Finished iteration {} for device {}",
                    iteration, &device_spec_clone
                );
            }

            info!(
                "Exiting audio capture thread for device: {}",
                &device_spec_clone
            );
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

pub fn control_all_devices(
    device_controls: &Arc<RwLock<HashMap<String, Arc<DeviceControl>>>>,
    command: RecorderControl,
) {
    let controls = device_controls.read();
    for control in controls.unwrap().values() {
        match command {
            RecorderControl::Pause => control.is_paused.store(true, Ordering::SeqCst),
            RecorderControl::Resume => control.is_paused.store(false, Ordering::SeqCst),
            RecorderControl::Stop => control.is_running.store(false, Ordering::SeqCst),
        }
    }
}
