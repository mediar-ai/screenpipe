//! Sync API endpoints for cloud sync operations.
//!
//! These endpoints allow the Tauri app to:
//! - Initialize sync at runtime with credentials
//! - Trigger sync and check status
//! - Download and import data from other devices

use axum::{extract::State, http::StatusCode, Json};
use screenpipe_core::sync::{
    BlobType, SyncClientConfig, SyncManager, SyncService, SyncServiceConfig, SyncServiceHandle,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

use crate::server::AppState;
use crate::sync_provider::ScreenpipeSyncProvider;
pub use crate::sync_provider::SyncChunk;

// ============================================================================
// Runtime Sync State
// ============================================================================

/// Runtime sync state that can be initialized after server startup.
pub struct SyncRuntimeState {
    /// The sync manager for API operations
    pub manager: Arc<SyncManager>,
    /// The sync service handle for triggering syncs
    pub service_handle: SyncServiceHandle,
    /// Machine ID for this device
    pub machine_id: String,
    /// Whether sync is currently in progress
    pub is_syncing: Arc<RwLock<bool>>,
    /// Last sync timestamp
    pub last_sync: Arc<RwLock<Option<String>>>,
    /// Last sync error
    pub last_error: Arc<RwLock<Option<String>>>,
}

/// Thread-safe container for optional runtime sync state
pub type SyncState = Arc<RwLock<Option<SyncRuntimeState>>>;

/// Create a new empty sync state container
pub fn new_sync_state() -> SyncState {
    Arc::new(RwLock::new(None))
}

// ============================================================================
// Runtime Sync Initialization & Control Endpoints
// ============================================================================

/// Request to initialize sync at runtime.
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncInitRequest {
    /// API token for cloud authentication
    pub token: String,
    /// Password for encryption key derivation
    pub password: String,
    /// Machine ID for this device (optional, will be generated if not provided)
    pub machine_id: Option<String>,
    /// Sync interval in seconds (optional, defaults to 300)
    pub sync_interval_secs: Option<u64>,
}

/// Response from sync initialization.
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncInitResponse {
    pub success: bool,
    pub is_new_user: bool,
    pub machine_id: String,
}

/// Initialize sync at runtime with credentials.
pub async fn sync_init(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SyncInitRequest>,
) -> Result<Json<SyncInitResponse>, (StatusCode, Json<Value>)> {
    // Check if already initialized
    {
        let sync_state = state.sync_state.read().await;
        if sync_state.is_some() {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({"error": "sync already initialized"})),
            ));
        }
    }

    // Generate or use provided machine ID
    let machine_id = request.machine_id.unwrap_or_else(|| {
        if let Ok(hostname) = hostname::get() {
            let hostname_str = hostname.to_string_lossy();
            format!("{:x}", md5::compute(hostname_str.as_bytes()))
        } else {
            uuid::Uuid::new_v4().to_string()
        }
    });

    // Get device info
    let device_name = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());
    let device_os = std::env::consts::OS.to_string();

    // Create sync manager
    let config = SyncClientConfig::new(
        request.token.clone(),
        machine_id.clone(),
        device_name,
        device_os,
    );

    let manager = SyncManager::new(config).map_err(|e| {
        error!("failed to create sync manager: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("failed to create sync manager: {}", e)})),
        )
    })?;

    // Initialize with password
    let is_new_user = manager.initialize(&request.password).await.map_err(|e| {
        error!("failed to initialize sync: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("failed to initialize sync: {}", e)})),
        )
    })?;

    let manager = Arc::new(manager);

    // Create sync data provider
    let provider = Arc::new(ScreenpipeSyncProvider::new(
        state.db.clone(),
        machine_id.clone(),
    ));

    // Create sync service config
    let service_config = SyncServiceConfig {
        enabled: true,
        sync_interval_secs: request.sync_interval_secs.unwrap_or(300),
        sync_types: vec![BlobType::Ocr, BlobType::Transcripts],
        max_blobs_per_cycle: 10,
        sync_on_startup: true,
    };

    // Create and start service
    let service = SyncService::new(manager.clone(), service_config, provider);
    let (handle, mut event_rx) = service.start();

    info!(
        "sync initialized for {} user, machine_id: {}",
        if is_new_user { "new" } else { "existing" },
        machine_id
    );

    // Create runtime state
    let runtime_state = SyncRuntimeState {
        manager,
        service_handle: handle,
        machine_id: machine_id.clone(),
        is_syncing: Arc::new(RwLock::new(false)),
        last_sync: Arc::new(RwLock::new(None)),
        last_error: Arc::new(RwLock::new(None)),
    };

    // Spawn event handler
    let is_syncing = runtime_state.is_syncing.clone();
    let last_sync = runtime_state.last_sync.clone();
    let last_error = runtime_state.last_error.clone();
    let sync_manager_for_events = runtime_state.manager.clone();
    let sync_provider_for_events = Arc::new(ScreenpipeSyncProvider::new(
        state.db.clone(),
        machine_id.clone(),
    ));

    tokio::spawn(async move {
        use screenpipe_core::sync::SyncEvent;
        while let Some(event) = event_rx.recv().await {
            match event {
                SyncEvent::Started => {
                    info!("sync cycle started");
                    *is_syncing.write().await = true;
                }
                SyncEvent::Completed(report) => {
                    info!(
                        "sync cycle completed: {} blobs uploaded ({} bytes) in {:.2}s",
                        report.blobs_uploaded, report.bytes_uploaded, report.duration_secs
                    );
                    *last_sync.write().await = Some(chrono::Utc::now().to_rfc3339());
                    *last_error.write().await = None;

                    // Auto-download from other devices after upload
                    let end = chrono::Utc::now();
                    let start = end - chrono::Duration::hours(24);
                    match sync_manager_for_events.download_by_time_range(
                        Some(start.to_rfc3339()),
                        Some(end.to_rfc3339()),
                        None,
                        Some(100),
                    ).await {
                        Ok(blobs) if !blobs.is_empty() => {
                            info!("downloaded {} blobs from other devices", blobs.len());
                            let mut imported = 0;
                            for blob in blobs {
                                let chunk: Result<crate::sync_provider::SyncChunk, _> = serde_json::from_slice(&blob.data);
                                match chunk {
                                    Ok(chunk) => {
                                        match sync_provider_for_events.import_chunk(&chunk).await {
                                            Ok(result) => {
                                                imported += result.imported_frames + result.imported_ocr + result.imported_transcriptions + result.imported_accessibility + result.imported_ui_events;
                                            }
                                            Err(e) => error!("failed to import chunk: {}", e),
                                        }
                                    }
                                    Err(e) => error!("failed to deserialize chunk: {}", e),
                                }
                            }
                            info!("imported {} records from other devices", imported);
                        }
                        Ok(_) => info!("no new blobs from other devices"),
                        Err(e) => warn!("download from other devices failed: {}", e),
                    }

                    *is_syncing.write().await = false;
                }
                SyncEvent::Failed(err) => {
                    error!("sync cycle failed: {}", err);
                    *is_syncing.write().await = false;
                    *last_error.write().await = Some(err);
                }
                SyncEvent::Progress {
                    uploaded,
                    total,
                    bytes_transferred,
                } => {
                    debug!(
                        "sync progress: {}/{} blobs, {} bytes",
                        uploaded, total, bytes_transferred
                    );
                }
                SyncEvent::Stopped => {
                    info!("sync service stopped");
                    break;
                }
            }
        }
    });

    // Store in app state
    *state.sync_state.write().await = Some(runtime_state);

    Ok(Json(SyncInitResponse {
        success: true,
        is_new_user,
        machine_id,
    }))
}

