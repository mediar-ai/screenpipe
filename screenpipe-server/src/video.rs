use chrono::Utc;
use crossbeam::queue::ArrayQueue;
use screenpipe_core::{find_ffmpeg_path, Language};
use screenpipe_vision::{
    capture_screenshot_by_window::WindowFilters, continuous_capture, CaptureResult, OcrEngine,
};
use std::borrow::Cow;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Weak;
use std::time::Duration;
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader;
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::mpsc::channel;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

pub(crate) const MAX_FPS: f64 = 30.0; // Adjust based on your needs
const MAX_QUEUE_SIZE: usize = 10;

pub struct VideoCapture {
    #[allow(unused)]
    video_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
    pub ocr_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
    shutdown_tx: watch::Sender<bool>,
    handles: Vec<JoinHandle<()>>,
}

impl VideoCapture {
    pub fn new(
        output_path: &str,
        fps: f64,
        video_chunk_duration: Duration,
        new_chunk_callback: impl Fn(&str) + Send + Sync + 'static,
        ocr_engine: Weak<OcrEngine>,
        monitor_id: u32,
        ignore_list: Arc<[String]>,
        include_list: Arc<[String]>,
        languages: Arc<[Language]>,
        capture_unfocused_windows: bool,
    ) -> Self {
        let fps = if fps.is_finite() && fps > 0.0 {
            fps
        } else {
            warn!(
                "[monitor_id: {}] Invalid FPS value: {}. Using default of 1.0",
                monitor_id, fps
            );
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
        let window_filters = Arc::new(WindowFilters::new(&ignore_list, &include_list));
        let window_filters_clone = Arc::clone(&window_filters);
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let mut handles = Vec::new();
        let shutdown_rx_capture = shutdown_rx.clone();
        let shutdown_rx_queue = shutdown_rx.clone();
        let shutdown_rx_video = shutdown_rx.clone();
        let languages_clone = languages.clone();
        let result_sender_inner = result_sender.clone();

        let capture_handle = tokio::spawn(async move {
            let mut rx = shutdown_rx_capture;
            loop {
                if *rx.borrow() {
                    info!(
                        "[monitor_id: {}] shutting down video capture thread",
                        monitor_id
                    );
                    break;
                }
                let result_sender = result_sender_inner.clone();
                let window_filters_clone = Arc::clone(&window_filters_clone);
                let languages_clone = languages_clone.clone();

                let ocr_engine = match ocr_engine.upgrade() {
                    Some(engine) => engine,
                    None => {
                        warn!("[monitor_id: {}] OCR engine no longer exists", monitor_id);
                        break;
                    }
                };

                tokio::select! {
                    _ = continuous_capture(
                        result_sender,
                        interval,
                        ocr_engine,
                        monitor_id,
                        window_filters_clone,
                        languages_clone.clone(),
                        capture_unfocused_windows,
                        rx.clone(),
                    ) => {
                        debug!("[monitor_id: {}] continuous capture completed, restarting", monitor_id);
                    }
                    _ = rx.changed() => {
                        if *rx.borrow() {
                            info!("[monitor_id: {}] shutting down video capture thread", monitor_id);
                            break;
                        }
                    }
                }
            }
            debug!(
                "[monitor_id: {}] exiting capture handle loop, dropping sender",
                monitor_id
            );
            drop(result_sender_inner);
        });
        handles.push(capture_handle);

        let queue_handle = tokio::spawn(async move {
            let rx = shutdown_rx_queue;
            while let Some(result) = result_receiver.recv().await {
                if *rx.borrow() {
                    info!(
                        "[monitor_id: {}] shutting down video queue thread",
                        monitor_id
                    );
                    break;
                }
                let frame_number = result.frame_number;
                debug!(
                    "[monitor_id: {}] received frame {} for queueing",
                    monitor_id, frame_number
                );

                let result = Arc::new(result);

                let video_pushed = push_to_queue(&capture_video_frame_queue, &result, "Video");
                let ocr_pushed = push_to_queue(&capture_ocr_frame_queue, &result, "OCR");

                if !video_pushed || !ocr_pushed {
                    error!(
                        "[monitor_id: {}] failed to push frame {} to one or more queues, queue lengths: {}, {}",
                        monitor_id, frame_number,
                        capture_video_frame_queue.len(),
                        capture_ocr_frame_queue.len()
                    );
                    continue; // Skip to next iteration instead of crashing
                }

                debug!(
                    "[monitor_id: {}] frame {} pushed to queues. Queue lengths: {}, {}",
                    monitor_id,
                    frame_number,
                    capture_video_frame_queue.len(),
                    capture_ocr_frame_queue.len()
                );
            }
        });
        handles.push(queue_handle);

        let video_frame_queue_clone = video_frame_queue.clone();

        let output_path = output_path.to_string();
        let video_handle = tokio::spawn(async move {
            let rx = shutdown_rx_video;
            save_frames_as_video_with_shutdown(
                &video_frame_queue_clone,
                &output_path,
                fps,
                new_chunk_callback_clone,
                monitor_id,
                video_chunk_duration,
                rx,
            )
            .await;
        });
        handles.push(video_handle);

        VideoCapture {
            video_frame_queue,
            ocr_frame_queue,
            shutdown_tx,
            handles,
        }
    }

    pub async fn shutdown(self) -> Result<(), anyhow::Error> {
        info!("shutting down video capture");
        self.shutdown_tx.send(true)?;

        for handle in self.handles {
            if let Err(e) = handle.await {
                error!("error joining handle: {}", e);
            }
        }

        Ok(())
    }
}

pub async fn start_ffmpeg_process(output_file: &str, fps: f64) -> Result<Child, anyhow::Error> {
    let fps = if fps > MAX_FPS {
        warn!("Overriding FPS from {} to {}", fps, MAX_FPS);
        MAX_FPS
    } else {
        fps
    };

    info!("starting FFmpeg process for file: {}", output_file);
    let fps_str = fps.to_string();
    let mut command = Command::new(find_ffmpeg_path().unwrap());
    let mut args = vec![
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg", // consider using mjpeg and change to encode to jpeg below too
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

async fn save_frames_as_video_with_shutdown(
    frame_queue: &Arc<ArrayQueue<Arc<CaptureResult>>>,
    output_path: &str,
    fps: f64,
    new_chunk_callback: Arc<dyn Fn(&str) + Send + Sync>,
    monitor_id: u32,
    video_chunk_duration: Duration,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    debug!("starting save_frames_as_video function");
    let frames_per_video = (fps * video_chunk_duration.as_secs_f64()).ceil() as usize;
    let mut frame_count = 0;
    let mut current_ffmpeg: Option<Child> = None;
    let mut current_stdin: Option<ChildStdin> = None;

    loop {
        if *shutdown_rx.borrow() {
            info!("shutting down video capture thread");
            if let Some(child) = current_ffmpeg.take() {
                finish_ffmpeg_process(child, current_stdin.take()).await;
            }
            break;
        }

        if frame_count >= frames_per_video || current_ffmpeg.is_none() {
            if let Some(child) = current_ffmpeg.take() {
                finish_ffmpeg_process(child, current_stdin.take()).await;
            }

            frame_count = 0;
            let first_frame = wait_for_first_frame(frame_queue).await;
            let buffer = encode_frame(&first_frame);

            let output_file = create_output_file(output_path, monitor_id);
            new_chunk_callback(&output_file);

            match start_ffmpeg_process(&output_file, fps).await {
                Ok(mut child) => {
                    let mut stdin = child.stdin.take().expect("Failed to open stdin");
                    spawn_ffmpeg_loggers(child.stderr.take(), child.stdout.take());

                    if let Err(e) = write_frame_to_ffmpeg(&mut stdin, &buffer).await {
                        error!("failed to write first frame to ffmpeg: {}", e);
                        continue;
                    }
                    frame_count += 1;

                    current_ffmpeg = Some(child);
                    current_stdin = Some(stdin);
                    debug!("new FFmpeg process started for file: {}", output_file);
                }
                Err(e) => {
                    error!("failed to start FFmpeg process: {}", e);
                    continue;
                }
            }
        }

        process_frames(
            frame_queue,
            &mut current_stdin,
            &mut frame_count,
            frames_per_video,
            fps,
            &shutdown_rx,
        )
        .await;

        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    if let Some(child) = current_ffmpeg.take() {
                        finish_ffmpeg_process(child, current_stdin.take()).await;
                    }
                    break;
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(10)) => {
                // Continue with normal processing
            }
        }
    }
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
    let rgb_image = frame.image.to_rgb8();
    rgb_image
        .write_to(
            &mut std::io::Cursor::new(&mut buffer),
            image::ImageFormat::Jpeg,
        )
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
    shutdown_rx: &watch::Receiver<bool>,
) {
    let write_timeout = Duration::from_secs_f64(1.0 / fps);
    let mut should_break = false;

    while *frame_count < frames_per_video && !should_break {
        if *shutdown_rx.borrow() {
            info!("process_frames: shutdown signal received, breaking out");
            should_break = true;
            continue;
        }

        if let Some(frame) = frame_queue.pop() {
            let buffer = encode_frame(&frame);
            if let Some(stdin) = current_stdin.as_mut() {
                if let Err(e) = write_frame_with_retry(stdin, &buffer).await {
                    error!("failed to write frame to ffmpeg after max retries: {}", e);
                    should_break = true;
                    continue;
                }
                *frame_count += 1;
                debug!("wrote frame {} to ffmpeg", frame_count);
                flush_ffmpeg_input(stdin, *frame_count, fps).await;
            }
        } else {
            tokio::time::sleep(write_timeout).await;
        }
    }

    // Cleanup remaining frames
    while frame_queue.pop().is_some() {
        debug!("cleaning up remaining frame from queue");
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

fn push_to_queue(
    queue: &ArrayQueue<Arc<CaptureResult>>,
    result: &Arc<CaptureResult>,
    queue_name: &str,
) -> bool {
    match queue.push(Arc::clone(result)) {
        Ok(_) => {
            debug!(
                "{} queue: Successfully pushed frame {}",
                queue_name, result.frame_number
            );
            true
        }
        Err(_) => {
            warn!(
                "{} queue full, dropping frame {}",
                queue_name, result.frame_number
            );
            false
        }
    }
}
