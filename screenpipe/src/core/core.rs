use crate::core::DatabaseManager;
use chrono::Utc;
use image::DynamicImage;
use rusty_tesseract::{image_to_string, Args, Image};
use std::io::Cursor;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::mpsc::channel;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;
use threadpool::ThreadPool;
use xcap::Monitor;

use super::embed;

const FRAME_BUFFER_SIZE: usize = 30;
const SCREENSHOT_INTERVAL: Duration = Duration::from_secs(2);
const OCR_THREAD_POOL_SIZE: usize = 4;
const IMAGE_ENCODE_THREADS: usize = 4;

enum ControlMessage {
    Pause,
    Resume,
    Stop,
}

pub struct CaptureHandles {
    // pub capture_handle: thread::JoinHandle<()>,
    pub stream_handle: thread::JoinHandle<()>,
    pub control_sender: mpsc::Sender<ControlMessage>,
}

impl CaptureHandles {
    pub fn pause_recording(&self) {
        self.control_sender.send(ControlMessage::Pause).unwrap();
    }

    pub fn stop_recording(&self) {
        self.control_sender.send(ControlMessage::Stop).unwrap();
    }
}

pub fn start_recording(
    local_data_dir: String,
    db: Arc<Mutex<Option<DatabaseManager>>>,
) -> CaptureHandles {
    println!("starting recording...");
    let config_path = "models/gte-small/config.json";
    let tokenizer_path = "models/gte-small/tokenizer.json";
    let weights_path = "models/gte-small/model.safetensors";

    let (control_sender, control_receiver) = mpsc::channel();

    // Initialize the model first
    embed::init_model(config_path, tokenizer_path, weights_path, false);

    let frame_buffer = Arc::new((Mutex::new(Vec::new()), Condvar::new()));
    let ocr_pool = ThreadPool::new(OCR_THREAD_POOL_SIZE);

    // Capture thread
    let buffer_clone = frame_buffer.clone();

    let local_data_dir_capture_handle = local_data_dir.clone();

    let db_capture_ref = db.clone();
    let capture_handle = thread::spawn(move || {
        capture_screenshots(
            buffer_clone,
            &ocr_pool,
            control_receiver,
            local_data_dir_capture_handle,
            db_capture_ref,
        )
        .expect("Error capturing screenshots");
    });

    let local_data_dir_stream_handle = local_data_dir.clone();

    let db_stream_ref = db.clone();
    let stream_handle = thread::spawn(move || {
        // Main thread for processing frames
        let (buffer, cvar) = &*frame_buffer;
        loop {
            let mut frames = buffer.lock().unwrap();
            while frames.len() < FRAME_BUFFER_SIZE {
                println!("waiting for frames...");
                frames = cvar.wait(frames).unwrap();
            }

            // Drain frames and process with FFmpeg
            let frames_to_process = frames.drain(..).collect::<Vec<_>>();
            stream_to_ffmpeg(
                frames_to_process,
                local_data_dir_stream_handle.clone(),
                db_stream_ref.clone(),
            );
        }
    });

    return CaptureHandles {
        // capture_handle,
        stream_handle,
        control_sender,
    };
}

