use log::{debug, error};
use std::{collections::HashSet, path::PathBuf};
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
        return Some(path);
    }
    //     let current_ld_path = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
    //     let current_dyld_path = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();

    //     let mut new_paths = HashSet::new();

    //     // Add Homebrew lib paths
    //     #[cfg(target_os = "macos")]
    //     {
    //         new_paths.insert("/opt/homebrew/opt/ffmpeg/lib".to_string());
    //         new_paths.insert("/opt/homebrew/opt/lame/lib".to_string());
    //         new_paths.insert("/Applications/screenpipe.app/Contents/Frameworks".to_string());
    //     }

    //     // Function to update environment variable
    //     fn update_env_var(name: &str, current: &str, new_paths: &HashSet<String>) {
    //         let current_set: HashSet<_> = current.split(':').map(String::from).collect();
    //         let combined: HashSet<_> = current_set.union(new_paths).cloned().collect();
    //         let updated = combined.into_iter().collect::<Vec<_>>().join(":");
    //         std::env::set_var(name, &updated);
    //         debug!("Updated {}: {}", name, updated);
    //     }

    //     // Update LD_LIBRARY_PATH
    //     update_env_var("LD_LIBRARY_PATH", &current_ld_path, &new_paths);

    //     // Update DYLD_LIBRARY_PATH for macOS
    //     #[cfg(target_os = "macos")]
    //     update_env_var("DYLD_LIBRARY_PATH", &current_dyld_path, &new_paths);

    //     // Print out the updated environment variables
    //     debug!(
    //         "Updated LD_LIBRARY_PATH: {:?}",
    //         std::env::var("LD_LIBRARY_PATH")
    //     );
    //     #[cfg(target_os = "macos")]
    //     debug!(
    //         "Updated DYLD_LIBRARY_PATH: {:?}",
    //         std::env::var("DYLD_LIBRARY_PATH")
    //     );

    //     return Some(path);
    // }
    error!("ffmpeg not found");
    // crash
    panic!("ffmpeg not found");
}
