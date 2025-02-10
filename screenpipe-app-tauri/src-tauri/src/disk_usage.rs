use chrono;
use serde::{Deserialize, Serialize};
use serde_json;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use sysinfo::{DiskExt, System, SystemExt};
use tracing::info;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskUsage {
    pub pipes: DiskUsedByPipes,
    pub media: DiskUsedByMedia,
    pub total_data_size: String,
    pub total_cache_size: String,
    pub avaiable_space: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskUsedByPipes {
    pub pipes: Vec<(String, String)>, // why not pipes' size??
    pub total_pipes_size: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskUsedByMedia {
    pub videos_size: String,
    pub audios_size: String,
    pub total_media_size: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedDiskUsage {
    pub timestamp: i64,
    pub usage: DiskUsage,
}

pub fn get_cache_dir() -> Result<Option<PathBuf>, String> {
    let proj_dirs = dirs::cache_dir().ok_or_else(|| "failed to get cache dir".to_string())?;
    Ok(Some(proj_dirs.join("screenpipe")))
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
    if units[unit] == "GB" {
        format!("{:.2} {}", size, units[unit])
    } else {
        format!("{:.1} {}", size, units[unit])
    }
}

pub async fn disk_usage(screenpipe_dir: &PathBuf) -> Result<Option<DiskUsage>, String> {
    // Create base directories if they don't exist
    fs::create_dir_all(screenpipe_dir).map_err(|e| e.to_string())?;
    
    let pipes_dir = screenpipe_dir.join("pipes");
    let data_dir = screenpipe_dir.join("data");
    
    // Create required subdirectories
    fs::create_dir_all(&pipes_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    
    let cache_dir = match get_cache_dir()? {
        Some(dir) => dir,
        None => return Err("Cache directory not found".to_string()),
    };
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    
    // Create screenpipe subdirectory in cache
    let screenpipe_cache_dir = cache_dir.join("screenpipe");
    fs::create_dir_all(&screenpipe_cache_dir).map_err(|e| e.to_string())?;
    
    let cache_file = screenpipe_cache_dir.join("disk_usage.json");

    // Check if cache exists and is recent
    if let Ok(content) = fs::read_to_string(&cache_file) {
        if let Ok(cached) = serde_json::from_str::<CachedDiskUsage>(&content) {
            let now = chrono::Utc::now().timestamp();
            let two_days = 2 * 24 * 60 * 60; // 2 days in seconds
            if now - cached.timestamp < two_days {
                return Ok(Some(cached.usage));
            }
        }
    }

    // Calculate new disk usage
    info!(
        "Cache miss or expired, calculating disk usage for path {:?}",
        screenpipe_dir
    );
    let mut pipes = Vec::new();
    let mut total_video_size = 0;
    let mut total_audio_size = 0;

    for entry in fs::read_dir(&pipes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let size = directory_size(&path).map_err(|e| e.to_string())?;
            pipes.push((
                path.file_name().unwrap().to_string_lossy().to_string(),
                readable(size),
            ));
        }
    }

    let total_data_size = directory_size(screenpipe_dir).map_err(|e| e.to_string())?;
    let total_media_size = directory_size(&data_dir).map_err(|e| e.to_string())?;
    let total_pipes_size = directory_size(&pipes_dir).map_err(|e| e.to_string())?;
    let total_cache_size = directory_size(&screenpipe_cache_dir).map_err(|e| e.to_string())?;

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

    let avaiable_space = {
        let mut sys = System::new();
        sys.refresh_disks_list();
        let path_obj = Path::new(&screenpipe_dir);
        sys.disks()
            .iter()
            .find(|disk| path_obj.starts_with(disk.mount_point()))
            .map(|disk| disk.available_space())
            .unwrap_or(0)
    };

    let disk_usage = DiskUsage {
        pipes: DiskUsedByPipes {
            pipes,
            total_pipes_size: readable(total_pipes_size),
        },
        media: DiskUsedByMedia {
            videos_size: readable(total_video_size),
            audios_size: readable(total_audio_size),
            total_media_size: readable(total_media_size),
        },
        total_data_size: readable(total_data_size + total_cache_size),
        total_cache_size: readable(total_cache_size),
        avaiable_space: readable(avaiable_space),
    };

    // Cache the result
    let cached = CachedDiskUsage {
        timestamp: chrono::Utc::now().timestamp(),
        usage: disk_usage.clone(),
    };

    if let Err(e) = fs::write(&cache_file, serde_json::to_string_pretty(&cached).unwrap()) {
        info!("Failed to write cache file: {}", e);
    }


    Ok(Some(disk_usage))
}
