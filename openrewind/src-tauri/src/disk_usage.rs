use chrono;
use serde::{Deserialize, Serialize};
use serde_json;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use sysinfo::{DiskExt, System, SystemExt};
use tracing::{info, warn};

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

pub fn directory_size(path: &Path) -> io::Result<Option<u64>> {
    if !path.exists() {
        return Ok(None);
    }
    let mut size = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            size += directory_size(&entry.path())?.unwrap_or(0);
        } else {
            size += metadata.len();
        }
    }
    Ok(Some(size))
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
    let pipes_dir = screenpipe_dir.join("pipes");
    let data_dir = screenpipe_dir.join("data");
    
    let cache_dir = match get_cache_dir()? {
        Some(dir) => dir,
        None => return Err("Cache directory not found".to_string()),
    };

    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let cache_file = cache_dir.join("disk_usage.json");

    if let Ok(content) = fs::read_to_string(&cache_file) {
        warn!("disk cache file found: {}", cache_file.to_string_lossy());
        if content.contains("---") {
            info!("possibly some values in disk usgae haven't calculated, recalculating...");
        } else {
            if let Ok(cached) = serde_json::from_str::<CachedDiskUsage>(&content) {
                let now = chrono::Local::now().timestamp();
                let two_days = 2 * 24 * 60 * 60; // 2 days in seconds
                if now - cached.timestamp < two_days {
                    return Ok(Some(cached.usage));
                }
            }
        }
    }

    let mut pipes = Vec::new();
    let mut total_video_size: Option<u64> = Some(0);
    let mut total_audio_size: Option<u64> = Some(0);

    if pipes_dir.exists() {
        for entry in fs::read_dir(&pipes_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                let size = directory_size(&path).map_err(|e| e.to_string())?;
                let size_str = match size {
                    Some(s) => readable(s),
                    None => "---".to_string(),
                };
                pipes.push((
                    path.file_name().unwrap().to_string_lossy().to_string(),
                    size_str,
                ));
            } 
        }
    } else {
        warn!("there are no pipes to calculate sizes");
    }

    let total_data_size = match directory_size(screenpipe_dir).map_err(|e| e.to_string())? {
        Some(size) => readable(size),
        None => "---".to_string(),
    };
    let total_media_size = match directory_size(&data_dir).map_err(|e| e.to_string())? {
        Some(size) => readable(size),
        None => "---".to_string(),
    };
    let total_pipes_size = match directory_size(&pipes_dir).map_err(|e| e.to_string())? {
        Some(size) => readable(size),
        None => "---".to_string(),
    };
    let total_cache_size = match directory_size(&cache_dir).map_err(|e| e.to_string())? {
        Some(size) => readable(size),
        None => "---".to_string(),
    };

    if data_dir.exists() {
        for entry in fs::read_dir(&data_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                let size = entry.metadata().map_err(|e| e.to_string())?.len();
                let file_name = path.file_name().unwrap().to_string_lossy().to_string();
                if file_name.contains("input") || file_name.contains("output") {
                    total_audio_size = total_audio_size.map(|s| s + size);
                } else {
                    total_video_size = total_video_size.map(|s| s + size);
                }
            }
        }
    } else {
        warn!("no data dir to calculate disk usage");
        total_audio_size = None;
        total_video_size = None;
    }

    let videos_size_str = total_video_size.map_or("---".to_string(), |s| readable(s));
    let audios_size_str = total_audio_size.map_or("---".to_string(), |s| readable(s));

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
            total_pipes_size,
        },
        media: DiskUsedByMedia {
            videos_size: videos_size_str,
            audios_size: audios_size_str,
            total_media_size,
        },
        total_data_size,
        total_cache_size,
        avaiable_space: readable(avaiable_space),
    };

    // Cache the result
    let cached = CachedDiskUsage {
        timestamp: chrono::Local::now().timestamp(),
        usage: disk_usage.clone(),
    };

    info!("writing disk usage cache file: {}", cache_file.to_string_lossy());

    if let Err(e) = fs::write(&cache_file, serde_json::to_string_pretty(&cached).unwrap()) {
        info!("Failed to write cache file: {}", e);
    }

    Ok(Some(disk_usage))
}
