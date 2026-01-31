//! Tauri commands for cloud sync operations.

use crate::store::SettingsStore;
use chrono::Utc;
use screenpipe_core::sync::{SyncClientConfig, SyncManager};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::RwLock;
use tracing::{debug, info};
use uuid::Uuid;

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
    /// Sync manager (initialized after password entry)
    pub manager: Arc<RwLock<Option<Arc<SyncManager>>>>,
    /// Machine ID for this device
    pub machine_id: String,
}

impl Default for SyncState {
    fn default() -> Self {
        // Generate or load machine ID
        let machine_id = get_or_create_machine_id();

        Self {
            enabled: Arc::new(RwLock::new(false)),
            is_syncing: Arc::new(RwLock::new(false)),
            last_sync: Arc::new(RwLock::new(None)),
            last_error: Arc::new(RwLock::new(None)),
            manager: Arc::new(RwLock::new(None)),
            machine_id,
        }
    }
}

/// Get or create a persistent machine ID
fn get_or_create_machine_id() -> String {
    // In a real implementation, this would be stored persistently
    // For now, use a hash of the hostname
    if let Ok(hostname) = hostname::get() {
        let hostname_str = hostname.to_string_lossy();
        format!("{:x}", md5::compute(hostname_str.as_bytes()))
    } else {
        Uuid::new_v4().to_string()
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
    pub machine_id: String,
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
pub async fn get_sync_status(
    state: State<'_, SyncState>,
    _settings: State<'_, SettingsStore>,
) -> Result<SyncStatusResponse, String> {
    let enabled = *state.enabled.read().await;
    let is_syncing = *state.is_syncing.read().await;
    let last_sync = state.last_sync.read().await.clone();
    let last_error = state.last_error.read().await.clone();

    // Try to get real status from API if we have a manager
    let manager_guard = state.manager.read().await;
    if let Some(manager) = manager_guard.as_ref() {
        match manager.get_status().await {
            Ok(status) => {
                return Ok(SyncStatusResponse {
                    enabled,
                    is_syncing,
                    last_sync,
                    last_error,
                    storage_used: Some(status.quota.storage_used),
                    storage_limit: Some(status.quota.storage_limit),
                    device_count: Some(status.quota.device_count),
                    device_limit: Some(status.quota.device_limit),
                    sync_tier: status.quota.sync_tier,
                    machine_id: state.machine_id.clone(),
                });
            }
            Err(e) => {
                debug!("failed to get sync status from API: {}", e);
            }
        }
    }

    Ok(SyncStatusResponse {
        enabled,
        is_syncing,
        last_sync,
        last_error,
        storage_used: None,
        storage_limit: None,
        device_count: None,
        device_limit: None,
        sync_tier: None,
        machine_id: state.machine_id.clone(),
    })
}

/// Enable or disable sync.
#[tauri::command]
#[specta::specta]
pub async fn set_sync_enabled(state: State<'_, SyncState>, enabled: bool) -> Result<(), String> {
    *state.enabled.write().await = enabled;

    if !enabled {
        // Lock the manager when disabling
        let manager_guard = state.manager.read().await;
        if let Some(manager) = manager_guard.as_ref() {
            manager.lock().await;
        }
    }

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

    let manager_guard = state.manager.read().await;
    if manager_guard.is_none() {
        return Err("sync not initialized - enter password first".to_string());
    }

    // Mark as syncing
    *state.is_syncing.write().await = true;

    // TODO: Trigger actual sync via SyncService
    // For now, simulate completion
    let is_syncing = state.is_syncing.clone();
    let last_sync = state.last_sync.clone();
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        *is_syncing.write().await = false;
        *last_sync.write().await = Some(Utc::now().to_rfc3339());
    });

    Ok(())
}

/// Get sync configuration.
#[tauri::command]
#[specta::specta]
pub async fn get_sync_config() -> Result<SyncConfig, String> {
    // TODO: Read from persistent storage
    Ok(SyncConfig::default())
}

/// Update sync configuration.
#[tauri::command]
#[specta::specta]
pub async fn update_sync_config(state: State<'_, SyncState>, config: SyncConfig) -> Result<(), String> {
    *state.enabled.write().await = config.enabled;
    // TODO: Persist config and update sync service
    Ok(())
}

/// Get list of registered devices.
#[tauri::command]
#[specta::specta]
pub async fn get_sync_devices(state: State<'_, SyncState>) -> Result<Vec<SyncDeviceInfo>, String> {
    let manager_guard = state.manager.read().await;
    if let Some(manager) = manager_guard.as_ref() {
        match manager.get_devices().await {
            Ok(devices) => {
                return Ok(devices
                    .into_iter()
                    .map(|d| SyncDeviceInfo {
                        id: d.id,
                        device_id: d.device_id.clone(),
                        device_name: d.device_name,
                        device_os: d.device_os,
                        last_sync_at: d.last_sync_at,
                        created_at: d.created_at,
                        is_current: d.device_id == state.machine_id,
                    })
                    .collect());
            }
            Err(e) => {
                return Err(format!("failed to get devices: {}", e));
            }
        }
    }

    Ok(vec![])
}

/// Remove a device from sync.
#[tauri::command]
#[specta::specta]
pub async fn remove_sync_device(
    state: State<'_, SyncState>,
    device_id: String,
) -> Result<(), String> {
    let manager_guard = state.manager.read().await;
    if let Some(manager) = manager_guard.as_ref() {
        manager
            .remove_device(&device_id)
            .await
            .map_err(|e| format!("failed to remove device: {}", e))?;
    }
    Ok(())
}

/// Initialize sync with password.
#[tauri::command]
#[specta::specta]
pub async fn init_sync(
    _app: AppHandle,
    state: State<'_, SyncState>,
    settings: State<'_, SettingsStore>,
    password: String,
) -> Result<bool, String> {
    // Get auth token from settings
    let token = settings
        .user
        .token
        .clone()
        .ok_or_else(|| "not logged in - please log in first".to_string())?;

    // Get device info
    let device_name = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    let device_os = std::env::consts::OS.to_string();

    // Create sync client config
    let config = SyncClientConfig::new(token, state.machine_id.clone(), device_name, device_os);

    // Create sync manager
    let manager = SyncManager::new(config).map_err(|e| format!("failed to create sync manager: {}", e))?;

    // Initialize with password (this will either create new keys or derive from existing)
    let is_new_user = manager
        .initialize(&password)
        .await
        .map_err(|e| format!("failed to initialize sync: {}", e))?;

    // Store the manager
    *state.manager.write().await = Some(Arc::new(manager));
    *state.enabled.write().await = true;

    info!(
        "sync initialized for {} user",
        if is_new_user { "new" } else { "existing" }
    );

    Ok(is_new_user)
}

/// Lock sync (clear keys from memory).
#[tauri::command]
#[specta::specta]
pub async fn lock_sync(state: State<'_, SyncState>) -> Result<(), String> {
    let manager_guard = state.manager.read().await;
    if let Some(manager) = manager_guard.as_ref() {
        manager.lock().await;
    }
    *state.enabled.write().await = false;
    Ok(())
}

/// Delete all cloud data.
#[tauri::command]
#[specta::specta]
pub async fn delete_cloud_data(state: State<'_, SyncState>) -> Result<(), String> {
    let manager_guard = state.manager.read().await;
    if let Some(manager) = manager_guard.as_ref() {
        manager
            .delete_all_data()
            .await
            .map_err(|e| format!("failed to delete cloud data: {}", e))?;
    }
    Ok(())
}
