use super::get_base_dir;
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_store::StoreBuilder;
use tracing::{info};


#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProfilesConfig {
    active_profile: String,
    profiles: Vec<String>,
}

impl Default for ProfilesConfig {
    fn default() -> Self {
        Self {
            active_profile: "default".to_string(),
            profiles: vec!["default".to_string()],
        }
    }
}

pub fn get_profiles_store(
    app: &AppHandle,
) -> anyhow::Result<Arc<tauri_plugin_store::Store<tauri::Wry>>> {
    let base_dir = get_base_dir(app, None)?;
    let profiles_path = base_dir.join("profiles.bin");
    Ok(StoreBuilder::new(app, profiles_path).build()?)
}

pub fn get_store(
    app: &AppHandle,
    profile_name: Option<String>,
) -> anyhow::Result<Arc<tauri_plugin_store::Store<tauri::Wry>>> {
    let base_dir = get_base_dir(app, None)?;
    let profiles_path = base_dir.join("profiles.bin");

    // Try to load profiles configuration, fallback to default if file doesn't exist
    let profile = if profiles_path.exists() {
        let profiles_store = StoreBuilder::new(app, profiles_path.clone()).build()?;
        match profile_name {
            Some(name) => name,
            None => profiles_store
                .get("activeProfile")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| "default".to_string()),
        }
    } else {
        "default".to_string()
    };

    info!("Using settings profile: {}", profile);

    // Determine store file path based on profile
    let store_path = if profile == "default" {
        base_dir.join("store.bin")
    } else {
        base_dir.join(format!("store-{}.bin", profile))
    };

    // Build and return the store wrapped in Arc
    Ok(StoreBuilder::new(app, store_path)
        .build()
        .map_err(|e| anyhow::anyhow!(e))?)
}

pub async fn get_profiles_config(app: &AppHandle) -> anyhow::Result<ProfilesConfig> {
    let base_dir = get_base_dir(app, None)?;
    let profiles_path = base_dir.join("profiles.bin");
    let profiles_store = StoreBuilder::new(app, profiles_path).build()?;

    Ok(ProfilesConfig {
        active_profile: profiles_store
            .get("activeProfile")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "default".to_string()),
        profiles: profiles_store
            .get("profiles")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(|| vec!["default".to_string()]),
    })
}
