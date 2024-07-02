use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use log::{debug, error, info};
use screenpipe_audio::{continuous_audio_capture, save_audio_to_file, ControlMessage};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

pub enum RecorderControl {
    Pause,
    Resume,
    Stop,
}

pub fn start_continuous_recording(
    db_path: &str,
    output_path: &str,
    fps: f64,
    audio_chunk_duration: Duration,
    control_rx: Receiver<RecorderControl>,
) -> Result<()> {
    info!("Starting continuous recording");
    let db_manager = Arc::new(Mutex::new(DatabaseManager::new(db_path)?));
    let db_manager_clone = db_manager.clone();

    let new_chunk_callback = {
        let db_manager = db_manager.clone();
        move |file_path: String| {
            let mut db = db_manager.lock().unwrap();
            if let Err(e) = db.start_new_video_chunk(&file_path) {
                error!("Failed to insert new video chunk: {}", e);
            }
        }
    };

    let video_capture = VideoCapture::new(&output_path, fps, new_chunk_callback);
    let control_rx = Arc::new(Mutex::new(control_rx));
    let control_rx_video = Arc::clone(&control_rx);
    let control_rx_audio = Arc::clone(&control_rx);

    let (audio_control_tx, audio_control_rx) = mpsc::channel();
    let (audio_result_tx, audio_result_rx) = mpsc::channel();

    let audio_thread = thread::spawn(move || {
        info!("Starting audio capture thread");
        continuous_audio_capture(audio_control_rx, audio_result_tx, audio_chunk_duration)
    });
    let video_thread = thread::spawn(move || {
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
                    let mut db = db_manager.lock().unwrap();
                    match db.insert_frame() {
                        Ok(frame_id) => {
                            if let Err(e) = db.insert_text_for_frame(frame_id, &frame.text) {
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
            thread::sleep(Duration::from_secs_f64(1.0 / fps));
        }
        Ok::<_, anyhow::Error>(())
    });

    let output_path_clone = output_path.to_string();

    let audio_processing_thread = thread::spawn(move || {
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
                        // Create an audio file
                        let time = Utc::now();
                        let file_path = format!("{}/{}.wav", output_path_clone, time);
                        info!("Saving audio chunk to {}", file_path);
                        match save_audio_to_file(&result.audio, &file_path) {
                            Ok(_) => info!("Successfully saved audio file"),
                            Err(e) => error!("Failed to save audio file: {}", e),
                        }

                        let db = db_manager_clone.lock().unwrap();
                        match db.insert_audio_chunk(&file_path) {
                            Ok(audio_chunk_id) => {
                                debug!("Inserted audio chunk with id: {}", audio_chunk_id);
                                if let Err(e) =
                                    db.insert_audio_transcription(audio_chunk_id, &result.text, 0)
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

    // Wait for threads to finish
    info!("Waiting for threads to finish");
    video_thread.join().unwrap()?;
    audio_processing_thread.join().unwrap()?;
    audio_control_tx.send(ControlMessage::Stop)?;
    audio_thread.join().unwrap()?;

    info!("Continuous recording stopped");
    Ok(())
}
