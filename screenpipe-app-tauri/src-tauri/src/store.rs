use super::get_base_dir;
use tauri_plugin_store::StoreBuilder;
use std::sync::Arc;
use tauri::AppHandle;

// Add this new struct to hold profile information
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

// Add this function to manage store access
pub fn get_store(
    app: &AppHandle,
    profile_name: Option<String>,
) -> anyhow::Result<Arc<tauri_plugin_store::Store<tauri::Wry>>> {
    let base_dir = get_base_dir(app, None)?;

    // First, load profiles configuration
    let profiles_path = base_dir.join("profiles.bin");
    let profiles_store = StoreBuilder::new(app, profiles_path.clone()).build()?;

    // Get active profile if none specified
    let profile = match profile_name {
        Some(name) => name,
        None => profiles_store
            .get("activeProfile")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "default".to_string()),
    };

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

// Helper function to get profiles configuration
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
