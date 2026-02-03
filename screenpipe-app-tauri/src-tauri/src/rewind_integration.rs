//! Rewind AI Integration for Tauri
//!
//! Thin wrapper around screenpipe_server::migrations::rewind for Tauri commands.

use screenpipe_db::DatabaseManager;
use screenpipe_server::{MigrationProgress, MigrationState, RewindMigration, RewindScanResult};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{watch, Mutex};

/// State for Rewind migration (managed by Tauri)
pub struct RewindMigrationState {
    pub migration: Mutex<Option<Arc<RewindMigration>>>,
    pub progress_rx: Mutex<Option<watch::Receiver<MigrationProgress>>>,
    pub is_running: AtomicBool,
}

impl Default for RewindMigrationState {
    fn default() -> Self {
        Self {
            migration: Mutex::new(None),
            progress_rx: Mutex::new(None),
            is_running: AtomicBool::new(false),
        }
    }
}

impl RewindMigrationState {
    pub async fn initialize(&self, db: Arc<DatabaseManager>, screenpipe_dir: &std::path::Path) -> anyhow::Result<()> {
        let migration = RewindMigration::new(db, screenpipe_dir).await?;
        let progress_rx = migration.progress_receiver();
        
        *self.migration.lock().await = Some(Arc::new(migration));
        *self.progress_rx.lock().await = Some(progress_rx);
        
        Ok(())
    }

    pub async fn is_available(&self) -> bool {
        if let Some(migration) = self.migration.lock().await.as_ref() {
            migration.is_available()
        } else {
            false
        }
    }

    pub async fn scan(&self) -> anyhow::Result<RewindScanResult> {
        let migration = self.migration.lock().await;
        let migration = migration.as_ref().ok_or_else(|| anyhow::anyhow!("Not initialized"))?;
        migration.scan().await
    }

    pub async fn get_progress(&self) -> MigrationProgress {
        if let Some(rx) = self.progress_rx.lock().await.as_ref() {
            rx.borrow().clone()
        } else {
            MigrationProgress::default()
        }
    }

    pub async fn cancel(&self) {
        if let Some(migration) = self.migration.lock().await.as_ref() {
            migration.cancel();
        }
    }
}

// Re-export types needed by commands
pub use screenpipe_server::{MigrationProgress as Progress, MigrationState as State, RewindScanResult as ScanResult};
