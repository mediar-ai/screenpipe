use std::fs;
use std::io;
use tracing::info;
use std::path::Path;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskUsage {
    pub pipes: Vec<(String, String)>, // why not pipes' size??
    pub total_data_size: String,
    pub total_pipes_size: String,
    pub total_video_size: String,
    pub total_audio_size: String,
}

pub fn directory_size(path: &Path) -> io::Result<u64> {
    let mut size = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            size += directory_size(&entry.path())?;
        } else {
            size += metadata.len();
        }
    }
    Ok(size)
}

pub fn readable(size: u64) -> String {
    let units = ["KB", "MB", "GB"];
    let mut size = size as f64 / 1024.0;
    let mut unit = 0;
    while size >= 1024.0 && unit < units.len() - 1 {
        size /= 1024.0;
        unit += 1;
    }
    format!("{:.2} {}", size, units[unit])
}

pub async fn disk_usage(screenpipe_dir: &PathBuf) -> Result<Option<DiskUsage>, String> {
    info!("Getting total disk usage, path {:?}", screenpipe_dir);
    let mut pipes = Vec::new();
    let mut total_video_size = 0;
    let mut total_audio_size = 0;

    let pipes_dir = screenpipe_dir.join("pipes");
    let data_dir = screenpipe_dir.join("data");

    for entry in fs::read_dir(&pipes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let size = directory_size(&path).map_err(|e| e.to_string())?;
            pipes.push((path.file_name().unwrap().to_string_lossy().to_string(), readable(size)));
        }
    }

    let total_data_size= directory_size(&data_dir).map_err(|e| e.to_string())?;
    let total_pipes_size = directory_size(&pipes_dir).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(&data_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            let size = entry.metadata().map_err(|e| e.to_string())?.len();
            let file_name = path.file_name().unwrap().to_string_lossy().to_string();
            if file_name.contains("input") || file_name.contains("output") {
                total_audio_size += size;
            } else {
                total_video_size += size;
            }
        }
    }

    let disk_usage = DiskUsage {
        pipes,
        total_data_size: readable(total_data_size),
        total_pipes_size: readable(total_pipes_size),
        total_video_size: readable(total_video_size),
        total_audio_size: readable(total_audio_size),
    };

    Ok(Some(disk_usage))
}
