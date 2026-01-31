//! Background sync service for automatic data synchronization.
//!
//! This module provides a background service that periodically syncs
//! local data to the cloud.

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use tokio::time::interval;

use super::blob::BlobType;
use super::error::{SyncError, SyncResult};
use super::manager::SyncManager;

/// Configuration for the sync service.
#[derive(Debug, Clone)]
pub struct SyncServiceConfig {
    /// Whether sync is enabled
    pub enabled: bool,
    /// Interval between sync attempts (in seconds)
    pub sync_interval_secs: u64,
    /// Types of data to sync
    pub sync_types: Vec<BlobType>,
    /// Maximum blobs to upload per sync cycle
    pub max_blobs_per_cycle: usize,
    /// Whether to sync on startup
    pub sync_on_startup: bool,
}

impl Default for SyncServiceConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            sync_interval_secs: 300, // 5 minutes
            sync_types: vec![BlobType::Transcripts, BlobType::Ocr],
            max_blobs_per_cycle: 10,
            sync_on_startup: true,
        }
    }
}

/// Events emitted by the sync service.
#[derive(Debug, Clone)]
pub enum SyncEvent {
    /// Sync cycle started
    Started,
    /// Sync cycle completed successfully
    Completed(SyncReport),
    /// Sync cycle failed
    Failed(String),
    /// Upload progress
    Progress {
        uploaded: usize,
        total: usize,
        bytes_transferred: u64,
    },
    /// Service stopped
    Stopped,
}

/// Report of a completed sync cycle.
#[derive(Debug, Clone)]
pub struct SyncReport {
    /// Number of blobs uploaded
    pub blobs_uploaded: usize,
    /// Total bytes uploaded
    pub bytes_uploaded: u64,
    /// Number of blobs that failed
    pub blobs_failed: usize,
    /// Duration of the sync cycle
    pub duration_secs: f64,
    /// Current storage used
    pub storage_used: u64,
    /// Storage limit
    pub storage_limit: u64,
}

/// Commands for controlling the sync service.
#[derive(Debug)]
pub enum SyncCommand {
    /// Trigger an immediate sync
    SyncNow,
    /// Pause syncing
    Pause,
    /// Resume syncing
    Resume,
    /// Update configuration
    UpdateConfig(SyncServiceConfig),
    /// Stop the service
    Stop,
}

/// Handle for controlling a running sync service.
pub struct SyncServiceHandle {
    command_tx: mpsc::Sender<SyncCommand>,
}

impl SyncServiceHandle {
    /// Trigger an immediate sync.
    pub async fn sync_now(&self) -> SyncResult<()> {
        self.command_tx
            .send(SyncCommand::SyncNow)
            .await
            .map_err(|_| SyncError::Server("sync service not running".to_string()))
    }

    /// Pause syncing.
    pub async fn pause(&self) -> SyncResult<()> {
        self.command_tx
            .send(SyncCommand::Pause)
            .await
            .map_err(|_| SyncError::Server("sync service not running".to_string()))
    }

    /// Resume syncing.
    pub async fn resume(&self) -> SyncResult<()> {
        self.command_tx
            .send(SyncCommand::Resume)
            .await
            .map_err(|_| SyncError::Server("sync service not running".to_string()))
    }

    /// Update configuration.
    pub async fn update_config(&self, config: SyncServiceConfig) -> SyncResult<()> {
        self.command_tx
            .send(SyncCommand::UpdateConfig(config))
            .await
            .map_err(|_| SyncError::Server("sync service not running".to_string()))
    }

    /// Stop the service.
    pub async fn stop(&self) -> SyncResult<()> {
        self.command_tx
            .send(SyncCommand::Stop)
            .await
            .map_err(|_| SyncError::Server("sync service not running".to_string()))
    }
}

/// Trait for providing data to sync.
///
/// Implement this trait to provide data from your local database
/// that should be synced to the cloud.
#[async_trait::async_trait]
pub trait SyncDataProvider: Send + Sync {
    /// Get unsync'd data for the given blob type.
    ///
    /// Returns a list of (data, time_start, time_end, text_content) tuples.
    async fn get_pending_data(
        &self,
        blob_type: BlobType,
        limit: usize,
    ) -> SyncResult<Vec<PendingBlob>>;

    /// Mark data as synced.
    async fn mark_synced(&self, blob_type: BlobType, time_start: &str, time_end: &str, blob_id: &str) -> SyncResult<()>;
}

/// Data pending sync.
#[derive(Debug)]
pub struct PendingBlob {
    /// The data to upload
    pub data: Vec<u8>,
    /// Start of time range
    pub time_start: String,
    /// End of time range
    pub time_end: String,
    /// Optional text content for search indexing
    pub text_content: Option<String>,
}

/// The background sync service.
pub struct SyncService {
    manager: Arc<SyncManager>,
    config: Arc<RwLock<SyncServiceConfig>>,
    data_provider: Arc<dyn SyncDataProvider>,
    paused: Arc<RwLock<bool>>,
}

impl SyncService {
    /// Create a new sync service.
    pub fn new(
        manager: Arc<SyncManager>,
        config: SyncServiceConfig,
        data_provider: Arc<dyn SyncDataProvider>,
    ) -> Self {
        Self {
            manager,
            config: Arc::new(RwLock::new(config)),
            data_provider,
            paused: Arc::new(RwLock::new(false)),
        }
    }

