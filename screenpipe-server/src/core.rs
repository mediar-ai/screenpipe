use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use crossbeam::queue::SegQueue;
use external_cloud_integrations::friend_wearable::send_data_to_friend_wearable;
use log::{debug, error, info, warn};
use screenpipe_audio::{
    create_whisper_channel, record_and_transcribe, AudioDevice, AudioInput, DeviceControl,
    TranscriptionResult,
};
use screenpipe_vision::OcrEngine;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;

pub enum RecorderControl {
    Pause,
    Resume,
    Stop,
}

// Wrapper struct for DataOutput
pub struct DataOutputWrapper {
    pub data_output: rusty_tesseract::tesseract::output_data::DataOutput,
}

impl DataOutputWrapper {
    pub fn to_json(&self) -> String {
        let data_json: Vec<String> = self.data_output.data.iter().map(|d| {
            format!(
                r#"{{"level": {}, "page_num": {}, "block_num": {}, "par_num": {}, "line_num": {}, "word_num": {}, "left": {}, "top": {}, "width": {}, "height": {}, "conf": {}, "text": "{}"}}"#,
                d.level, d.page_num, d.block_num, d.par_num, d.line_num, d.word_num, d.left, d.top, d.width, d.height, d.conf, d.text
            )
        }).collect();
        format!(
            r#"{{"output": "{}", "data": [{}]}}"#,
            self.data_output.output,
            data_json.join(", ")
        )
    }
}

pub async fn start_continuous_recording(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    audio_chunk_duration: Duration,
    vision_control: Arc<AtomicBool>,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    save_text_files: bool,
    cloud_audio: bool,
    ocr_engine: Arc<OcrEngine>,
    friend_wearable_uid: Option<String>, // Updated parameter
) -> Result<()> {
    info!("Recording now");

    let (whisper_sender, whisper_receiver) = create_whisper_channel(cloud_audio).await?;

    let db_manager_video = Arc::clone(&db);
    let db_manager_audio = Arc::clone(&db);

    let is_running_video = Arc::clone(&vision_control);

    let output_path_video = Arc::clone(&output_path);
    let output_path_audio = Arc::clone(&output_path);

    let friend_wearable_uid_video = friend_wearable_uid.clone(); // Clone for video handle

    let video_handle = tokio::spawn(async move {
        record_video(
            db_manager_video,
            output_path_video,
            fps,
            is_running_video,
            save_text_files,
            ocr_engine,
            friend_wearable_uid_video, // Use the cloned version
        )
        .await
    });

    let audio_handle = tokio::spawn(async move {
        record_audio(
            db_manager_audio,
            output_path_audio,
            audio_chunk_duration,
            whisper_sender,
            whisper_receiver,
            audio_devices_control,
            friend_wearable_uid, // Use the original
        )
        .await
    });

    video_handle.await??;
    audio_handle.await??;

    info!("Stopped recording");
    Ok(())
}

