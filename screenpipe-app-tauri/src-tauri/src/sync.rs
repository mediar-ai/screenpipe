//! Tauri commands for cloud sync operations.

use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Sync state managed by Tauri.
pub struct SyncState {
    /// Whether sync is enabled
    pub enabled: Arc<RwLock<bool>>,
    /// Whether currently syncing
    pub is_syncing: Arc<RwLock<bool>>,
    /// Last sync timestamp
    pub last_sync: Arc<RwLock<Option<String>>>,
    /// Last sync error
    pub last_error: Arc<RwLock<Option<String>>>,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            enabled: Arc::new(RwLock::new(false)),
            is_syncing: Arc::new(RwLock::new(false)),
            last_sync: Arc::new(RwLock::new(None)),
            last_error: Arc::new(RwLock::new(None)),
        }
    }
}

/// Sync status response.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusResponse {
    pub enabled: bool,
    pub is_syncing: bool,
    pub last_sync: Option<String>,
    pub last_error: Option<String>,
    pub storage_used: Option<u64>,
    pub storage_limit: Option<u64>,
    pub device_count: Option<u32>,
    pub device_limit: Option<u32>,
    pub sync_tier: Option<String>,
}

/// Device information.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncDeviceInfo {
    pub id: String,
    pub device_id: String,
    pub device_name: Option<String>,
    pub device_os: String,
    pub last_sync_at: Option<String>,
    pub created_at: String,
    pub is_current: bool,
}

/// Sync configuration.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub enabled: bool,
    pub sync_interval_minutes: u32,
    pub sync_transcripts: bool,
    pub sync_ocr: bool,
    pub sync_audio: bool,
    pub sync_frames: bool,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            sync_interval_minutes: 5,
            sync_transcripts: true,
            sync_ocr: true,
            sync_audio: false,
            sync_frames: false,
        }
    }
}

/// Get current sync status.
#[tauri::command]
#[specta::specta]
pub async fn get_sync_status(state: State<'_, SyncState>) -> Result<SyncStatusResponse, String> {
    let enabled = *state.enabled.read().await;
    let is_syncing = *state.is_syncing.read().await;
    let last_sync = state.last_sync.read().await.clone();
    let last_error = state.last_error.read().await.clone();

    Ok(SyncStatusResponse {
        enabled,
        is_syncing,
        last_sync,
        last_error,
        // These would be fetched from the API in a real implementation
        storage_used: None,
        storage_limit: None,
        device_count: None,
        device_limit: None,
        sync_tier: None,
    })
}

/// Enable or disable sync.
#[tauri::command]
#[specta::specta]
pub async fn set_sync_enabled(
    state: State<'_, SyncState>,
    enabled: bool,
) -> Result<(), String> {
    *state.enabled.write().await = enabled;
    Ok(())
}

/// Trigger an immediate sync.
#[tauri::command]
#[specta::specta]
pub async fn trigger_sync(state: State<'_, SyncState>) -> Result<(), String> {
    let enabled = *state.enabled.read().await;
    if !enabled {
        return Err("sync is not enabled".to_string());
    }

    let is_syncing = *state.is_syncing.read().await;
    if is_syncing {
        return Err("sync already in progress".to_string());
    }

    // In a real implementation, this would trigger the sync service
    *state.is_syncing.write().await = true;

    // Simulate sync completion (in real impl, this would be handled by the service)
    tokio::spawn({
        let is_syncing = state.is_syncing.clone();
        let last_sync = state.last_sync.clone();
        async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            *is_syncing.write().await = false;
            *last_sync.write().await = Some(chrono::Utc::now().to_rfc3339());
        }
    });

    Ok(())
}

/// Get sync configuration.
#[tauri::command]
#[specta::specta]
pub async fn get_sync_config() -> Result<SyncConfig, String> {
    // In a real implementation, this would read from persistent storage
    Ok(SyncConfig::default())
}

/// Update sync configuration.
#[tauri::command]
#[specta::specta]
pub async fn update_sync_config(
    state: State<'_, SyncState>,
    config: SyncConfig,
) -> Result<(), String> {
    *state.enabled.write().await = config.enabled;
    // In a real implementation, this would persist the config and update the service
    Ok(())
}

/// Get list of registered devices.
#[tauri::command]
#[specta::specta]
pub async fn get_sync_devices() -> Result<Vec<SyncDeviceInfo>, String> {
    // In a real implementation, this would call the API
    Ok(vec![])
}

/// Remove a device from sync.
#[tauri::command]
#[specta::specta]
pub async fn remove_sync_device(_device_id: String) -> Result<(), String> {
    // In a real implementation, this would call the API
    Ok(())
}

/// Initialize sync with password.
#[tauri::command]
#[specta::specta]
pub async fn init_sync(
    state: State<'_, SyncState>,
    _password: String,
) -> Result<bool, String> {
    // In a real implementation, this would:
    // 1. Call the sync API to initialize
    // 2. Store the encrypted keys locally
    // 3. Start the sync service

    *state.enabled.write().await = true;

    // Return true if new user, false if existing
    Ok(true)
}

/// Lock sync (clear keys from memory).
#[tauri::command]
#[specta::specta]
pub async fn lock_sync(state: State<'_, SyncState>) -> Result<(), String> {
    *state.enabled.write().await = false;
    Ok(())
}

/// Delete all cloud data.
#[tauri::command]
#[specta::specta]
pub async fn delete_cloud_data() -> Result<(), String> {
    // In a real implementation, this would call the API to delete all data
    Ok(())
}
