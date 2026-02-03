use std::{fs, path::PathBuf};

pub fn get_base_dir(
    _app: &tauri::AppHandle,
    custom_path: Option<String>,
) -> anyhow::Result<PathBuf> {
    // Use $HOME/.screenpipe to match CLI default
    let default_path = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not get home directory"))?
        .join(".screenpipe");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(local_data_dir.join("data"))?;
    Ok(local_data_dir)
}