    /// Start the background sync service.
    ///
    /// Returns a handle for controlling the service and a receiver for events.
    pub fn start(self) -> (SyncServiceHandle, mpsc::Receiver<SyncEvent>) {
        let (command_tx, command_rx) = mpsc::channel(16);
        let (event_tx, event_rx) = mpsc::channel(64);

        let handle = SyncServiceHandle { command_tx };

        // Spawn the background task
        tokio::spawn(self.run(command_rx, event_tx));

        (handle, event_rx)
    }

    async fn run(
        self,
        mut command_rx: mpsc::Receiver<SyncCommand>,
        event_tx: mpsc::Sender<SyncEvent>,
    ) {
        let config = self.config.read().await.clone();
        let mut sync_interval = interval(Duration::from_secs(config.sync_interval_secs));

        // Sync on startup if configured
        if config.sync_on_startup && config.enabled {
            if let Err(e) = self.run_sync_cycle(&event_tx).await {
                let _ = event_tx.send(SyncEvent::Failed(e.to_string())).await;
            }
        }

        loop {
            tokio::select! {
                _ = sync_interval.tick() => {
                    let config = self.config.read().await;
                    let paused = *self.paused.read().await;

                    if config.enabled && !paused {
                        drop(config); // Release lock before sync
                        if let Err(e) = self.run_sync_cycle(&event_tx).await {
                            let _ = event_tx.send(SyncEvent::Failed(e.to_string())).await;
                        }
                    }
                }

                Some(command) = command_rx.recv() => {
                    match command {
                        SyncCommand::SyncNow => {
                            if let Err(e) = self.run_sync_cycle(&event_tx).await {
                                let _ = event_tx.send(SyncEvent::Failed(e.to_string())).await;
                            }
                        }
                        SyncCommand::Pause => {
                            *self.paused.write().await = true;
                        }
                        SyncCommand::Resume => {
                            *self.paused.write().await = false;
                        }
                        SyncCommand::UpdateConfig(new_config) => {
                            // Update interval if changed
                            let old_interval = self.config.read().await.sync_interval_secs;
                            if new_config.sync_interval_secs != old_interval {
                                sync_interval = interval(Duration::from_secs(new_config.sync_interval_secs));
                            }
                            *self.config.write().await = new_config;
                        }
                        SyncCommand::Stop => {
                            let _ = event_tx.send(SyncEvent::Stopped).await;
                            break;
                        }
                    }
                }
            }
        }
    }

    async fn run_sync_cycle(&self, event_tx: &mpsc::Sender<SyncEvent>) -> SyncResult<()> {
        let start_time = std::time::Instant::now();

        // Check if manager is initialized
        if !self.manager.is_initialized().await {
            return Err(SyncError::Key("sync not initialized".to_string()));
        }

        let _ = event_tx.send(SyncEvent::Started).await;

        let config = self.config.read().await.clone();
        let mut total_uploaded = 0usize;
        let mut total_bytes = 0u64;
        let mut total_failed = 0usize;
        let mut storage_used = 0u64;
        let mut storage_limit = 0u64;

        for blob_type in &config.sync_types {
            // Get pending data
            let pending = self
                .data_provider
                .get_pending_data(*blob_type, config.max_blobs_per_cycle)
                .await?;

            let total_for_type = pending.len();

            for (idx, blob) in pending.into_iter().enumerate() {
                match self
                    .manager
                    .upload(
                        &blob.data,
                        *blob_type,
                        &blob.time_start,
                        &blob.time_end,
                        blob.text_content.as_deref(),
                    )
                    .await
                {
                    Ok(result) => {
                        total_uploaded += 1;
                        total_bytes += blob.data.len() as u64;
                        storage_used = result.storage_used;
                        storage_limit = result.storage_limit;

                        // Mark as synced
                        if let Err(e) = self
                            .data_provider
                            .mark_synced(*blob_type, &blob.time_start, &blob.time_end, &result.blob_id)
                            .await
                        {
                            tracing::error!("failed to mark blob as synced: {}", e);
                        }

                        // Send progress
                        let _ = event_tx
                            .send(SyncEvent::Progress {
                                uploaded: idx + 1,
                                total: total_for_type,
                                bytes_transferred: total_bytes,
                            })
                            .await;
                    }
                    Err(e) => {
                        tracing::error!("failed to upload blob: {}", e);
                        total_failed += 1;

                        // Check if it's a quota error - stop syncing
                        if matches!(e, SyncError::QuotaExceeded(_)) {
                            return Err(e);
                        }
                    }
                }
            }
        }

        let duration = start_time.elapsed();

        let report = SyncReport {
            blobs_uploaded: total_uploaded,
            bytes_uploaded: total_bytes,
            blobs_failed: total_failed,
            duration_secs: duration.as_secs_f64(),
            storage_used,
            storage_limit,
        };

        let _ = event_tx.send(SyncEvent::Completed(report)).await;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SyncServiceConfig::default();
        assert!(config.enabled);
        assert_eq!(config.sync_interval_secs, 300);
        assert!(!config.sync_types.is_empty());
    }

    #[test]
    fn test_sync_report() {
        let report = SyncReport {
            blobs_uploaded: 5,
            bytes_uploaded: 1024 * 1024,
            blobs_failed: 0,
            duration_secs: 2.5,
            storage_used: 100 * 1024 * 1024,
            storage_limit: 1024 * 1024 * 1024,
        };

        assert_eq!(report.blobs_uploaded, 5);
        assert_eq!(report.bytes_uploaded, 1024 * 1024);
    }
}
