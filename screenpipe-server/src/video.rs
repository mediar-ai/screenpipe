use chrono::Utc;
use crossbeam::queue::ArrayQueue;
use image::ImageFormat::{self};
use screenpipe_core::{find_ffmpeg_path, Language};
use screenpipe_vision::{
    capture_screenshot_by_window::WindowFilters, continuous_capture, CaptureResult, OcrEngine,
};
use std::borrow::Cow;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader;
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::mpsc::channel;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

pub(crate) const MAX_FPS: f64 = 30.0; // Adjust based on your needs
const MAX_QUEUE_SIZE: usize = 30; // Increased from 10 for more buffer room

pub struct VideoCapture {
    #[allow(unused)]
    video_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
    pub ocr_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
    // Add handles to tasks so we can monitor their status
    capture_thread_handle: tokio::task::JoinHandle<()>,
    queue_thread_handle: tokio::task::JoinHandle<()>,
    video_thread_handle: tokio::task::JoinHandle<()>,
}

impl VideoCapture {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        output_path: &str,
        fps: f64,
        video_chunk_duration: Duration,
        new_chunk_callback: impl Fn(&str) + Send + Sync + 'static,
        ocr_engine: Arc<OcrEngine>,
        monitor_id: u32,
        ignore_list: &[String],
        include_list: &[String],
        languages: Vec<Language>,
        capture_unfocused_windows: bool,
    ) -> Self {
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

        info!(
            "Starting VideoCapture for monitor {}, max queue size: {}, fps: {}",
            monitor_id, MAX_QUEUE_SIZE, fps
        );

        let capture_video_frame_queue = video_frame_queue.clone();
        let capture_ocr_frame_queue = ocr_frame_queue.clone();
        let (result_sender, mut result_receiver) = channel(512);
        let window_filters = Arc::new(WindowFilters::new(ignore_list, include_list));
        let window_filters_clone = Arc::clone(&window_filters);

        // Store task handles for health monitoring
        let capture_thread = tokio::spawn(async move {
            info!(
                "Starting continuous_capture task for monitor {}",
                monitor_id
            );
            match continuous_capture(
                result_sender,
                interval,
                (*ocr_engine).clone(),
                monitor_id,
                window_filters_clone,
                languages.clone(),
                capture_unfocused_windows,
            )
            .await
            {
                Ok(_) => warn!(
                    "continuous_capture task for monitor {} completed unexpectedly",
                    monitor_id
                ),
                Err(e) => error!(
                    "continuous_capture task for monitor {} failed with error: {}",
                    monitor_id, e
                ),
            }
            warn!(
                "continuous_capture task terminated for monitor {}",
                monitor_id
            );
        });

        // In the _queue_thread
        let queue_thread = tokio::spawn(async move {
            info!("Starting queue processing task for monitor {}", monitor_id);
            let mut processed_count = 0;
            let start_time = std::time::Instant::now();
            let mut last_log_time = start_time;
            let log_interval = Duration::from_secs(30); // Log stats every 30 seconds

            // Helper function to push to queue and handle errors
            fn push_to_queue(
                queue: &ArrayQueue<Arc<CaptureResult>>,
                result: &Arc<CaptureResult>,
                queue_name: &str,
            ) -> bool {
                if queue.push(Arc::clone(result)).is_err() {
                    if queue.len() >= queue.capacity() {
                        error!(
                            "{} queue is full ({}/{})",
                            queue_name,
                            queue.len(),
                            queue.capacity()
                        );
                    }

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
                    debug!(
                        "{} queue was full, dropped oldest frame, new size: {}/{}",
                        queue_name,
                        queue.len(),
                        queue.capacity()
                    );
                }
                true
            }

            while let Some(result) = result_receiver.recv().await {
                let frame_number = result.frame_number;
                processed_count += 1;

                // Periodically log stats
                let now = std::time::Instant::now();
                if now.duration_since(last_log_time) >= log_interval {
                    let elapsed_secs = now.duration_since(start_time).as_secs_f64();
                    let rate = if elapsed_secs > 0.0 {
                        processed_count as f64 / elapsed_secs
                    } else {
                        0.0
                    };
                    info!(
                        "Queue stats for monitor {}: processed {} frames in {:.1}s ({:.2} fps), queue sizes: video={}/{}, ocr={}/{}",
                        monitor_id, processed_count, elapsed_secs, rate,
                        capture_video_frame_queue.len(), capture_video_frame_queue.capacity(),
                        capture_ocr_frame_queue.len(), capture_ocr_frame_queue.capacity()
                    );
                    last_log_time = now;
                }

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
                    "Frame {} pushed to queues. Queue lengths: video={}/{}, ocr={}/{}",
                    frame_number,
                    capture_video_frame_queue.len(),
                    capture_video_frame_queue.capacity(),
                    capture_ocr_frame_queue.len(),
                    capture_ocr_frame_queue.capacity()
                );
            }

            warn!(
                "Queue processing task terminated for monitor {} - channel closed",
                monitor_id
            );
        });

        let video_frame_queue_clone = video_frame_queue.clone();

        let output_path = output_path.to_string();
        let video_thread = tokio::spawn(async move {
            info!(
                "Starting save_frames_as_video task for monitor {}",
                monitor_id
            );
            match save_frames_as_video(
                &video_frame_queue_clone,
                &output_path,
                fps,
                new_chunk_callback_clone,
                monitor_id,
                video_chunk_duration,
            )
            .await
            {
                Ok(_) => warn!(
                    "save_frames_as_video task completed unexpectedly for monitor {}",
                    monitor_id
                ),
                Err(e) => error!(
                    "save_frames_as_video task failed for monitor {}: {}",
                    monitor_id, e
                ),
            }
            warn!(
                "save_frames_as_video task terminated for monitor {}",
                monitor_id
            );
        });

        VideoCapture {
            video_frame_queue,
            ocr_frame_queue,
            capture_thread_handle: capture_thread,
            queue_thread_handle: queue_thread,
            video_thread_handle: video_thread,
        }
    }

    // Add method to check health of tasks
    pub fn check_health(&self) -> bool {
        let capture_ok = !self.capture_thread_handle.is_finished();
        let queue_ok = !self.queue_thread_handle.is_finished();
        let video_ok = !self.video_thread_handle.is_finished();

        if !capture_ok {
            error!("continuous_capture task has terminated unexpectedly");
        }
        if !queue_ok {
            error!("queue processing task has terminated unexpectedly");
        }
        if !video_ok {
            error!("save_frames_as_video task has terminated unexpectedly");
        }

        capture_ok && queue_ok && video_ok
    }
}