/// Response for sync status.
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStatusResponse {
    pub enabled: bool,
    pub is_syncing: bool,
    pub last_sync: Option<String>,
    pub last_error: Option<String>,
    pub machine_id: Option<String>,
}

/// Get current sync status.
pub async fn sync_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SyncStatusResponse>, (StatusCode, Json<Value>)> {
    let sync_state = state.sync_state.read().await;

    match sync_state.as_ref() {
        Some(runtime) => {
            let is_syncing = *runtime.is_syncing.read().await;
            let last_sync = runtime.last_sync.read().await.clone();
            let last_error = runtime.last_error.read().await.clone();

            Ok(Json(SyncStatusResponse {
                enabled: true,
                is_syncing,
                last_sync,
                last_error,
                machine_id: Some(runtime.machine_id.clone()),
            }))
        }
        None => Ok(Json(SyncStatusResponse {
            enabled: false,
            is_syncing: false,
            last_sync: None,
            last_error: None,
            machine_id: None,
        })),
    }
}

/// Trigger an immediate sync.
pub async fn sync_trigger(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let sync_state = state.sync_state.read().await;

    match sync_state.as_ref() {
        Some(runtime) => {
            runtime.service_handle.sync_now().await.map_err(|e| {
                error!("failed to trigger sync: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("failed to trigger sync: {}", e)})),
                )
            })?;
            Ok(Json(json!({"success": true, "message": "sync triggered"})))
        }
        None => Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "sync not initialized"})),
        )),
    }
}

