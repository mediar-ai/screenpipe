use crate::{DatabaseManager, VideoCapture};
use anyhow::Result;
use chrono::Utc;
use log::{debug, error, info};
use screenpipe_audio::{
    continuous_audio_capture, save_audio_to_file, ControlMessage as AudioControlMessage,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
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
    control_rx: Receiver<RecorderControl>,
    enable_audio: bool,
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
) -> Result<()> {
    let (audio_control_tx, audio_control_rx) = mpsc::channel();
    let (audio_result_tx, audio_result_rx) = mpsc::channel();

    let audio_thread = thread::spawn(move || {
        info!("Starting audio capture thread");
        continuous_audio_capture(audio_control_rx, audio_result_tx, chunk_duration)
    });

    while is_running.load(Ordering::SeqCst) {
        match audio_result_rx.recv_timeout(Duration::from_secs(1)) {
            Ok(result) => {
                let time = Utc::now();
                let file_path = format!("{}/{}.wav", output_path, time);
                if let Err(e) = save_audio_to_file(&result.audio, &file_path) {
                    error!("Failed to save audio file: {}", e);
                    continue;
                }

                match db.insert_audio_chunk(&file_path).await {
                    Ok(audio_chunk_id) => {
                        if let Err(e) = db
                            .insert_audio_transcription(audio_chunk_id, &result.text, 0)
                            .await
                        {
                            error!("Failed to insert audio transcription: {}", e);
                        } else {
                            debug!("Inserted audio transcription for chunk {}", audio_chunk_id);
                        }
                    }
                    Err(e) => error!("Failed to insert audio chunk: {}", e),
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(e) => {
                error!("Failed to receive audio chunk: {}", e);
                break;
            }
        }
    }

    audio_control_tx.send(AudioControlMessage::Stop).unwrap();
    let _ = audio_thread.join().expect("Failed to join audio thread");
    Ok(())
}