async fn record_video(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    fps: f64,
    is_running: Arc<AtomicBool>,
    save_text_files: bool,
    ocr_engine: Arc<OcrEngine>,
    friend_wearable_uid: Option<String>, // Updated parameter
) -> Result<()> {
    debug!("record_video: Starting");
    let db_chunk_callback = Arc::clone(&db);
    let rt = tokio::runtime::Handle::current();
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
        &output_path,
        fps,
        new_chunk_callback,
        save_text_files,
        ocr_engine,
    );

    while is_running.load(Ordering::SeqCst) {
        if let Some(frame) = video_capture.ocr_frame_queue.lock().await.pop_front() {
            match db.insert_frame(&frame.app_name).await {
                Ok(frame_id) => {
                    let text_json = serde_json::to_string(&frame.text_json).unwrap_or_default();
                    let new_text_json_vs_previous_frame =
                        serde_json::to_string(&frame.new_text_json).unwrap_or_default();
                    let raw_data_output_from_ocr = DataOutputWrapper {
                        data_output: frame.data_output,
                    }
                    .to_json();

                    if let Err(e) = db
                        .insert_ocr_text(
                            frame_id,
                            &frame.text,
                            &text_json,
                            &new_text_json_vs_previous_frame,
                            &raw_data_output_from_ocr,
                            &frame.app_name,
                        )
                        .await
                    {
                        error!(
                            "Failed to insert OCR text: {}, skipping frame {}",
                            e, frame_id
                        );
                        continue; // Skip to the next iteration
                    }

                    // Send data to friend wearable
                    if let Some(uid) = &friend_wearable_uid {
                        if let Err(e) = send_data_to_friend_wearable(
                            "screen".to_string(),
                            frame_id.to_string(),
                            frame.text.clone(),
                            uid, // Pass the UID to the function
                        ) {
                            error!("Failed to send screen data to friend wearable: {}", e);
                        } else {
                            debug!("Sent screen data to friend wearable for frame {}", frame_id);
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to insert frame: {}", e);
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

async fn record_audio(
    db: Arc<DatabaseManager>,
    output_path: Arc<String>,
    chunk_duration: Duration,
    whisper_sender: UnboundedSender<AudioInput>,
    mut whisper_receiver: UnboundedReceiver<TranscriptionResult>,
    audio_devices_control: Arc<SegQueue<(AudioDevice, DeviceControl)>>,
    friend_wearable_uid: Option<String>, // Updated parameter
) -> Result<()> {
    let mut handles: HashMap<String, JoinHandle<()>> = HashMap::new();

    loop {
        // Non-blocking check for new device controls
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

            let output_path_clone = Arc::clone(&output_path);
            let whisper_sender_clone = whisper_sender.clone();

            let audio_device = Arc::new(audio_device);
            let device_control = Arc::new(device_control);

            let handle = tokio::spawn(async move {
                let audio_device_clone = Arc::clone(&audio_device);
                let device_control_clone = Arc::clone(&device_control);
                debug!(
                    "Starting audio capture thread for device: {}",
                    &audio_device
                );

                let mut iteration = 0;
                loop {
                    iteration += 1;
                    debug!(
                        "Starting iteration {} for device {}",
                        iteration, audio_device_clone
                    );

                    let output_path_clone = Arc::clone(&output_path_clone);
                    let whisper_sender = whisper_sender_clone.clone();
                    let audio_device_clone = audio_device_clone.clone();
                    let audio_device_clone_2 = audio_device_clone.clone();
                    let device_control_clone = device_control_clone.clone();

                    let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
                    let file_path = PathBuf::from(&*output_path_clone)
                        .join(format!("{}_{}.mp4", audio_device_clone, new_file_name))
                        .to_str()
                        .expect("Failed to create valid path")
                        .to_string();
                    debug!(
                        "Starting record_and_transcribe for device {} (iteration {})",
                        audio_device_clone, iteration
                    );
                    let result = record_and_transcribe(
                        audio_device_clone,
                        chunk_duration,
                        file_path.into(),
                        whisper_sender,
                        Arc::new(AtomicBool::new(device_control_clone.is_running)),
                    )
                    .await;
                    info!(
                        "Finished record_and_transcribe for device {} (iteration {})",
                        audio_device_clone_2, iteration
                    );

                    // Handle the recording result
                    match result {
                        Ok(file_path) => {
                            info!(
                                "Recording complete for device {} (iteration {}): {:?}",
                                audio_device, iteration, file_path
                            );
                        }
                        Err(e) => {
                            error!(
                                "Error in record_and_transcribe for device {} (iteration {}): {}, stopping thread",
                                audio_device, iteration, e
                            );
                            break; // Stop the loop on first error
                        }
                    }

                    info!(
                        "Finished iteration {} for device {}",
                        iteration, &audio_device
                    );
                }

                info!("Exiting audio capture thread for device: {}", &audio_device);
            });

            handles.insert(device_id, handle);
        }

        // Process existing handles
        handles.retain(|device_id, handle| {
            if handle.is_finished() {
                info!("Handle for device {} has finished", device_id);
                false // Remove from HashMap
            } else {
                true // Keep in HashMap
            }
        });

        // Process whisper results
        while let Ok(transcription) = whisper_receiver.try_recv() {
            info!("Received transcription");
            process_audio_result(&db, transcription, friend_wearable_uid.as_deref()).await;
        }

        // Small delay to prevent busy-waiting
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn process_audio_result(
    db: &DatabaseManager,
    result: TranscriptionResult,
    friend_wearable_uid: Option<&str>, // Updated parameter
) {
    if result.error.is_some() || result.transcription.is_none() {
        error!(
            "Error in audio recording: {}. Not inserting audio result",
            result.error.unwrap_or_default()
        );
        return;
    }
    let transcription = result.transcription.unwrap();

    info!("Inserting audio chunk: {:?}", transcription);
    match db.insert_audio_chunk(&result.input.path).await {
        Ok(audio_chunk_id) => {
            // if audio text is empty skip transcription insertion
            if transcription.is_empty() {
                return;
            }

            if let Err(e) = db
                .insert_audio_transcription(audio_chunk_id, &transcription, 0)
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

                // Send data to friend wearable
                if let Some(uid) = friend_wearable_uid {
                    if let Err(e) = send_data_to_friend_wearable(
                        "audio".to_string(),
                        audio_chunk_id.to_string(),
                        transcription.clone(),
                        uid, // Pass the UID to the function
                    ) {
                        error!("Failed to send data to friend wearable: {}", e);
                    } else {
                        debug!(
                            "Sent audio data to friend wearable for chunk {}",
                            audio_chunk_id
                        );
                    }
                }
            }
        }
        Err(e) => error!(
            "Failed to insert audio chunk for device {}: {}",
            result.input.device, e
        ),
    }
}
