use log::{debug, error};
use std::path::PathBuf;
use which::which;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(not(windows))]
const EXECUTABLE_NAME: &str = "ffmpeg";

#[cfg(windows)]
const EXECUTABLE_NAME: &str = "ffmpeg.exe";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn find_ffmpeg_path() -> Option<PathBuf> {
    debug!("Starting search for ffmpeg executable");
    let mut ffmpeg_path = None;

    // Check if `ffmpeg` is in the PATH environment variable using the `which` crate
    if let Ok(path) = which(EXECUTABLE_NAME) {
        debug!("Found ffmpeg in PATH: {:?}", path);
        ffmpeg_path = Some(path);
    } else {
        debug!("ffmpeg not found in PATH");
    }

    // Check in current working directory
    let cwd = std::env::current_dir().ok()?;
    debug!("Current working directory: {:?}", cwd);
    let ffmpeg_in_cwd = cwd.join(EXECUTABLE_NAME);
    if ffmpeg_in_cwd.is_file() && ffmpeg_in_cwd.exists() {
        debug!(
            "Found ffmpeg in current working directory: {:?}",
            ffmpeg_in_cwd
        );
        ffmpeg_path = Some(ffmpeg_in_cwd);
    } else {
        debug!("ffmpeg not found in current working directory");
    }

    // Check in the same folder as the executable
    if let Ok(exe_path) = std::env::current_exe() {
        let exe_folder = exe_path.parent()?;
        debug!("Executable folder: {:?}", exe_folder);
        let ffmpeg_in_exe_folder = exe_folder.join(EXECUTABLE_NAME);
        if ffmpeg_in_exe_folder.exists() {
            debug!(
                "Found ffmpeg in executable folder: {:?}",
                ffmpeg_in_exe_folder
            );
            ffmpeg_path = Some(ffmpeg_in_exe_folder);
        } else {
            debug!("ffmpeg not found in executable folder");
        }
        // For macOS, check in the Resources folder next to the executable
        #[cfg(target_os = "macos")]
        {
            let resources_folder = exe_folder.join("../Resources");
            debug!("Resources folder: {:?}", resources_folder);
            let ffmpeg_in_resources = resources_folder.join(EXECUTABLE_NAME);
            if ffmpeg_in_resources.exists() {
                debug!(
                    "Found ffmpeg in Resources folder: {:?}",
                    ffmpeg_in_resources
                );
                ffmpeg_path = Some(ffmpeg_in_resources);
            } else {
                debug!("ffmpeg not found in Resources folder");
            }
        }
        #[cfg(target_os = "linux")]
        {
            let lib_folder = exe_folder.join("lib");
            debug!("Lib folder: {:?}", lib_folder);
            let ffmpeg_in_lib = lib_folder.join(EXECUTABLE_NAME);
            if ffmpeg_in_lib.exists() {
                debug!("Found ffmpeg in lib folder: {:?}", ffmpeg_in_lib);
                ffmpeg_path = Some(ffmpeg_in_lib);
            } else {
                debug!("ffmpeg not found in lib folder");
            }
        }
    }

    if let Some(path) = ffmpeg_path {
        let current_path = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();

        // if already contains ffmpeg lib path, don't add it again
        if current_path.contains(path.join("lib").to_str().unwrap()) {
            return Some(path);
        }

        if let Some(lib_path) = path
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("lib"))
        {
            let new_path = format!("{}:{}", lib_path.to_str().unwrap(), current_path);
            std::env::set_var("LD_LIBRARY_PATH", new_path.clone());
            debug!(
                "Set LD_LIBRARY_PATH to include FFmpeg libraries: {}",
                new_path
            );
        }
        return Some(path);
    }
    error!("ffmpeg not found");
    // crash
    panic!("ffmpeg not found");
}
