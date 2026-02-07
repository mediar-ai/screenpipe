use chrono::Utc;
use crossbeam::queue::ArrayQueue;
use dashmap::DashMap;
use image::ImageFormat::{self};
use screenpipe_core::{find_ffmpeg_path, Language};
use screenpipe_vision::{
    capture_screenshot_by_window::WindowFilters, continuous_capture, CaptureResult, OcrEngine,
};
use std::borrow::Cow;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader;
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::mpsc::channel;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

/// Tracks which frames were successfully written to video and at what offset.
/// This ensures DB insertion uses the correct video offset, even when frames are dropped.
#[derive(Debug, Clone)]
pub struct FrameWriteInfo {
    /// Offset within the current video chunk (0-indexed)
    pub offset: u64,
    /// Path to the video file containing this frame
    pub video_path: String,
}

/// Thread-safe tracker for frame writes. Shared between video encoding and DB insertion.
#[derive(Debug)]
pub struct FrameWriteTracker {
    /// Maps frame_number -> FrameWriteInfo
    writes: DashMap<u64, FrameWriteInfo>,
    /// Counter for cleanup: frames older than this can be removed
    oldest_relevant_frame: AtomicU64,
}

impl FrameWriteTracker {
    pub fn new() -> Self {
        Self {
            writes: DashMap::new(),
            oldest_relevant_frame: AtomicU64::new(0),
        }
    }

    /// Record that a frame was written to video at the given offset.
    pub fn record_write(&self, frame_number: u64, offset: u64, video_path: String) {
        debug!(
            "FrameWriteTracker: recorded frame {} at offset {} in {}",
            frame_number, offset, video_path
        );
        self.writes
            .insert(frame_number, FrameWriteInfo { offset, video_path });
    }

    /// Get the video offset for a frame. Returns None if frame wasn't written to video.
    pub fn get_offset(&self, frame_number: u64) -> Option<FrameWriteInfo> {
        self.writes.get(&frame_number).map(|r| r.clone())
    }

    /// Check if a frame was written to video.
    pub fn was_written(&self, frame_number: u64) -> bool {
        self.writes.contains_key(&frame_number)
    }

    /// Clean up old entries to prevent memory bloat.
    /// Removes all entries with frame_number < min_frame.
    pub fn cleanup_before(&self, min_frame: u64) {
        let old_min = self.oldest_relevant_frame.swap(min_frame, Ordering::SeqCst);
        if min_frame > old_min {
            self.writes.retain(|&k, _| k >= min_frame);
            debug!(
                "FrameWriteTracker: cleaned up frames before {}, remaining: {}",
                min_frame,
                self.writes.len()
            );
        }
    }

    /// Get the number of tracked frames (for debugging).
    pub fn len(&self) -> usize {
        self.writes.len()
    }
}

impl Default for FrameWriteTracker {
    fn default() -> Self {
        Self::new()
    }
}

pub(crate) const MAX_FPS: f64 = 30.0; // Adjust based on your needs
const MAX_QUEUE_SIZE: usize = 30; // Increased from 10 for more buffer room

pub struct VideoCapture {
    #[allow(unused)]
    video_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
    pub ocr_frame_queue: Arc<ArrayQueue<Arc<CaptureResult>>>,
    /// Tracks which frames were written to video and at what offset.
    /// Used by DB insertion to ensure correct offset mapping.
    pub frame_write_tracker: Arc<FrameWriteTracker>,
    // Task handles — aborted on Drop for clean shutdown
    capture_thread_handle: tokio::task::JoinHandle<()>,
    queue_thread_handle: tokio::task::JoinHandle<()>,
    video_thread_handle: tokio::task::JoinHandle<()>,
    monitor_id: u32,
}

impl VideoCapture {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        output_path: &str,
        fps: f64,
        video_chunk_duration: Duration,
        new_chunk_callback: impl Fn(&str, f64) + Send + Sync + 'static,
        ocr_engine: Arc<OcrEngine>,
        monitor_id: u32,
        ignore_list: &[String],
        include_list: &[String],
        ignored_urls: &[String],
        languages: Vec<Language>,
        capture_unfocused_windows: bool,
        activity_feed: screenpipe_vision::ActivityFeedOption,
        video_quality: String,
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
        let frame_write_tracker = Arc::new(FrameWriteTracker::new());
        let new_chunk_callback = Arc::new(new_chunk_callback);
        let new_chunk_callback_clone = Arc::clone(&new_chunk_callback);

