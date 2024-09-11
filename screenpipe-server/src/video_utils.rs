use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use screenpipe_core::find_ffmpeg_path;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tracing::{debug, error};

pub async fn extract_frame(file_path: &str, offset_index: i64) -> Result<String> {
    let ffmpeg_path = find_ffmpeg_path().expect("Failed to find FFmpeg path");

    let offset_seconds = offset_index as f64 / 1000.0;
    let offset_str = format!("{:.3}", offset_seconds);

    debug!(
        "Extracting frame from {} at offset {}",
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

    debug!("FFmpeg command: {:?}", command);

    let mut child = command.spawn()?;
    let mut stdout = child.stdout.take().expect("Failed to open stdout");
    let mut stderr = child.stderr.take().expect("Failed to open stderr");

    let mut frame_data = Vec::new();
    stdout.read_to_end(&mut frame_data).await?;

    let status = child.wait().await?;
    if !status.success() {
        let mut error_message = String::new();
        stderr.read_to_string(&mut error_message).await?;
        error!("FFmpeg error: {}", error_message);
        return Err(anyhow::anyhow!("FFmpeg process failed: {}", error_message));
    }

    if frame_data.is_empty() {
        return Err(anyhow::anyhow!("Failed to extract frame: no data received"));
    }

    Ok(general_purpose::STANDARD.encode(frame_data))
}