pub async fn start_ffmpeg_process(output_file: &str, fps: f64) -> Result<Child, anyhow::Error> {
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

    args.extend_from_slice(&[
        "-vcodec",
        "libx265",
        "-tag:v",
        "hvc1",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
    ]);

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

pub async fn write_frame_to_ffmpeg(
    stdin: &mut ChildStdin,
    buffer: &[u8],
) -> Result<(), anyhow::Error> {
    stdin.write_all(buffer).await?;
    Ok(())
}

async fn log_ffmpeg_output(stream: impl AsyncBufReadExt + Unpin, stream_name: &str) {
    let reader = BufReader::new(stream);
    let mut lines = reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        debug!("FFmpeg {}: {}", stream_name, line);
    }
}

async fn save_frames_as_video(
    frame_queue: &Arc<ArrayQueue<Arc<CaptureResult>>>,
    output_path: &str,
    fps: f64,
    new_chunk_callback: Arc<dyn Fn(&str) + Send + Sync>,
    monitor_id: u32,
    video_chunk_duration: Duration,
) -> Result<(), anyhow::Error> {
    info!(
        "Starting save_frames_as_video function for monitor {}",
        monitor_id
    );
    let frames_per_video = (fps * video_chunk_duration.as_secs_f64()).ceil() as usize;
    let mut frame_count = 0;
    let mut current_ffmpeg: Option<Child> = None;
    let mut current_stdin: Option<ChildStdin> = None;

    // Track health metrics
    let start_time = std::time::Instant::now();
    let mut frames_total = 0;
    let mut chunks_total = 0;
    let mut last_stats_time = start_time;
    let stats_interval = Duration::from_secs(60);

    loop {
        if frame_count >= frames_per_video || current_ffmpeg.is_none() {
            if let Some(child) = current_ffmpeg.take() {
                info!(
                    "Finishing FFmpeg process for monitor {} after {} frames",
                    monitor_id, frame_count
                );
                finish_ffmpeg_process(child, current_stdin.take()).await;
                chunks_total += 1;
            }

            frame_count = 0;
            debug!("Waiting for first frame for monitor {}", monitor_id);
            let first_frame = wait_for_first_frame(frame_queue).await;
            let buffer = encode_frame(&first_frame);
            debug!("Got first frame for new chunk for monitor {}", monitor_id);

            let output_file = create_output_file(output_path, monitor_id);
            info!(
                "Starting new video chunk: {} for monitor {}",
                output_file, monitor_id
            );
            new_chunk_callback(&output_file);

            match start_ffmpeg_process(&output_file, fps).await {
                Ok(mut child) => {
                    let mut stdin = child.stdin.take().expect("Failed to open stdin");
                    spawn_ffmpeg_loggers(child.stderr.take(), child.stdout.take());

                    debug!("Writing first frame to FFmpeg for monitor {}", monitor_id);
                    if let Err(e) = write_frame_to_ffmpeg(&mut stdin, &buffer).await {
                        error!(
                            "Failed to write first frame to ffmpeg for monitor {}: {}",
                            monitor_id, e
                        );
                        continue;
                    }
                    frame_count += 1;
                    frames_total += 1;

                    current_ffmpeg = Some(child);
                    current_stdin = Some(stdin);
                    info!(
                        "New FFmpeg process started for file: {} (monitor {})",
                        output_file, monitor_id
                    );
                }
                Err(e) => {
                    error!(
                        "Failed to start FFmpeg process for monitor {}: {}",
                        monitor_id, e
                    );
                    continue;
                }
            }
        }

        let now = std::time::Instant::now();
        if now.duration_since(last_stats_time) >= stats_interval {
            let runtime = now.duration_since(start_time).as_secs();
            let fps_avg = if runtime > 0 {
                frames_total as f64 / runtime as f64
            } else {
                0.0
            };
            info!(
                "Video stats for monitor {}: processed {} frames in {} chunks over {}s ({:.2} avg fps)",
                monitor_id, frames_total, chunks_total, runtime, fps_avg
            );
            last_stats_time = now;
        }

        debug!(
            "Processing frames for monitor {}, current count: {}/{}",
            monitor_id, frame_count, frames_per_video
        );
        process_frames(
            frame_queue,
            &mut current_stdin,
            &mut frame_count,
            frames_per_video,
            fps,
        )
        .await;

        // Update total frame count
        frames_total = frames_total.max(frame_count);

        tokio::task::yield_now().await;
    }

    // This is unreachable, but we need to return a Result to match the function signature
    #[allow(unreachable_code)]
    Ok(())
}