        info!(
            "Starting VideoCapture for monitor {}, max queue size: {}, fps: {}",
            monitor_id, MAX_QUEUE_SIZE, fps
        );

        let capture_video_frame_queue = video_frame_queue.clone();
        let capture_ocr_frame_queue = ocr_frame_queue.clone();
        let (result_sender, mut result_receiver) = channel(512);
        let window_filters = Arc::new(WindowFilters::new(ignore_list, include_list, ignored_urls));

        let capture_ocr_engine = ocr_engine.clone();
        let capture_window_filters = window_filters.clone();
        let capture_languages = languages.clone();
        let capture_result_sender = result_sender.clone();
        let capture_interval = interval;
        let capture_unfocused = capture_unfocused_windows;
        let capture_activity_feed = activity_feed;

        let capture_thread = tokio::spawn(async move {
            info!(
                "Starting continuous_capture for monitor {}",
                monitor_id
            );

            loop {
                match continuous_capture(
                    capture_result_sender.clone(),
                    capture_interval,
                    (*capture_ocr_engine).clone(),
                    monitor_id,
                    capture_window_filters.clone(),
                    capture_languages.clone(),
                    capture_unfocused,
                    capture_activity_feed.clone(),
                )
                .await
                {
                    Ok(_) => {
                        info!(
                            "continuous_capture for monitor {} completed",
                            monitor_id
                        );
                        break;
                    }
                    Err(e) => {
                        error!(
                            "continuous_capture for monitor {} failed: {}, restarting in 5s",
                            monitor_id, e
                        );
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
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
        let frame_write_tracker_clone = frame_write_tracker.clone();

        let output_path = output_path.to_string();
        let video_quality_clone = video_quality;
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
                &frame_write_tracker_clone,
                &video_quality_clone,
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
            frame_write_tracker,
            capture_thread_handle: capture_thread,
            queue_thread_handle: queue_thread,
            video_thread_handle: video_thread,
            monitor_id,
        }
    }

    pub fn check_health(&self) -> bool {
        let capture_ok = !self.capture_thread_handle.is_finished();
        let queue_ok = !self.queue_thread_handle.is_finished();
        let video_ok = !self.video_thread_handle.is_finished();

        if !capture_ok {
            error!("monitor {}: capture task terminated", self.monitor_id);
        }
        if !queue_ok {
            error!("monitor {}: queue task terminated", self.monitor_id);
        }
        if !video_ok {
            error!("monitor {}: video task terminated", self.monitor_id);
        }

        capture_ok && queue_ok && video_ok
    }
}

impl Drop for VideoCapture {
    fn drop(&mut self) {
        info!(
            "Dropping VideoCapture for monitor {}, aborting all tasks",
            self.monitor_id
        );
        self.capture_thread_handle.abort();
        self.queue_thread_handle.abort();
        self.video_thread_handle.abort();
    }
}

/// Map video quality preset to H.265 CRF value.
/// Lower CRF = higher quality, larger files.
pub fn video_quality_to_crf(quality: &str) -> &'static str {
    match quality {
        "low" => "32",
        "high" => "18",
        "max" => "14",
        _ => "23", // "balanced" or any unknown
    }
}

/// Map video quality preset to x265 encoding preset.
///
/// The preset controls how much CPU time the encoder spends optimizing
/// compression. Slower presets produce dramatically sharper output at the
/// same CRF because they use better motion estimation, more reference
/// frames, and smarter rate-distortion decisions.
///
/// `ultrafast` was previously hardcoded for all quality levels, which meant
/// even CRF 14 ("max") looked blurry — the encoder simply didn't spend
/// enough effort to use those bits well.
///
/// Trade-offs chosen here:
/// - low/balanced: `ultrafast` — minimal CPU, recording must never lag
/// - high: `fast` — noticeable quality bump, still real-time on most machines
/// - max: `medium` — best quality, may use significant CPU on older hardware
pub fn video_quality_to_preset(quality: &str) -> &'static str {
    match quality {
        "high" => "fast",
        "max" => "medium",
        _ => "ultrafast", // "low", "balanced", or any unknown
    }
}

/// Map video quality preset to JPEG quality for frame extraction.
/// Lower value = higher quality (scale 2-31).
pub fn video_quality_to_jpeg_q(quality: &str) -> &'static str {
    match quality {
        "low" => "18",
        "high" => "4",
        "max" => "2",
        _ => "10", // "balanced" or any unknown
    }
}

