#[cfg(target_os = "macos")]
const MULTI_MEDIA_FRAMEWORK: &str = "avfoundation";

#[cfg(target_os = "windows")]
const MULTI_MEDIA_FRAMEWORK: &str = "directshow";

#[cfg(target_os = "linux")]
const MULTI_MEDIA_FRAMEWORK: &str = "v4l2";

use tokio::process::Command;

pub struct VideoDevice {
  pub id: String,
  pub name: String,
}

pub async fn list_video_devices() -> Vec<VideoDevice>{
    list_input_devices(MULTI_MEDIA_FRAMEWORK).await
}

async fn list_input_devices(framework: &str) -> Vec<VideoDevice>{
  let output = Command::new("ffmpeg")
      .arg("-f")
      .arg(framework)
      .arg("-list_devices")
      .arg("true")
      .arg("-i")
      .arg("")
      .output()
      .await;

  let mut devices = Vec::new();

  let output = output.unwrap();
  let stderr_output = String::from_utf8_lossy(&output.stderr);

  let mut parsing_video = false;
  for line in stderr_output.lines() {
      if line.contains("video devices"){
        parsing_video = true;
        continue;
      }
      if line.contains("audio devices") {
          break;
      }
      if parsing_video {
        if let Some(device) = parse_device(line) {
            devices.push(device);
        }
      }
    }
  devices
}

fn parse_device(line: &str) -> Option<VideoDevice> {
  let parts: Vec<&str> = line.splitn(3, "] ").collect();
  Some(VideoDevice {
    id: parts[1].trim_matches('[').to_string(),
    name: parts[2].trim().to_string(),
  })
}