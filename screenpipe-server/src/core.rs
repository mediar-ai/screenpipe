use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use log::{debug, error, info};
use screenpipe_audio::{continuous_audio_capture, save_audio_to_file, ControlMessage};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
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
    output_path: &str,
    fps: f64,
    audio_chunk_duration: Duration,
    control_rx: Receiver<RecorderControl>,
    enable_audio: bool,
) -> Result<()> {
    info!("Starting continuous recording");
    if !enable_audio {
        info!("Audio recording disabled");
    }

    let db_manager_video = Arc::clone(&db);
    let db_manager_audio = Arc::clone(&db);

    let new_chunk_callback = move |file_path: String| {
        let db_manager = Arc::clone(&db);
        let rt = Runtime::new().expect("Failed to create runtime");
        if let Err(e) = rt.block_on(db_manager.insert_video_chunk(&file_path)) {
            error!("Failed to insert new video chunk: {}", e);
        }
    };
    let video_capture = VideoCapture::new(output_path, fps, new_chunk_callback);
    let control_rx = Arc::new(Mutex::new(control_rx));
    let control_rx_video = Arc::clone(&control_rx);
    let control_rx_audio = Arc::clone(&control_rx);

    let video_thread = thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let _ = runtime.block_on(async {
            info!("Starting video capture thread");
            let mut is_paused = false;
            loop {
                match control_rx_video.lock().unwrap().try_recv() {
                    Ok(RecorderControl::Pause) => {
                        info!("Pausing video capture");
                        is_paused = true;
                    }
                    Ok(RecorderControl::Resume) => {
                        info!("Resuming video capture");
                        is_paused = false;
                    }
                    Ok(RecorderControl::Stop) => {
                        info!("Stopping video capture");
                        break;
                    }
                    Err(_) => {}
                }

                if !is_paused {
                    if let Some(frame) = video_capture.get_latest_frame() {
                        match db_manager_video.insert_frame().await {
                            Ok(frame_id) => {
                                if let Err(e) = db_manager_video
                                    .insert_ocr_text(frame_id, &frame.text)
                                    .await
                                {
                                    error!("Failed to insert OCR text: {}", e);
                                    return Err(e.into());
                                }
                                debug!("Inserted frame {} with OCR text", frame_id);
                            }
                            Err(e) => {
                                error!("Failed to insert frame: {}", e);
                                return Err(e.into());
                            }
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs_f64(1.0 / fps)).await;
            }
            Ok::<_, anyhow::Error>(())
        });
    });

    if enable_audio {
        let (audio_control_tx, audio_control_rx) = mpsc::channel();
        let (audio_result_tx, audio_result_rx) = mpsc::channel();

        let audio_thread = thread::spawn(move || {
            info!("Starting audio capture thread");
            continuous_audio_capture(audio_control_rx, audio_result_tx, audio_chunk_duration)
        });

        let output_path_clone = output_path.to_string();

        let audio_processing_thread = thread::spawn(move || {
            let runtime = tokio::runtime::Runtime::new().unwrap();
            let _ = runtime.block_on(async {
                info!("Starting audio processing thread");
                let mut is_paused = false;
                loop {
                    match control_rx_audio.lock().unwrap().try_recv() {
                        Ok(RecorderControl::Pause) => {
                            info!("Pausing audio processing");
                            is_paused = true;
                        }
                        Ok(RecorderControl::Resume) => {
                            info!("Resuming audio processing");
                            is_paused = false;
                        }
                        Ok(RecorderControl::Stop) => {
                            info!("Stopping audio processing");
                            break;
                        }
                        Err(_) => {}
                    }

                    if !is_paused {
                        match audio_result_rx.recv() {
                            Ok(result) => {
                                info!("Received audio chunk, processing...");
                                info!("Audio chunk size: {}", result.audio.len());
                                let time = Utc::now();
                                let file_path = format!("{}/{}.wav", output_path_clone, time);
                                info!("Saving audio chunk to {}", file_path);
                                match save_audio_to_file(&result.audio, &file_path) {
                                    Ok(_) => info!("Successfully saved audio file"),
                                    Err(e) => error!("Failed to save audio file: {}", e),
                                }

                                match db_manager_audio.insert_audio_chunk(&file_path).await {
                                    Ok(audio_chunk_id) => {
                                        debug!("Inserted audio chunk with id: {}", audio_chunk_id);
                                        if let Err(e) = db_manager_audio
                                            .insert_audio_transcription(
                                                audio_chunk_id,
                                                &result.text,
                                                0,
                                            )
                                            .await
                                        // TODO offset
                                        {
                                            error!("Failed to insert audio transcription: {}", e);
                                        } else {
                                            debug!(
                                                "Inserted audio transcription for chunk {}",
                                                audio_chunk_id
                                            );
                                        }
                                    }
                                    Err(e) => error!("Failed to insert audio chunk: {}", e),
                                }
                            }
                            Err(e) => {
                                error!("Failed to receive audio chunk: {}", e);
                            }
                        }
                    }
                }
                Ok::<_, anyhow::Error>(())
            });
        });

        // Wait for threads to finish
        info!("Waiting for threads to finish");
        video_thread.join().unwrap();
        audio_processing_thread.join().unwrap();
        audio_control_tx.send(ControlMessage::Stop).unwrap();
        let _ = audio_thread.join().unwrap();
    } else {
        // Only wait for video thread if audio is disabled
        info!("Waiting for video thread to finish");
        video_thread.join().unwrap();
    }

    info!("Continuous recording stopped");
    Ok(())
}
