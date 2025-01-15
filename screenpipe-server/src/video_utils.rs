use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use image::DynamicImage;
use screenpipe_core::find_ffmpeg_path;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tracing::{debug, error, info};
use uuid::Uuid;

pub async fn extract_frame(file_path: &str, offset_index: i64) -> Result<String> {
    let ffmpeg_path = find_ffmpeg_path().expect("failed to find ffmpeg path");

    let offset_seconds = offset_index as f64 / 1000.0;
    let offset_str = format!("{:.3}", offset_seconds);

    debug!(
        "extracting frame from {} at offset {}",
        file_path, offset_str
    );

    let mut command = Command::new(ffmpeg_path);
    command
        .args(&[
            "-ss",
            &offset_str,
            "-i",
            file_path,
            "-vframes",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    debug!("ffmpeg command: {:?}", command);

    let mut child = command.spawn()?;
    let mut stdout = child.stdout.take().expect("failed to open stdout");
    let mut stderr = child.stderr.take().expect("failed to open stderr");

    let mut frame_data = Vec::new();
    stdout.read_to_end(&mut frame_data).await?;

    let status = child.wait().await?;
    if !status.success() {
        let mut error_message = String::new();
        stderr.read_to_string(&mut error_message).await?;
        info!("ffmpeg error: {}", error_message);
        return Err(anyhow::anyhow!("ffmpeg process failed: {}", error_message));
    }

    if frame_data.is_empty() {
        return Err(anyhow::anyhow!("failed to extract frame: no data received"));
    }

    Ok(general_purpose::STANDARD.encode(frame_data))
}

#[derive(Deserialize)]
pub struct MergeVideosRequest {
    pub video_paths: Vec<String>,
}

#[derive(Serialize)]
pub struct MergeVideosResponse {
    video_path: String,
}

#[derive(Deserialize)]
pub struct ValidateMediaParams {
    pub file_path: String,
}

pub async fn validate_media(file_path: &str) -> Result<()> {
    use tokio::fs::try_exists;

    if !try_exists(file_path).await? {
        return Err(anyhow::anyhow!("media file does not exist: {}", file_path));
    }

    let ffmpeg_path = find_ffmpeg_path().expect("failed to find ffmpeg path");
    let status = Command::new(ffmpeg_path)
        .args(&["-v", "error", "-i", file_path, "-f", "null", "-"])
        .output()
        .await?;

    if status.status.success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("invalid media file: {}", file_path))
    }
}