/// Lock sync (stop service and clear state).
pub async fn sync_lock(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut sync_state = state.sync_state.write().await;

    match sync_state.take() {
        Some(runtime) => {
            // Stop the service
            if let Err(e) = runtime.service_handle.stop().await {
                error!("failed to stop sync service: {}", e);
            }
            // Lock the manager (clear keys from memory)
            runtime.manager.lock().await;
            info!("sync locked and service stopped");
            Ok(Json(json!({"success": true, "message": "sync locked"})))
        }
        None => Ok(Json(
            json!({"success": true, "message": "sync was not initialized"}),
        )),
    }
}

/// Request to download data from other devices.
#[derive(Debug, Deserialize)]
pub struct SyncDownloadRequest {
    /// Time range in hours to download (default: 24)
    #[serde(default = "default_hours")]
    pub hours: u32,
}

fn default_hours() -> u32 {
    24
}

/// Response from download operation.
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncDownloadResponse {
    pub success: bool,
    pub blobs_downloaded: usize,
    pub records_imported: usize,
}

/// Download and import data from other devices.
pub async fn sync_download(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SyncDownloadRequest>,
) -> Result<Json<SyncDownloadResponse>, (StatusCode, Json<Value>)> {
    let sync_state = state.sync_state.read().await;

    let runtime = sync_state.as_ref().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "sync not initialized"})),
        )
    })?;

    // Calculate time range
    let end = chrono::Utc::now();
    let start = end - chrono::Duration::hours(request.hours as i64);

    // Download blobs from cloud
    let blobs = runtime
        .manager
        .download_by_time_range(
            Some(start.to_rfc3339()),
            Some(end.to_rfc3339()),
            None,
            Some(100),
        )
        .await
        .map_err(|e| {
            error!("failed to download blobs: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("failed to download: {}", e)})),
            )
        })?;

    let blobs_downloaded = blobs.len();
    let mut records_imported = 0;

    // Import each blob
    let provider = ScreenpipeSyncProvider::new(state.db.clone(), runtime.machine_id.clone());

    for blob in blobs {
        // Deserialize the chunk
        let chunk: SyncChunk = serde_json::from_slice(&blob.data).map_err(|e| {
            error!("failed to deserialize chunk: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("failed to deserialize chunk: {}", e)})),
            )
        })?;

        // Import it
        match provider.import_chunk(&chunk).await {
            Ok(result) => {
                records_imported += result.imported_frames
                    + result.imported_ocr
                    + result.imported_transcriptions
                    + result.imported_accessibility
                    + result.imported_ui_events;
            }
            Err(e) => {
                error!("failed to import chunk: {}", e);
                // Continue with other chunks
            }
        }
    }

    info!(
        "sync download complete: {} blobs, {} records imported",
        blobs_downloaded, records_imported
    );

    Ok(Json(SyncDownloadResponse {
        success: true,
        blobs_downloaded,
        records_imported,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_sync_state() {
        let state = new_sync_state();
        // Should be empty initially
        let guard = state.try_read().unwrap();
        assert!(guard.is_none());
    }

    #[test]
    fn test_sync_init_request_serialization() {
        let request = SyncInitRequest {
            token: "test-token".to_string(),
            password: "test-password".to_string(),
            machine_id: Some("test-machine".to_string()),
            sync_interval_secs: Some(300),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("test-token"));
        assert!(json.contains("test-machine"));
    }

    #[test]
    fn test_sync_status_response_serialization() {
        let response = SyncStatusResponse {
            enabled: true,
            is_syncing: false,
            last_sync: Some("2024-01-28T14:00:00Z".to_string()),
            last_error: None,
            machine_id: Some("test-machine".to_string()),
        };

        let json = serde_json::to_string(&response).unwrap();
        let parsed: SyncStatusResponse = serde_json::from_str(&json).unwrap();

        assert!(parsed.enabled);
        assert!(!parsed.is_syncing);
        assert_eq!(parsed.machine_id, Some("test-machine".to_string()));
    }

    #[test]
    fn test_sync_download_request_defaults() {
        let json = r#"{}"#;
        let request: SyncDownloadRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.hours, 24); // Default value
    }

    #[test]
    fn test_sync_init_response_serialization() {
        let response = SyncInitResponse {
            success: true,
            is_new_user: false,
            machine_id: "abc123".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("abc123"));
        assert!(json.contains("\"success\":true"));
    }

    #[test]
    fn test_sync_download_response_serialization() {
        let response = SyncDownloadResponse {
            success: true,
            blobs_downloaded: 5,
            records_imported: 100,
        };

        let json = serde_json::to_string(&response).unwrap();
        let parsed: SyncDownloadResponse = serde_json::from_str(&json).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.blobs_downloaded, 5);
        assert_eq!(parsed.records_imported, 100);
    }
}
