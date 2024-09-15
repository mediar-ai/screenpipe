use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use screenpipe_core::find_ffmpeg_path;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tracing::{debug, info};
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

pub async fn merge_videos(
    request: MergeVideosRequest,
    output_dir: PathBuf,
) -> Result<MergeVideosResponse> {
    info!("merging videos: {:?}", request.video_paths);

    let output_filename = format!("output_{}.mp4", Uuid::new_v4());
    let output_path = output_dir.join(&output_filename);

    // create a temporary file to store the list of input videos
    let temp_file = output_dir.join("input_list.txt");
    let mut file = tokio::fs::File::create(&temp_file).await?;
    for video_path in &request.video_paths {
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
