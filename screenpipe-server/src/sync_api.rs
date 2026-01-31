//! Sync API endpoints for cloud sync operations.
//!
//! These endpoints allow the Tauri app to:
//! - Get pending (unsynced) data for upload
//! - Mark data as synced after upload
//! - Import data from other machines

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use screenpipe_core::sync::{PendingBlob, SyncDataProvider};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tracing::error;

use crate::server::AppState;
use crate::sync_provider::{ScreenpipeSyncProvider, SyncChunk};

/// Request to get pending sync data.
#[derive(Debug, Deserialize)]
pub struct GetPendingRequest {
    /// Type of data to get: "ocr" or "transcripts"
    pub data_type: String,
    /// Maximum number of records to return
    #[serde(default = "default_limit")]
    pub limit: usize,
    /// Machine ID for this device
    pub machine_id: String,
}

fn default_limit() -> usize {
    100
}

/// Response containing pending sync data.
#[derive(Debug, Serialize)]
pub struct GetPendingResponse {
    pub success: bool,
    /// Serialized SyncChunk as JSON
    pub chunk: Option<Value>,
    /// Whether there's more data to sync
    pub has_more: bool,
    /// Count of records in this chunk
    pub record_count: usize,
}

/// Get pending (unsynced) data for upload.
pub async fn get_pending_sync_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<GetPendingRequest>,
) -> Result<Json<GetPendingResponse>, (StatusCode, Json<Value>)> {
    let provider = ScreenpipeSyncProvider::new(state.db.clone(), request.machine_id);

    let blob_type = match request.data_type.as_str() {
        "ocr" => screenpipe_core::sync::BlobType::Ocr,
        "transcripts" => screenpipe_core::sync::BlobType::Transcripts,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid data_type, must be 'ocr' or 'transcripts'"})),
            ));
        }
    };

    match provider.get_pending_data(blob_type, request.limit).await {
        Ok(pending) => {
            let pending: Vec<PendingBlob> = pending;
            if pending.is_empty() {
                return Ok(Json(GetPendingResponse {
                    success: true,
                    chunk: None,
                    has_more: false,
                    record_count: 0,
                }));
            }

            // The pending data is already a serialized SyncChunk
            let blob = &pending[0];
            let chunk: SyncChunk = serde_json::from_slice(&blob.data).map_err(|e| {
                error!("failed to deserialize chunk: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("failed to deserialize: {}", e)})),
                )
            })?;

            let record_count = chunk.frames.len() + chunk.ocr_records.len() + chunk.transcriptions.len();

            Ok(Json(GetPendingResponse {
                success: true,
                chunk: Some(serde_json::to_value(&chunk).unwrap()),
                has_more: pending.len() > 1 || record_count >= request.limit,
                record_count,
            }))
        }
        Err(e) => {
            error!("failed to get pending data: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("failed to get pending data: {}", e)})),
            ))
        }
    }
}

/// Request to mark data as synced.
#[derive(Debug, Deserialize)]
pub struct MarkSyncedRequest {
    /// Type of data: "ocr" or "transcripts"
    pub data_type: String,
    /// Start of time range that was synced
    pub time_start: String,
    /// End of time range that was synced
    pub time_end: String,
    /// Blob ID assigned by cloud
    pub blob_id: String,
    /// Machine ID for this device
    pub machine_id: String,
}

/// Mark data as synced after successful upload.
pub async fn mark_synced(
    State(state): State<Arc<AppState>>,
    Json(request): Json<MarkSyncedRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let provider = ScreenpipeSyncProvider::new(state.db.clone(), request.machine_id);

    let blob_type = match request.data_type.as_str() {
        "ocr" => screenpipe_core::sync::BlobType::Ocr,
        "transcripts" => screenpipe_core::sync::BlobType::Transcripts,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid data_type"})),
            ));
        }
    };

    use screenpipe_core::sync::SyncDataProvider;
    match provider
        .mark_synced(blob_type, &request.time_start, &request.time_end, &request.blob_id)
        .await
    {
        Ok(()) => Ok(Json(json!({"success": true}))),
        Err(e) => {
            error!("failed to mark as synced: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("failed to mark synced: {}", e)})),
            ))
        }
    }
}

/// Request to import synced data from another machine.
#[derive(Debug, Deserialize)]
pub struct ImportChunkRequest {
    /// The SyncChunk data to import
    pub chunk: SyncChunk,
    /// Machine ID for this device (to skip own data)
    pub machine_id: String,
}

/// Response from importing data.
#[derive(Debug, Serialize)]
pub struct ImportChunkResponse {
    pub success: bool,
    pub imported_frames: usize,
    pub imported_ocr: usize,
    pub imported_transcriptions: usize,
    pub skipped: usize,
}

/// Import synced data from another machine.
pub async fn import_chunk(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ImportChunkRequest>,
) -> Result<Json<ImportChunkResponse>, (StatusCode, Json<Value>)> {
    let provider = ScreenpipeSyncProvider::new(state.db.clone(), request.machine_id);

    match provider.import_chunk(&request.chunk).await {
        Ok(result) => Ok(Json(ImportChunkResponse {
            success: true,
            imported_frames: result.imported_frames,
            imported_ocr: result.imported_ocr,
            imported_transcriptions: result.imported_transcriptions,
            skipped: result.skipped,
        })),
        Err(e) => {
            error!("failed to import chunk: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("failed to import: {}", e)})),
            ))
        }
    }
}