fn capture_screenshots(
    frame_buffer: Arc<(Mutex<Vec<DynamicImage>>, Condvar)>,
    ocr_pool: &ThreadPool,
    control_receiver: mpsc::Receiver<ControlMessage>,
    local_data_dir: String,
    db: Arc<Mutex<Option<DatabaseManager>>>,
) -> Result<(), Box<dyn std::error::Error>> {
    let monitors = Monitor::all()?; // Use xcap to get all monitors
    let monitor = monitors.first().unwrap();
    let mut is_paused = false;
    let local_data_dir_clone = local_data_dir.clone();

    let db_process_ref = db.clone();
    loop {
        // Check for control messages
        if let Ok(message) = control_receiver.try_recv() {
            match message {
                ControlMessage::Pause => is_paused = true,
                ControlMessage::Resume => is_paused = false,
                ControlMessage::Stop => {
                    // Process the frames
                    process_remaining_frames(
                        &frame_buffer,
                        local_data_dir_clone,
                        db_process_ref.clone(),
                    );
                    return Ok(());
                }
            }
        }

        if is_paused {
            // If paused, sleep for a bit and continue the loop to keep checking for new messages
            thread::sleep(Duration::from_millis(100));
            continue;
        }

        let buffer = monitor.capture_image()?; // Use xcap to capture the screen
        let image = DynamicImage::ImageRgba8(buffer.clone());

        let db_frame_id_ref = db.clone();
        let frame_id = {
            let mut db_clone = db_frame_id_ref.lock().unwrap();
            db_clone.as_mut().unwrap().insert_frame(None)?
        };

        let db_ocr_ref = db.clone();
        // Send image to OCR thread pool
        let image_clone = image.clone();
        ocr_pool.execute(move || {
            let _ocr_result = match perform_ocr(&image_clone) {
                Ok(result) => {
                    // Embed the recognized text!
                    // let embeddings = embed::generate_embeddings(&result);
                    // println!("Embeddings length: {}", embeddings.len);
                    db_ocr_ref
                        .lock()
                        .unwrap()
                        .as_mut()
                        .unwrap()
                        .insert_text_for_frame(frame_id, &result)
                        .expect(&format!("Failed to insert text for frame: {}", frame_id));
                    result
                }
                Err(e) => {
                    println!("OCR Failed! {:?}", e);
                    return;
                }
            };

            // Here's where we'll write to the DB
        });

        let (lock, cvar) = &*frame_buffer;
        let mut frames = lock.lock().unwrap();
        frames.push(image);

        if frames.len() >= FRAME_BUFFER_SIZE {
            println!("buffer size met!! {:?}", frames.len());
            cvar.notify_one();
        }

        thread::sleep(SCREENSHOT_INTERVAL);
    }
}

fn perform_ocr(dynamic_image: &DynamicImage) -> Result<String, Box<dyn std::error::Error>> {
    let args = Args::default();
    let image = Image::from_dynamic_image(dynamic_image).unwrap();

    // OCR
    let text = image_to_string(&image, &args)?;
    println!("OCR: {}", text);

    Ok(text)
}

fn stream_to_ffmpeg(
    frames: Vec<DynamicImage>,
    local_data_dir: String,
    db: Arc<Mutex<Option<DatabaseManager>>>,
) {
    let encode_pool = ThreadPool::new(IMAGE_ENCODE_THREADS); // Define NUM_ENCODE_THREADS based on your CPU
    print!("getting ready to stream..");
    let time = Utc::now();
    let local_data_dir_clone = local_data_dir.clone();
    let output_name = format!("{}/output-{}.mp4", local_data_dir_clone, time);
    let mut child = Command::new("ffmpeg")
        .args([
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-i",
            "-",
            //"-vcodec",
            //"h264_videotoolbox",
            "-vcodec",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "25",
            &output_name,
        ])
        .stdin(Stdio::piped())
        .spawn()
        .expect("Failed to start FFmpeg");

    let _ = {
        db.lock()
            .unwrap()
            .as_mut()
            .unwrap()
            .start_new_video_chunk(&output_name)
            .expect("Failed to start a new video chunk")
    };

    print!("opened stdin...");
    let mut stdin = child.stdin.take().expect("Failed to open stdin");
    let (sender, receiver) = channel();

    print!("ready to write...");

    for frame in frames {
        let sender = sender.clone();

        encode_pool.execute(move || {
            let mut cursor = Cursor::new(Vec::new());

            frame
                .write_to(&mut cursor, image::ImageFormat::Png)
                .expect("Failed to write frame to buffer");

            sender
                .send(cursor.into_inner())
                .expect("Failed to send png buffer.");
        });
    }

    drop(sender);

    for png_buffer in receiver {
        stdin
            .write_all(&png_buffer)
            .expect("Failed to write to stdin");
    }

    println!("finished writing to stdin");

    stdin.flush().expect("Failed to flush stdin");

    println!("flushed");
    drop(stdin);

    println!("dropped");
    let _ = child.wait().expect("FFmpeg process wasn't running");
    println!("waited?");
}

fn process_remaining_frames(
    frame_buffer: &Arc<(Mutex<Vec<DynamicImage>>, Condvar)>,
    local_data_dir: String,
    db: Arc<Mutex<Option<DatabaseManager>>>,
) {
    let local_data_dir_clone = local_data_dir.clone();
    let (mutex, _) = &**frame_buffer;
    let mut frames = mutex.lock().unwrap();

    if !frames.is_empty() {
        let frames_to_process = frames.drain(..).collect::<Vec<_>>();
        stream_to_ffmpeg(frames_to_process, local_data_dir_clone, db.clone());
    }
}
