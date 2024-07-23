use log::{debug, error};
use std::path::PathBuf;
use which::which;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(not(windows))]
const EXECUTABLE_NAME: &str = "screenpipe";

#[cfg(windows)]
const EXECUTABLE_NAME: &str = "screenpipe.exe";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn find_screenpipe_path() -> Option<PathBuf> {
    debug!("Starting search for screenpipe executable");

    // Check if `ffmpeg` is in the PATH environment variable
    if let Ok(path) = which(EXECUTABLE_NAME) {
        debug!("Found screenpipe in PATH: {:?}", path);
        return Some(path);
    }
    debug!("screenpipe not found in PATH");

    // Check in current working directory
    if let Ok(cwd) = std::env::current_dir() {
        debug!("Current working directory: {:?}", cwd);
        let screenpipe_in_cwd = cwd.join(EXECUTABLE_NAME);
        if screenpipe_in_cwd.is_file() && screenpipe_in_cwd.exists() {
            debug!(
                "Found screenpipe in current working directory: {:?}",
                screenpipe_in_cwd
            );
            return Some(screenpipe_in_cwd);
        }
        debug!("screenpipe not found in current working directory");
    }

    // Check in the same folder as the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_folder) = exe_path.parent() {
            debug!("Executable folder: {:?}", exe_folder);
            let screenpipe_in_exe_folder = exe_folder.join(EXECUTABLE_NAME);
            if screenpipe_in_exe_folder.exists() {
                debug!(
                    "Found screenpipe in executable folder: {:?}",
                    screenpipe_in_exe_folder
                );
                return Some(screenpipe_in_exe_folder);
            }
            debug!("screenpipe not found in executable folder");

            // Platform-specific checks
            #[cfg(target_os = "macos")]
            {
                let resources_folder = exe_folder.join("../Resources");
                debug!("Resources folder: {:?}", resources_folder);
                let screenpipe_in_resources = resources_folder.join(EXECUTABLE_NAME);
                if screenpipe_in_resources.exists() {
                    debug!(
                        "Found screenpipe in Resources folder: {:?}",
                        screenpipe_in_resources
                    );
                    return Some(screenpipe_in_resources);
                }
                debug!("screenpipe not found in Resources folder");
            }

            #[cfg(target_os = "linux")]
            {
                let lib_folder = exe_folder.join("lib");
                debug!("Lib folder: {:?}", lib_folder);
                let screenpipe_in_lib = lib_folder.join(EXECUTABLE_NAME);
                if screenpipe_in_lib.exists() {
                    debug!("Found screenpipe in lib folder: {:?}", screenpipe_in_lib);
                    return Some(screenpipe_in_lib);
                }
                debug!("screenpipe not found in lib folder");
            }
        }
    }

    // check in $HOME/.local/bin
    let home = dirs::home_dir().unwrap();
    let screenpipe_in_home = PathBuf::from(home).join(".local/bin").join(EXECUTABLE_NAME);
    if screenpipe_in_home.exists() {
        debug!(
            "Found screenpipe in $HOME/.local/bin: {:?}",
            screenpipe_in_home
        );
        return Some(screenpipe_in_home);
    }

    error!("screenpipe not found");
    None // Return None if screenpipe is not found
}