async fn wait_for_first_frame(
    frame_queue: &Arc<ArrayQueue<Arc<CaptureResult>>>,
) -> Arc<CaptureResult> {
    loop {
        if let Some(result) = frame_queue.pop() {
            debug!("Got first frame for new chunk");
            return result;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

fn encode_frame(frame: &CaptureResult) -> Vec<u8> {
    let mut buffer = Vec::new();
    frame
        .image
        .write_to(&mut std::io::Cursor::new(&mut buffer), ImageFormat::Png)
        .expect("Failed to encode frame");
    buffer
}

fn create_output_file(output_path: &str, monitor_id: u32) -> String {
    let time = Utc::now();
    let formatted_time = time.format("%Y-%m-%d_%H-%M-%S").to_string();
    PathBuf::from(output_path)
        .join(format!("monitor_{}_{}.mp4", monitor_id, formatted_time))
        .to_str()
        .expect("Failed to create valid path")
        .to_string()
}

fn spawn_ffmpeg_loggers(stderr: Option<ChildStderr>, stdout: Option<ChildStdout>) {
    if let Some(stderr) = stderr {
        tokio::spawn(log_ffmpeg_output(BufReader::new(stderr), "stderr"));
    }
    if let Some(stdout) = stdout {
        tokio::spawn(log_ffmpeg_output(BufReader::new(stdout), "stdout"));
    }
}

async fn process_frames(
    frame_queue: &Arc<ArrayQueue<Arc<CaptureResult>>>,
    current_stdin: &mut Option<ChildStdin>,
    frame_count: &mut usize,
    frames_per_video: usize,
    fps: f64,
) {
    let write_timeout = Duration::from_secs_f64(1.0 / fps);
    while *frame_count < frames_per_video {
        if let Some(frame) = frame_queue.pop() {
            let buffer = encode_frame(&frame);
            if let Some(stdin) = current_stdin.as_mut() {
                if let Err(e) = write_frame_with_retry(stdin, &buffer).await {
                    error!("Failed to write frame to ffmpeg after max retries: {}", e);
                    break;
                }
                *frame_count += 1;
                debug!("Wrote frame {} to FFmpeg", frame_count);

                flush_ffmpeg_input(stdin, *frame_count, fps).await;
            }
        } else {
            tokio::time::sleep(write_timeout).await;
        }
    }
}

async fn write_frame_with_retry(
    stdin: &mut ChildStdin,
    buffer: &[u8],
) -> Result<(), anyhow::Error> {
    const MAX_RETRIES: usize = 3;
    const RETRY_DELAY: Duration = Duration::from_millis(100);

    let mut retries = 0;
    while retries < MAX_RETRIES {
        match stdin.write_all(buffer).await {
            Ok(_) => return Ok(()),
            Err(e) => {
                retries += 1;
                if retries >= MAX_RETRIES {
                    return Err(anyhow::anyhow!("Failed to write frame to ffmpeg: {}", e));
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
    Err(anyhow::anyhow!(
        "Failed to write frame to ffmpeg after max retries"
    ))
}

async fn flush_ffmpeg_input(stdin: &mut ChildStdin, frame_count: usize, fps: f64) {
    let frames_per_flush = (fps.max(0.1) * 1.0).ceil() as usize;
    if frame_count % frames_per_flush == 0 {
        debug!("Flushing FFmpeg input after {} frames", frames_per_flush);
        if let Err(e) = stdin.flush().await {
            error!("Failed to flush FFmpeg input: {}", e);
        }
    }
}

pub async fn finish_ffmpeg_process(child: Child, stdin: Option<ChildStdin>) {
    drop(stdin); // Ensure stdin is closed
    match child.wait_with_output().await {
        Ok(output) => {
            debug!("FFmpeg process exited with status: {}", output.status);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !output.status.success() && stderr != Cow::Borrowed("") {
                error!("FFmpeg stderr: {}", stderr);
            }
        }
        Err(e) => error!("Failed to wait for FFmpeg process: {}", e),
    }
}
