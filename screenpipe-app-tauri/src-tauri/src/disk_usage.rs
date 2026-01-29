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
    pub media: DiskUsedByMedia,
    pub total_data_size: String,
    pub total_cache_size: String,
    pub available_space: String,
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
    if size == 0 {
        return "0 KB".to_string();
    }

    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut size = size as f64;
    let mut unit = 0;

    while size >= 1024.0 && unit < units.len() - 1 {
        size /= 1024.0;
        unit += 1;
    }

    if unit == 0 {
        format!("{:.0} {}", size, units[unit])
    } else if units[unit] == "GB" || units[unit] == "TB" {
        format!("{:.2} {}", size, units[unit])
    } else {
        format!("{:.1} {}", size, units[unit])
    }
}

pub async fn disk_usage(
    screenpipe_dir: &PathBuf,
    force_refresh: bool,
) -> Result<Option<DiskUsage>, String> {
    info!(
        "Calculating disk usage for directory: {} (force_refresh: {})",
        screenpipe_dir.display(),
        force_refresh
    );
    let data_dir = screenpipe_dir.join("data");

    let cache_dir = match get_cache_dir()? {
        Some(dir) => dir,
        None => return Err("Cache directory not found".to_string()),
    };

    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let cache_file = cache_dir.join("disk_usage.json");

    // Skip cache if force_refresh is requested
    if !force_refresh {
        if let Ok(content) = fs::read_to_string(&cache_file) {
            if content.contains("---") {
                info!("Cache contains incomplete values, recalculating...");
            } else if let Ok(cached) = serde_json::from_str::<CachedDiskUsage>(&content) {
                let now = chrono::Local::now().timestamp();
                let one_hour = 60 * 60; // 1 hour cache (reduced from 2 days)
                if now - cached.timestamp < one_hour {
                    info!("Using cached disk usage data (age: {}s)", now - cached.timestamp);
                    return Ok(Some(cached.usage));
                }
            }
        }
    } else {
        info!("Force refresh requested, bypassing cache");
    }

    let mut total_video_size: u64 = 0;
    let mut total_audio_size: u64 = 0;

    // Calculate total data size
    info!(
        "Calculating total data size for: {}",
        screenpipe_dir.display()
    );
    let total_data_size = match directory_size(screenpipe_dir).map_err(|e| e.to_string())? {
        Some(size) => {
            info!("Total data size: {} bytes", size);
            readable(size)
        }
        None => {
            warn!("Could not calculate total data size");
            "---".to_string()
        }
    };

    // Calculate cache size
    info!("Calculating cache size for: {}", cache_dir.display());
    let total_cache_size = match directory_size(&cache_dir).map_err(|e| e.to_string())? {
        Some(size) => {
            info!("Total cache size: {} bytes", size);
            readable(size)
        }
        None => {
            warn!("Could not calculate cache size");
            "---".to_string()
        }
    };

    // Calculate individual media file sizes recursively
    if data_dir.exists() {
        info!("Scanning data directory recursively for media files");
        fn scan_media_files(
            dir: &Path,
            video_size: &mut u64,
            audio_size: &mut u64,
        ) -> io::Result<()> {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    // Recursively scan subdirectories
                    scan_media_files(&path, video_size, audio_size)?;
                } else if path.is_file() {
                    let size = entry.metadata()?.len();
                    let file_name = path.file_name().unwrap().to_string_lossy().to_string();

                    // Classify files based on extension and name patterns
                    let extension = path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    // For .mp4 files, check filename to determine if audio or video
                    // Audio devices (microphones) save as "DeviceName (input)_timestamp.mp4"
                    // Screen recordings save as "monitor_N_timestamp.mp4"
                    if extension == "mp4" {
                        if file_name.contains("(input)")
                            || file_name.contains("(output)")
                            || file_name.to_lowercase().contains("audio")
                            || file_name.to_lowercase().contains("microphone")
                        {
                            *audio_size += size;
                        } else {
                            *video_size += size;
                        }
                    } else {
                        match extension.as_str() {
                            // Audio file extensions
                            "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => {
                                *audio_size += size;
                            }
                            // Video file extensions
                            "avi" | "mkv" | "mov" | "wmv" | "flv" | "webm" | "m4v" => {
                                *video_size += size;
                            }
                            // Ignore non-media files (db, json, log, etc.)
                            _ => {}
                        }
                    }
                }
            }
            Ok(())
        }

        if let Err(e) = scan_media_files(&data_dir, &mut total_video_size, &mut total_audio_size) {
            warn!("Error scanning media files: {}", e);
        }

        info!(
            "Video files total: {} bytes, Audio files total: {} bytes",
            total_video_size, total_audio_size
        );
    } else {
        warn!("Data directory does not exist: {}", data_dir.display());
    }

    let videos_size_str = readable(total_video_size);
    let audios_size_str = readable(total_audio_size);
    let total_media_size_calculated = total_video_size + total_audio_size;
    let total_media_size_str = readable(total_media_size_calculated);

    // Calculate available space
    info!("Calculating available disk space");
    let available_space = {
        let mut sys = System::new();
        sys.refresh_disks_list();
        let path_obj = Path::new(&screenpipe_dir);
        let available = sys
            .disks()
            .iter()
            .find(|disk| path_obj.starts_with(disk.mount_point()))
            .map(|disk| disk.available_space())
            .unwrap_or(0);
        info!("Available disk space: {} bytes", available);
        available
    };

    let disk_usage = DiskUsage {
        media: DiskUsedByMedia {
            videos_size: videos_size_str,
            audios_size: audios_size_str,
            total_media_size: total_media_size_str,
        },
        total_data_size,
        total_cache_size,
        available_space: readable(available_space),
    };

    info!("Disk usage calculation completed: {:?}", disk_usage);

    // Cache the result
    let cached = CachedDiskUsage {
        timestamp: chrono::Local::now().timestamp(),
        usage: disk_usage.clone(),
    };

    info!(
        "Writing disk usage cache file: {}",
        cache_file.to_string_lossy()
    );

    if let Err(e) = fs::write(&cache_file, serde_json::to_string_pretty(&cached).unwrap()) {
        warn!("Failed to write cache file: {}", e);
    }

    Ok(Some(disk_usage))
}