pub async fn start_ffmpeg_process(output_file: &str, fps: f64, video_quality: &str) -> Result<Child, anyhow::Error> {
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
        // Scale to even dimensions (required for H.265/yuv420p). Use trunc to scale down
        // by at most 1 pixel, avoiding black bars that pad would add.
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    ];

    let crf = video_quality_to_crf(video_quality);
    let preset = video_quality_to_preset(video_quality);

    info!(
        "FFmpeg encoding: quality={}, crf={}, preset={}",
        video_quality, crf, preset
    );

    args.extend_from_slice(&[
        "-vcodec",
        "libx265",
        "-tag:v",
        "hvc1",
        "-preset",
        preset,
        "-crf",
        crf,
    ]);

    // Use fragmented MP4 to allow reading frames while file is still being written
    // This writes the moov atom at the start instead of the end, enabling:
    // - Frame extraction from incomplete/in-progress recordings
    // - Streaming playback before recording finishes
    args.extend_from_slice(&["-movflags", "frag_keyframe+empty_moov+default_base_moof"]);

    args.extend_from_slice(&["-pix_fmt", "yuv420p", output_file]);

    command
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

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
    new_chunk_callback: Arc<dyn Fn(&str, f64) + Send + Sync>,
    monitor_id: u32,
    video_chunk_duration: Duration,
    frame_write_tracker: &Arc<FrameWriteTracker>,
    video_quality: &str,
) -> Result<(), anyhow::Error> {
    info!(
        "Starting save_frames_as_video function for monitor {}",
        monitor_id
    );
    let frames_per_video = (fps * video_chunk_duration.as_secs_f64()).ceil() as usize;
    let mut frame_count = 0;
    let mut current_ffmpeg: Option<Child> = None;
    let mut current_stdin: Option<ChildStdin> = None;
    let mut current_video_path: Option<String> = None;

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

            // Clean up old tracker entries to prevent memory bloat
            // Keep entries from the last ~1000 frames (enough buffer for DB to catch up)
            if first_frame.frame_number > 1000 {
                frame_write_tracker.cleanup_before(first_frame.frame_number - 1000);
            }

            let output_file = create_output_file(output_path, monitor_id);
            info!(
                "Starting new video chunk: {} for monitor {}",
                output_file, monitor_id
            );

            match start_ffmpeg_process(&output_file, fps, video_quality).await {
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

                    // Record first frame write in tracker (offset 0)
                    frame_write_tracker.record_write(
                        first_frame.frame_number,
                        0, // First frame is at offset 0
                        output_file.clone(),
                    );

                    frame_count += 1;
                    frames_total += 1;

                    // Register in DB only after first frame is written successfully
                    // This ensures the file has valid headers and content before timeline can request it
                    new_chunk_callback(&output_file, fps);

                    current_ffmpeg = Some(child);
                    current_stdin = Some(stdin);
                    current_video_path = Some(output_file.clone());
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
        if let Some(ref video_path) = current_video_path {
            process_frames(
                frame_queue,
                &mut current_stdin,
                &mut frame_count,
                frames_per_video,
                fps,
                frame_write_tracker,
                video_path,
            )
            .await;
        }

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
    frame_write_tracker: &Arc<FrameWriteTracker>,
    video_path: &str,
) {
    let write_timeout = Duration::from_secs_f64(1.0 / fps);
    while *frame_count < frames_per_video {
        if let Some(frame) = frame_queue.pop() {
            let frame_number = frame.frame_number;
            let buffer = encode_frame(&frame);
            if let Some(stdin) = current_stdin.as_mut() {
                if let Err(e) = write_frame_with_retry(stdin, &buffer).await {
                    error!("Failed to write frame to ffmpeg after max retries: {}", e);
                    break;
                }

                // Record this frame write in the tracker
                // frame_count is 0-indexed offset within this video chunk
                frame_write_tracker.record_write(
                    frame_number,
                    *frame_count as u64,
                    video_path.to_string(),
                );

                *frame_count += 1;
                debug!(
                    "Wrote frame {} (frame_number={}) to FFmpeg at offset {}",
                    frame_count,
                    frame_number,
                    *frame_count - 1
                );

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
    if frame_count.is_multiple_of(frames_per_flush) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};
    use std::io::Cursor;
    use tempfile::tempdir;
    use tokio::process::Command;

    /// Helper to create a synthetic PNG image of given dimensions
    fn create_test_png(width: u32, height: u32) -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(width, height, |x, y| {
            // Create a simple gradient pattern for visual verification
            Rgba([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8, 255])
        });

        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        img.write_to(&mut cursor, image::ImageFormat::Png)
            .expect("Failed to encode PNG");
        buffer
    }

    /// Get video dimensions using ffprobe
    async fn get_video_dimensions(video_path: &str) -> Result<(u32, u32), anyhow::Error> {
        let mut cmd = Command::new("ffprobe");
        cmd.args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=s=x:p=0",
                video_path,
            ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let output = cmd.output().await?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.trim().split('x').collect();
        if parts.len() == 2 {
            let width = parts[0].parse::<u32>()?;
            let height = parts[1].parse::<u32>()?;
            Ok((width, height))
        } else {
            Err(anyhow::anyhow!("Failed to parse dimensions: {}", stdout))
        }
    }

    /// Test that FFmpeg correctly scales odd dimensions to even
    #[tokio::test]
    async fn test_ffmpeg_scales_odd_dimensions_to_even() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let output_path = temp_dir.path().join("test_odd.mp4");
        let output_str = output_path.to_str().unwrap();

        // Create image with odd dimensions (1921x1081)
        let png_data = create_test_png(1921, 1081);

        // Start FFmpeg and write frame
        let mut child = start_ffmpeg_process(output_str, 1.0, "balanced")
            .await
            .expect("Failed to start FFmpeg");

        let mut stdin = child.stdin.take().expect("Failed to get stdin");
        write_frame_to_ffmpeg(&mut stdin, &png_data)
            .await
            .expect("Failed to write frame");
        drop(stdin);

        let output = child.wait_with_output().await.expect("FFmpeg failed");
        assert!(
            output.status.success(),
            "FFmpeg exited with error: {:?}",
            String::from_utf8_lossy(&output.stderr)
        );

        // Verify output dimensions are even (1920x1080)
        let (width, height) = get_video_dimensions(output_str)
            .await
            .expect("Failed to get video dimensions");

        assert_eq!(width % 2, 0, "Width should be even, got {}", width);
        assert_eq!(height % 2, 0, "Height should be even, got {}", height);
        assert_eq!(width, 1920, "Expected width 1920, got {}", width);
        assert_eq!(height, 1080, "Expected height 1080, got {}", height);
    }

    /// Test ultrawide monitor dimensions (5120x1440)
    #[tokio::test]
    async fn test_ffmpeg_ultrawide_dimensions() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let output_path = temp_dir.path().join("test_ultrawide.mp4");
        let output_str = output_path.to_str().unwrap();

        // 5120x1440 - common ultrawide resolution (even dimensions)
        let png_data = create_test_png(5120, 1440);

        let mut child = start_ffmpeg_process(output_str, 1.0, "balanced")
            .await
            .expect("Failed to start FFmpeg");

        let mut stdin = child.stdin.take().expect("Failed to get stdin");
        write_frame_to_ffmpeg(&mut stdin, &png_data)
            .await
            .expect("Failed to write frame");
        drop(stdin);

        let output = child.wait_with_output().await.expect("FFmpeg failed");
        assert!(
            output.status.success(),
            "FFmpeg exited with error: {:?}",
            String::from_utf8_lossy(&output.stderr)
        );

        let (width, height) = get_video_dimensions(output_str)
            .await
            .expect("Failed to get video dimensions");

        // Even dimensions should remain unchanged
        assert_eq!(width, 5120, "Expected width 5120, got {}", width);
        assert_eq!(height, 1440, "Expected height 1440, got {}", height);
    }

    /// Test odd ultrawide dimensions (5119x1439)
    #[tokio::test]
    async fn test_ffmpeg_odd_ultrawide_dimensions() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let output_path = temp_dir.path().join("test_odd_ultrawide.mp4");
        let output_str = output_path.to_str().unwrap();

        // Odd dimensions that might occur with DPI scaling
        let png_data = create_test_png(5119, 1439);

        let mut child = start_ffmpeg_process(output_str, 1.0, "balanced")
            .await
            .expect("Failed to start FFmpeg");

        let mut stdin = child.stdin.take().expect("Failed to get stdin");
        write_frame_to_ffmpeg(&mut stdin, &png_data)
            .await
            .expect("Failed to write frame");
        drop(stdin);

        let output = child.wait_with_output().await.expect("FFmpeg failed");
        assert!(
            output.status.success(),
            "FFmpeg exited with error: {:?}",
            String::from_utf8_lossy(&output.stderr)
        );

        let (width, height) = get_video_dimensions(output_str)
            .await
            .expect("Failed to get video dimensions");

        // Should scale down to nearest even (5118x1438)
        assert_eq!(width % 2, 0, "Width should be even, got {}", width);
        assert_eq!(height % 2, 0, "Height should be even, got {}", height);
        assert_eq!(width, 5118, "Expected width 5118, got {}", width);
        assert_eq!(height, 1438, "Expected height 1438, got {}", height);
    }

    /// Test vertical/rotated monitor dimensions (1440x2560)
    #[tokio::test]
    async fn test_ffmpeg_vertical_monitor_dimensions() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let output_path = temp_dir.path().join("test_vertical.mp4");
        let output_str = output_path.to_str().unwrap();

        // Vertical monitor (rotated 2560x1440)
        let png_data = create_test_png(1440, 2560);

        let mut child = start_ffmpeg_process(output_str, 1.0, "balanced")
            .await
            .expect("Failed to start FFmpeg");

        let mut stdin = child.stdin.take().expect("Failed to get stdin");
        write_frame_to_ffmpeg(&mut stdin, &png_data)
            .await
            .expect("Failed to write frame");
        drop(stdin);

        let output = child.wait_with_output().await.expect("FFmpeg failed");
        assert!(
            output.status.success(),
            "FFmpeg exited with error: {:?}",
            String::from_utf8_lossy(&output.stderr)
        );

        let (width, height) = get_video_dimensions(output_str)
            .await
            .expect("Failed to get video dimensions");

        // Even dimensions should remain unchanged
        assert_eq!(width, 1440, "Expected width 1440, got {}", width);
        assert_eq!(height, 2560, "Expected height 2560, got {}", height);
    }

    /// Test super ultrawide with forced scaling (3840x1080 forced to 1440 height scenario)
    #[tokio::test]
    async fn test_ffmpeg_forced_scaling_dimensions() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let output_path = temp_dir.path().join("test_forced.mp4");
        let output_str = output_path.to_str().unwrap();

        // Simulating 3840x1080 monitor forced to 1440 height (would be 3840x1440 after OS scaling)
        let png_data = create_test_png(3840, 1440);

        let mut child = start_ffmpeg_process(output_str, 1.0, "balanced")
            .await
            .expect("Failed to start FFmpeg");

        let mut stdin = child.stdin.take().expect("Failed to get stdin");
        write_frame_to_ffmpeg(&mut stdin, &png_data)
            .await
            .expect("Failed to write frame");
        drop(stdin);

        let output = child.wait_with_output().await.expect("FFmpeg failed");
        assert!(
            output.status.success(),
            "FFmpeg exited with error: {:?}",
            String::from_utf8_lossy(&output.stderr)
        );

        let (width, height) = get_video_dimensions(output_str)
            .await
            .expect("Failed to get video dimensions");

        assert_eq!(width, 3840, "Expected width 3840, got {}", width);
        assert_eq!(height, 1440, "Expected height 1440, got {}", height);
    }
}
