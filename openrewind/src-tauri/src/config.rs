use std::{fs, path::PathBuf};
use tauri::Manager;

pub fn get_base_dir(
    app: &tauri::AppHandle,
    custom_path: Option<String>,
) -> anyhow::Result<PathBuf> {
    let default_path = app.path().local_data_dir().unwrap().join("screenpipe");

    let local_data_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);

    fs::create_dir_all(local_data_dir.join("data"))?;
    Ok(local_data_dir)
}
