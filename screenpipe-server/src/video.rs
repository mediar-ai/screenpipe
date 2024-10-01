use chrono::Utc;
use crossbeam::queue::ArrayQueue;
use image::ImageFormat::{self};
use log::{debug, error};
use log::{info, warn};
use screenpipe_core::find_ffmpeg_path;
use screenpipe_vision::{continuous_capture, CaptureResult, OcrEngine};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::mpsc::{channel, Receiver, Sender};
use tokio::time::{sleep, timeout};

const MAX_FPS: f64 = 30.0; // Adjust based on your needs
const MAX_QUEUE_SIZE: usize = 10;

pub struct VideoCapture {
    #[allow(unused)]
    video_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
    pub ocr_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
}

impl VideoCapture {
    pub fn new(
        output_path: &str,
        fps: f64,
        video_chunk_duration: Duration,
        new_chunk_callback: impl Fn(&str) + Send + Sync + 'static,
        save_text_files: bool,
        ocr_engine: Arc<OcrEngine>,
        monitor_id: u32,
        ignore_list: &[String],
        include_list: &[String],
    ) -> Self {
        info!("Starting new video capture");
        let fps = if fps.is_finite() && fps > 0.0 {
            fps
        } else {
            warn!("Invalid FPS value: {}. Using default of 1.0", fps);
            1.0
        };
        let interval = Duration::from_secs_f64(1.0 / fps);
        let video_frame_queue = Arc::new(ArrayQueue::new(MAX_QUEUE_SIZE));
        let ocr_frame_queue = Arc::new(ArrayQueue::new(MAX_QUEUE_SIZE));
        let new_chunk_callback = Arc::new(new_chunk_callback);
        let new_chunk_callback_clone = Arc::clone(&new_chunk_callback);

        let capture_video_frame_queue = video_frame_queue.clone();
        let capture_ocr_frame_queue = ocr_frame_queue.clone();
        let (result_sender, mut result_receiver) = channel(512);
        let ignore_list_clone = ignore_list.to_vec();
        let include_list_clone = include_list.to_vec();
        let _capture_thread = tokio::spawn(async move {
            continuous_capture(
                result_sender,
                interval,
                save_text_files,
                *ocr_engine,
                monitor_id,
                &ignore_list_clone,
                &include_list_clone,
            )
            .await;
        });

        info!("Started capture thread");

        // In the _queue_thread
        let _queue_thread = tokio::spawn(async move {
            // Helper function to push to queue and handle errors
            fn push_to_queue(
                queue: &ArrayQueue<Arc<CaptureResult>>,
                result: &Arc<CaptureResult>,
                queue_name: &str,
            ) -> bool {
                if queue.push(Arc::clone(result)).is_err() {
                    if queue.pop().is_none() {
                        error!("{} queue is in an inconsistent state", queue_name);
                        return false;
                    }
                    if queue.push(Arc::clone(result)).is_err() {
                        error!(
                            "Failed to push to {} queue after removing oldest frame",
                            queue_name
                        );
                        return false;
                    }
                    debug!("{} queue was full, dropped oldest frame", queue_name);
                }
                true
            }
            while let Some(result) = result_receiver.recv().await {
                let frame_number = result.frame_number;
                debug!("Received frame {} for queueing", frame_number);

                let result = Arc::new(result);

                let video_pushed = push_to_queue(&capture_video_frame_queue, &result, "Video");
                let ocr_pushed = push_to_queue(&capture_ocr_frame_queue, &result, "OCR");

                if !video_pushed || !ocr_pushed {
                    error!(
                        "Failed to push frame {} to one or more queues",
                        frame_number
                    );
                    continue; // Skip to next iteration instead of crashing
                }

                debug!(
                    "Frame {} pushed to queues. Queue lengths: {}, {}",
                    frame_number,
                    capture_video_frame_queue.len(),
                    capture_ocr_frame_queue.len()
                );
            }
        });

        let video_frame_queue_clone = video_frame_queue.clone();

        let output_path = output_path.to_string();
        let _video_thread = tokio::spawn(async move {
            save_frames_as_video(
                &video_frame_queue_clone,
                &output_path,
                fps,
                new_chunk_callback_clone,
                monitor_id,
                video_chunk_duration,
            )
            .await;
        });

        VideoCapture {
            video_frame_queue,
            ocr_frame_queue,
        }
    }
}
async fn save_frames_as_video(
    frame_queue: &Arc<ArrayQueue<Arc<CaptureResult>>>,
    output_path: &str,
    fps: f64,
    new_chunk_callback: Arc<dyn Fn(&str) + Send + Sync>,
    monitor_id: u32,
    video_chunk_duration: Duration,
) {
    debug!("Starting save_frames_as_video function");
    let frames_per_video = (fps * video_chunk_duration.as_secs_f64()).ceil() as usize;
    let mut frame_count = 0;
    let (sender, mut receiver): (Sender<Vec<u8>>, Receiver<Vec<u8>>) = channel(512);
    let sender = Arc::new(sender);
    let mut current_ffmpeg: Option<Child> = None;
    let mut current_stdin: Option<ChildStdin> = None;

    loop {
        if frame_count >= frames_per_video || current_ffmpeg.is_none() {
            debug!("Starting new FFmpeg process");
            // Close previous FFmpeg process if exists
            if let Some(child) = current_ffmpeg.take() {
                drop(current_stdin.take()); // Ensure stdin is closed
                let output = child
                    .wait_with_output()
                    .await
                    .expect("ffmpeg process failed");
                debug!("FFmpeg process exited with status: {}", output.status);
                if !output.status.success() {
                    error!("FFmpeg stderr: {}", String::from_utf8_lossy(&output.stderr));
                }
            }
            // Reset frame count
            frame_count = 0;

            // Wait for at least one frame before starting a new FFmpeg process
            let first_frame = loop {
                if let Some(result) = frame_queue.pop() {
                    debug!("Got first frame for new chunk");
                    break result;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            };

            // Encode the first frame
            let mut buffer = Vec::new();
            first_frame
                .image
                .write_to(&mut std::io::Cursor::new(&mut buffer), ImageFormat::Png)
                .expect("Failed to encode first frame");

            let time = Utc::now();
            let formatted_time = time.format("%Y-%m-%d_%H-%M-%S").to_string();
            // Start new FFmpeg process with a new output file
            let output_file = PathBuf::from(output_path)
                .join(format!("monitor_{}_{}.mp4", monitor_id, formatted_time))
                .to_str()
                .expect("Failed to create valid path")
                .to_string();

            // Call the callback with the new video chunk file path
            new_chunk_callback(&output_file);

            match start_ffmpeg_process(&output_file, fps).await {
                Ok(mut child) => {
                    let mut stdin = child.stdin.take().expect("Failed to open stdin");
                    let stderr = child.stderr.take().expect("Failed to open stderr");
                    let stdout = child.stdout.take().expect("Failed to open stdout");

                    // Write the first frame to FFmpeg
                    stdin
                        .write_all(&buffer)
                        .await
                        .expect("Failed to write first frame to ffmpeg");
                    frame_count += 1;

                    // Spawn a task to log FFmpeg's stderr
                    tokio::spawn(async move {
                        let reader = BufReader::new(stderr);
                        let mut lines = reader.lines();
                        while let Ok(Some(line)) = lines.next_line().await {
                            debug!("FFmpeg: {}", line);
                        }
                    });

                    // Log FFmpeg's stdout
                    tokio::spawn(async move {
                        let reader = BufReader::new(stdout);
                        let mut lines = reader.lines();
                        while let Ok(Some(line)) = lines.next_line().await {
                            debug!("FFmpeg: {}", line);
                        }
                    });

                    current_ffmpeg = Some(child);
                    current_stdin = Some(stdin);
                    debug!("New FFmpeg process started for file: {}", output_file);
                }
                Err(e) => {
                    error!("Failed to start FFmpeg process: {}", e);
                    // Handle the error appropriately, maybe try to restart or exit
                }
            }
        }

        if let Some(result) = frame_queue.pop() {
            debug!("Processing frame in video.rs"); // {}", frame_count + 1
            let sender = Arc::clone(&sender);

            tokio::spawn(async move {
                let mut buffer = Vec::new();
                match result
                    .image
                    .write_to(&mut std::io::Cursor::new(&mut buffer), ImageFormat::Png)
                {
                    Ok(_) => {
                        sender
                            .send(buffer)
                            .await
                            .expect("Failed to send encoded frame");
                    }
                    Err(e) => error!("Failed to encode image as PNG: {}", e),
                }
            });
        } else {
            // debug!("No frames in queue, waiting...");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        const MAX_RETRIES: usize = 3;
        const RETRY_DELAY: Duration = Duration::from_millis(100);

        // Write encoded frames to FFmpeg
        let write_timeout = Duration::from_secs_f64(1.0 / fps);
        while let Ok(Some(buffer)) = timeout(write_timeout, receiver.recv()).await {
            if let Some(stdin) = current_stdin.as_mut() {
                let mut retries = 0;
                while retries < MAX_RETRIES {
                    match stdin.write_all(&buffer).await {
                        Ok(_) => {
                            frame_count += 1;
                            debug!("Wrote frame {} to FFmpeg", frame_count);
                            break;
                        }
                        Err(e) => {
                            retries += 1;
                            if retries >= MAX_RETRIES {
                                error!(
                                    "Failed to write frame to ffmpeg after {} retries: {}",
                                    MAX_RETRIES, e
                                );
                                // Consider breaking the outer loop or handling this failure
                                break;
                            } else {
                                warn!(
                                    "Failed to write frame to ffmpeg (attempt {}): {}. Retrying...",
                                    retries, e
                                );
                                sleep(RETRY_DELAY).await;
                            }
                        }
                    }
                }
                frame_count += 1;
                debug!("Wrote frame {} to FFmpeg", frame_count);

                // Calculate frames per flush based on fps
                let frames_per_flush = (fps.max(0.1) * 1.0).ceil() as usize;

                // Flush every calculated number of frames
                if frame_count % frames_per_flush == 0 {
                    debug!("Flushing FFmpeg input after {} frames", frames_per_flush);
                    if let Err(e) = stdin.flush().await {
                        error!("Failed to flush FFmpeg input: {}", e);
                    }
                }
                // Break the loop if we've written enough frames for this chunk
                if frame_count >= frames_per_video {
                    debug!("finished writing frames for this chunk");
                    break;
                }
            }
        }

        // Yield to other tasks periodically
        tokio::task::yield_now().await;
    }
}

use std::env;

async fn start_ffmpeg_process(output_file: &str, fps: f64) -> Result<Child, anyhow::Error> {
    // Overriding fps with max fps if over the max and warning user
    let fps = if fps > MAX_FPS {
        warn!("Overriding FPS from {} to {}", fps, MAX_FPS);
        MAX_FPS
    } else {
        fps
    };

    info!("Starting FFmpeg process for file: {}", output_file);
    let fps_str = fps.to_string();
    let mut command = Command::new(find_ffmpeg_path().unwrap());
    let mut args = vec![
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-r",
        &fps_str,
        "-i",
        "-",
        "-vf",
        "pad=width=ceil(iw/2)*2:height=ceil(ih/2)*2",
    ];

    if env::consts::OS == "windows" {
        // TODO switch back to libx264 when ffmpeg is updated in pre_build.js
        // Use H264_mf encoder for Windows
        args.extend_from_slice(&[
            "-vcodec",
            "h264_mf",
            "-q:v",
            "5", // Adjust quality (1-31, lower is better)
            "-preset",
            "ultrafast",
        ]);
    } else {
        // Use libx264 for other platforms
        args.extend_from_slice(&["-vcodec", "libx264", "-preset", "ultrafast", "-crf", "23"]);
    }

    args.extend_from_slice(&["-pix_fmt", "yuv420p", output_file]);

    command
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    debug!("FFmpeg command: {:?}", command);

    let child = command.spawn()?;
    debug!("FFmpeg process spawned");

    Ok(child)
}