pub async fn merge_videos(
    request: MergeVideosRequest,
    output_dir: PathBuf,
) -> Result<MergeVideosResponse> {
    info!("merging videos: {:?}", request.video_paths);

    if let Err(e) = tokio::fs::create_dir_all(&output_dir).await {
        error!("failed to create output directory: {:?}", e);
        return Err(anyhow::anyhow!(
            "failed to create output directory: {:?}",
            e
        ));
    }

    let output_filename = format!("output_{}.mp4", Uuid::new_v4());
    let output_path = output_dir.join(&output_filename);

    // create a temporary file to store the list of input videos
    let temp_file = output_dir.join("input_list.txt");
    let mut file = tokio::fs::File::create(&temp_file).await?;
    for video_path in &request.video_paths {
        // video validation before writing in txt
        if let Err(e) = validate_media(video_path).await {
            error!("invalid file in merging, skipping: {:?}", e);
            continue;
        }
        // Escape single quotes in the file path
        let escaped_path = video_path.replace("'", "'\\''");
        tokio::io::AsyncWriteExt::write_all(
            &mut file,
            format!("file '{}'\n", escaped_path).as_bytes(),
        )
        .await?;
    }

    let ffmpeg_path = find_ffmpeg_path().expect("failed to find ffmpeg path");
    let status = Command::new(ffmpeg_path)
        .args(&[
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            temp_file.to_str().unwrap(),
            "-c",
            "copy",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .output()
        .await?;

    // clean up the temporary file
    tokio::fs::remove_file(temp_file).await?;

    // log ffmpeg's output
    let stdout = String::from_utf8_lossy(&status.stdout);
    let stderr = String::from_utf8_lossy(&status.stderr);
    debug!("ffmpeg stdout: {}", stdout);
    debug!("ffmpeg stderr: {}", stderr);

    if status.status.success() {
        match output_path.try_exists() {
            Ok(true) => {
                info!("videos merged successfully: {:?}", output_path);
                Ok(MergeVideosResponse {
                    video_path: output_path.to_string_lossy().into_owned(),
                })
            }
            Ok(false) => Err(anyhow::anyhow!(
                "ffmpeg reported success, but output file not found: {:?}",
                output_path
            )),
            Err(e) => Err(anyhow::anyhow!(
                "failed to check if output file exists: {:?}",
                e
            )),
        }
    } else {
        Err(anyhow::anyhow!(
            "ffmpeg failed to merge videos. error: {}",
            stderr
        ))
    }
}

pub async fn extract_frames_from_video(
    video_path: &std::path::Path,
    output_path: Option<PathBuf>,
) -> Result<Vec<DynamicImage>> {
    let ffmpeg_path = find_ffmpeg_path().expect("failed to find ffmpeg path");
    let temp_dir = tempfile::tempdir()?;
    let output_pattern = temp_dir.path().join("frame%d.jpg");

    debug!(
        "extracting frames from {} to {}",
        video_path.display(),
        output_pattern.display()
    );

    // Ensure video file exists
    if !video_path.exists() {
        return Err(anyhow::anyhow!(
            "video file does not exist: {}",
            video_path.display()
        ));
    }

    // Get source FPS and calculate target FPS
    let source_fps = match get_video_fps(&ffmpeg_path, video_path.to_str().unwrap()).await {
        Ok(fps) => fps,
        Err(e) => {
            debug!("failed to get video fps, using default 1fps: {}", e);
            1.0
        }
    };

    let target_fps = if source_fps > 10.0 { 1.0 } else { source_fps };
    let fps_filter = format!("fps={}", target_fps);

    // Extract frames using ffmpeg
    let status = Command::new(&ffmpeg_path)
        .args(&[
            "-i",
            video_path.to_str().unwrap(),
            "-vf",
            &fps_filter,
            "-strict",
            "unofficial",
            "-c:v",
            "mjpeg",
            "-q:v",
            "2",
            "-qmin",
            "2",
            "-qmax",
            "4",
            "-vsync",
            "0",
            "-threads",
            "2",
            "-y",
            output_pattern.to_str().unwrap(),
        ])
        .output()
        .await?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(anyhow::anyhow!("ffmpeg failed: {}", stderr));
    }

    // Collect all frames into a vector
    let mut frames = Vec::new();
    let mut entries = tokio::fs::read_dir(&temp_dir.path()).await?;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let frame_data = tokio::fs::read(&path).await?;
        let img = image::load_from_memory(&frame_data)?;

        if let Some(out_dir) = &output_path {
            let frame_name = entry.file_name();
            let dest_path = out_dir.join(frame_name);
            debug!("saving frame to disk: {}", dest_path.display());
            img.save(&dest_path)?;
        }

        frames.push(img);
    }

    if frames.is_empty() {
        return Err(anyhow::anyhow!("no frames were extracted"));
    }

    debug!("extracted {} frames", frames.len());
    Ok(frames)
}

async fn get_video_fps(ffmpeg_path: &PathBuf, video_path: &str) -> Result<f64> {
    let output = Command::new(ffmpeg_path)
        .args(&["-i", video_path])
        .output()
        .await?;

    let metadata = String::from_utf8_lossy(&output.stderr);
    let fps = metadata
        .lines()
        .find(|line| line.contains("fps") && !line.contains("Stream"))
        .and_then(|line| {
            line.split_whitespace()
                .find(|&word| word.parse::<f64>().is_ok())
                .and_then(|n| n.parse::<f64>().ok())
        })
        .unwrap_or(1.0);

    debug!("detected fps from video metadata: {}", fps);
    Ok(fps)
}
