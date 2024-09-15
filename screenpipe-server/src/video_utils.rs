use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use screenpipe_core::find_ffmpeg_path;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs::File;
use std::fs::Permissions;
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tracing::{info, warn};
use uuid::Uuid;

pub async fn extract_frame(file_path: &str, offset_index: i64) -> Result<String> {
    let ffmpeg_path = find_ffmpeg_path().expect("Failed to find FFmpeg path");

    let offset_seconds = offset_index as f64 / 1000.0;
    let offset_str = format!("{:.3}", offset_seconds);

    info!(
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

    info!("ffmpeg command: {:?}", command);

    let mut child = command.spawn()?;
    let mut stdout = child.stdout.take().expect("Failed to open stdout");
    let mut stderr = child.stderr.take().expect("Failed to open stderr");

    let mut frame_data = Vec::new();
    stdout.read_to_end(&mut frame_data).await?;

    let status = child.wait().await?;
    if !status.success() {
        let mut error_message = String::new();
        stderr.read_to_string(&mut error_message).await?;
        info!("FFmpeg error: {}", error_message);
        return Err(anyhow::anyhow!("FFmpeg process failed: {}", error_message));
    }

    if frame_data.is_empty() {
        return Err(anyhow::anyhow!("Failed to extract frame: no data received"));
    }

    Ok(general_purpose::STANDARD.encode(frame_data))
}

#[derive(Deserialize)]
pub struct MergeFramesRequest {
    pub video_path: String,      // path to the starting video
    pub frame_indexes: Vec<i64>, // target frame indices within the starting video
    pub surrounding_frames: i64, // number of frames before and after each target frame
}

#[derive(Serialize)]
pub struct MergeFramesResponse {
    video_path: String,
}

use crate::db::DatabaseManager;

pub async fn merge_frames_from_video(
    request: MergeFramesRequest,
    output_dir: PathBuf,
    db_manager: &DatabaseManager,
) -> Result<MergeFramesResponse> {
    info!(
        "merging frames from video: {:?}, indexes: {:?}, surrounding: {}",
        request.video_path, request.frame_indexes, request.surrounding_frames
    );

    let mut current_video = PathBuf::from(&request.video_path);

    // if the path is relative, resolve it against the output_dir
    if !current_video.is_absolute() {
        current_video = output_dir.join(current_video);
    }

    let temp_dir = tempfile::Builder::new()
        .prefix("screenpipe_")
        .tempdir()?;
    let temp_path = temp_dir.path().to_path_buf();
    info!("Using temporary directory: {:?}", temp_path);

    // Ensure the temporary directory is writable
    std::fs::set_permissions(&temp_path, Permissions::from_mode(0o755))?;

    let mut selected_frames = Vec::new();
    let mut frame_indexes = request.frame_indexes.clone();
    let mut remaining_frames = request.surrounding_frames * 2 + 1; // Total frames to collect

    let mut total_extracted_frames = 0;
    let mut total_failed_extractions = 0;

    loop {
        // check if the video file exists and is accessible
        if !current_video.exists() || !is_file_accessible(&current_video) {
            warn!(
                "Skipping inaccessible video (possibly being written): {:?}",
                current_video
            );
            break; // stop processing and use frames collected so far
        }

        // fetch total frames from the current video
        let total_frames = db_manager.get_total_frames(&current_video).await?;
        info!(
            "total frames in video {}: {}",
            current_video.display(),
            total_frames
        );

        // calculate frame ranges with total_frames consideration
        let frame_ranges = calculate_frame_ranges(&frame_indexes, remaining_frames, total_frames);
        let extracted = extract_frame_ranges(&current_video, &frame_ranges, &temp_path).await?;
        info!(
            "Extracted {} frames from {:?}",
            extracted.len(),
            current_video
        );
        total_extracted_frames += extracted.len();
        selected_frames.extend(extracted.clone());

        // Count failed extractions
        total_failed_extractions += frame_ranges.iter().map(|(start, end)| end - start + 1).sum::<i64>() as usize - extracted.len();

        // Update remaining frames
        remaining_frames -= extracted.len() as i64;

        // Check if we've collected enough frames
        if remaining_frames <= 0 {
            break;
        }

        // determine if we need to fetch the next video
        if let Some(next_video) = db_manager
            .get_next_video(&current_video.to_string_lossy())
            .await?
        {
            current_video = PathBuf::from(next_video);
            if !current_video.is_absolute() {
                current_video = output_dir.join(current_video);
            }
            frame_indexes = vec![0]; // reset frame index for the next video
        } else {
            break; // no more videos to fetch
        }
    }

    info!("Total extracted frames: {}", total_extracted_frames);
    info!("Total failed extractions: {}", total_failed_extractions);
    info!("Total selected frames: {}", selected_frames.len());

    if selected_frames.is_empty() {
        return Err(anyhow::anyhow!("No frames could be extracted"));
    }

    // generate output video filename
    let output_filename = format!("output_{}.mp4", Uuid::new_v4());
    let output_path = output_dir.join(&output_filename);

    info!("merging frames into video: {:?}", output_path);

    // merge extracted frames into a video
    merge_frames_into_video(&selected_frames, &output_path, &temp_path).await?;

    Ok(MergeFramesResponse {
        video_path: output_path.to_string_lossy().into_owned(),
    })
}

// Helper function to check if a file is accessible (not being written)
fn is_file_accessible(path: &Path) -> bool {
    std::fs::File::open(path).is_ok()
}

fn calculate_frame_ranges(
    frame_indexes: &[i64],
    remaining_frames: i64,
    total_frames: i64,
) -> Vec<(i64, i64)> {
    let mut ranges = BTreeSet::new();
    for &index in frame_indexes {
        let half_range = remaining_frames / 2;
        let start = std::cmp::max(0, index - half_range);
        let end = std::cmp::min(index + half_range, total_frames - 1);
        ranges.insert((start, end));
    }

    info!("frame ranges: {:?}", ranges);

    // Merge overlapping ranges
    let mut merged_ranges = Vec::new();
    let mut current_range = None;

    for range in ranges {
        if let Some((start, end)) = current_range {
            if range.0 <= end + 1 {
                current_range = Some((start, std::cmp::max(end, range.1)));
            } else {
                merged_ranges.push((start, end));
                current_range = Some(range);
            }
        } else {
            current_range = Some(range);
        }
    }

    if let Some(range) = current_range {
        merged_ranges.push(range);
    }

    info!("merged frame ranges: {:?}", merged_ranges);

    merged_ranges
}

async fn extract_frame_ranges(
    video_path: &Path,
    frame_ranges: &[(i64, i64)],
    temp_dir: &Path,
) -> Result<Vec<PathBuf>> {
    let mut extracted = Vec::new();

    for &(start, end) in frame_ranges {
        for frame_idx in start..=end {
            let unique_id = Uuid::new_v4();
            let frame_path = temp_dir.join(format!("frame_{}_{}.png", frame_idx, unique_id));
            match extract_frame_by_index(video_path, frame_idx, &frame_path).await {
                Ok(_) => {
                    if frame_path.exists() {
                        extracted.push(frame_path);
                    } else {
                        warn!("Frame not found after extraction: {:?}", frame_path);
                    }
                }
                Err(e) => {
                    warn!("Failed to extract frame {}: {}", frame_idx, e);
                }
            }
        }
    }

    Ok(extracted)
}

use std::fs;
use tokio::time::Duration;

async fn extract_frame_by_index(
    video_path: &Path,
    frame_index: i64,
    output_path: &Path,
) -> Result<()> {
    info!(
        "extracting frame {} from {:?} to {:?}",
        frame_index, video_path, output_path
    );
    let ffmpeg_path = find_ffmpeg_path().expect("Failed to find FFmpeg path");

    // Ensure the parent directory exists and is writable
    if let Some(parent) = output_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
        tokio::fs::set_permissions(parent, Permissions::from_mode(0o755)).await?;
    }

    let output = tokio::process::Command::new(&ffmpeg_path)
        .args(&[
            "-v", "verbose",  // Add verbose logging
            "-i",
            video_path.to_str().unwrap(),
            "-vf",
            &format!("select='eq(n,{})',showinfo", frame_index),  // Add showinfo filter
            "-vframes",
            "1",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .output()
        .await?;

    // Log stdout and stderr regardless of success
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    info!("ffmpeg stdout: {}", stdout);
    info!("ffmpeg stderr: {}", stderr);

    if output.status.success() {
        // Check for file existence multiple times with increasing delays
        for i in 0..5 {
            tokio::time::sleep(Duration::from_millis(100 * (i + 1))).await;
            if output_path.exists() {
                let metadata = fs::metadata(output_path)?;
                info!(
                    "frame extracted successfully: {:?}, size: {} bytes",
                    output_path,
                    metadata.len()
                );
                return Ok(());
            }
        }

        let error_msg = format!(
            "ffmpeg reported success, but output file not found after multiple checks: {:?}. Parent dir exists: {}, is writable: {}",
            output_path,
            output_path.parent().map_or(false, |p| p.exists()),
            output_path.parent().map_or(false, |p| !p.metadata().map(|m| m.permissions().readonly()).unwrap_or(true))
        );
        info!("{}", error_msg);
        Err(anyhow::anyhow!(error_msg))
    } else {
        let error_msg = format!(
            "ffmpeg failed to extract frame {} from {:?}. error: {}",
            frame_index,
            video_path,
            stderr
        );
        info!("{}", error_msg);
        Err(anyhow::anyhow!(error_msg))
    }
}

async fn merge_frames_into_video(
    frames: &[PathBuf],
    output_path: &Path,
    temp_dir: &Path,
) -> Result<()> {
    let frame_list_file = NamedTempFile::new_in(temp_dir)?;
    let frame_list_path = frame_list_file.path().to_path_buf();

    {
        let mut file = File::create(&frame_list_path)?;
        for frame in frames {
            if frame.exists() {
                writeln!(file, "file '{}'", frame.to_str().unwrap())?;
            } else {
                warn!("Frame file not found: {:?}", frame);
            }
        }
    }

    // Log frame list content
    let frame_list_content = std::fs::read_to_string(&frame_list_path)?;
    info!("Frame list file content:\n{}", frame_list_content);

    let status = tokio::process::Command::new("ffmpeg")
        .args(&[
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            frame_list_path.to_str().unwrap(),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "1",
            "-y", // Overwrite output file if it exists
            output_path.to_str().unwrap(),
        ])
        .output()
        .await?;

    // Log ffmpeg's output
    let stdout = String::from_utf8_lossy(&status.stdout);
    let stderr = String::from_utf8_lossy(&status.stderr);
    info!("ffmpeg stdout: {}", stdout);
    info!("ffmpeg stderr: {}", stderr);

    if status.status.success() {
        if output_path.exists() {
            info!("Video merged successfully: {:?}", output_path);
            Ok(())
        } else {
            Err(anyhow::anyhow!(
                "ffmpeg reported success, but output file not found: {:?}",
                output_path
            ))
        }
    } else {
        Err(anyhow::anyhow!(
            "ffmpeg failed to merge frames into video. frame list: {:?}",
            frame_list_path
        ))
    }
}
