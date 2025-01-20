use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use chrono::NaiveDateTime;
use chrono::{DateTime, Utc};
use image::DynamicImage;
use screenpipe_core::find_ffmpeg_path;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::path::PathBuf;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tracing::{debug, error, info};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct FFprobeOutput {
    format: Format,
    streams: Vec<Stream>,
}

#[derive(Debug, Deserialize)]
struct Format {
    duration: Option<String>,
    tags: Option<Tags>,
}

#[derive(Debug, Deserialize)]
struct Tags {
    creation_time: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Stream {
    r_frame_rate: String,
}

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

fn parse_time_from_filename(path: &str) -> Option<DateTime<Utc>> {
    let path = Path::new(path);
    let filename = path.file_name()?.to_str()?;

    // Assuming format: monitor_1_2024-10-19_02-51-20.mp4
    let parts: Vec<&str> = filename.split('_').collect();
    if parts.len() >= 4 {
        let date = parts[2];
        let time = parts[3].split('.').next()?;
        let datetime_str = format!("{} {}", date, time.replace('-', ":"));

        // Parse with format "2024-10-19 02:51:20"
        NaiveDateTime::parse_from_str(&datetime_str, "%Y-%m-%d %H:%M:%S")
            .ok()?
            .and_local_timezone(Utc)
            .earliest()
    } else {
        None
    }
}

pub async fn get_video_metadata(video_path: &str) -> Result<VideoMetadata> {
    let ffmpeg_path = find_ffmpeg_path().expect("failed to find ffmpeg path");
    let ffprobe_path = ffmpeg_path.with_file_name("ffprobe");

    // Try ffprobe first
    let creation_time = match Command::new(&ffprobe_path)
        .args(&[
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-show_entries",
            "format_tags=creation_time",
            video_path,
        ])
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let metadata: FFprobeOutput = serde_json::from_str(&stdout)?;

            metadata
                .format
                .tags
                .and_then(|t| t.creation_time)
                .and_then(|t| {
                    DateTime::parse_from_rfc3339(&t)
                        .or_else(|_| DateTime::parse_from_str(&t, "%Y-%m-%d %H:%M:%S%.f %z"))
                        .or_else(|_| DateTime::parse_from_str(&t, "%Y-%m-%d %H:%M:%S"))
                        .ok()
                })
                .map(|t| t.with_timezone(&Utc))
        }
        _ => None,
    };

    // Try filename if ffprobe failed
    let creation_time = creation_time.or_else(|| parse_time_from_filename(video_path));

    // Try filesystem metadata if everything else failed
    let creation_time = match creation_time {
        Some(time) => time,
        None => {
            if let Ok(metadata) = tokio::fs::metadata(video_path).await {
                if let Ok(created) = metadata.created() {
                    DateTime::<Utc>::from(created)
                } else {
                    debug!("falling back to current time for creation_time");
                    Utc::now()
                }
            } else {
                debug!("falling back to current time for creation_time");
                Utc::now()
            }
        }
    };

    // Rest of the metadata gathering (fps, duration) remains the same...
    let (fps, duration) = get_video_technical_metadata(&ffprobe_path, video_path).await?;

    Ok(VideoMetadata {
        creation_time,
        fps,
        duration,
        device_name: None,
        name: Some(video_path.to_string()),
    })
}

// Helper function to get fps and duration
async fn get_video_technical_metadata(ffprobe_path: &Path, video_path: &str) -> Result<(f64, f64)> {
    let output = Command::new(ffprobe_path)
        .args(&[
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            video_path,
        ])
        .output()
        .await?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let metadata: FFprobeOutput = serde_json::from_str(&stdout)?;

    let fps = metadata
        .streams
        .first()
        .and_then(|s| {
            let parts: Vec<f64> = s
                .r_frame_rate
                .split('/')
                .filter_map(|n| n.parse().ok())
                .collect();
            if parts.len() == 2 && parts[1] != 0.0 {
                Some(parts[0] / parts[1])
            } else {
                None
            }
        })
        .unwrap_or(30.0);

    let duration = metadata
        .format
        .duration
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok((fps, duration))
}

#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub creation_time: DateTime<Utc>,
    pub fps: f64,
    pub duration: f64,
    pub device_name: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VideoMetadataOverrides {
    pub overrides: Vec<VideoMetadataItem>,
}

#[derive(Debug, Deserialize)]
pub struct VideoMetadataItem {
    pub file_path: String, // Direct file path
    pub metadata: VideoMetadataOverride,
}

#[derive(Debug, Deserialize)]
pub struct VideoMetadataOverride {
    pub creation_time: Option<DateTime<Utc>>,
    pub fps: Option<f64>,
    pub duration: Option<f64>,
    pub device_name: Option<String>,
    pub name: Option<String>,
}

impl VideoMetadataOverride {
    pub fn apply_to(&self, metadata: &mut VideoMetadata) {
        if let Some(creation_time) = self.creation_time {
            metadata.creation_time = creation_time;
        }
        if let Some(fps) = self.fps {
            metadata.fps = fps;
        }
        if let Some(duration) = self.duration {
            metadata.duration = duration;
        }
        if let Some(ref device_name) = self.device_name {
            metadata.device_name = Some(device_name.clone());
        }
        if let Some(ref name) = self.name {
            metadata.name = Some(name.clone());
        }
    }
}
