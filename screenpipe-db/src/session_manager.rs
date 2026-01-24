use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::interval;
use tracing::{debug, error, info};

use crate::DatabaseManager;

/// Default inactivity timeout for sessions (5 minutes)
const DEFAULT_INACTIVITY_TIMEOUT_SECS: i64 = 300;

/// Represents an active session being tracked in memory
#[derive(Debug, Clone)]
pub struct ActiveSession {
    pub session_id: i64,
    pub app_name: String,
    pub window_name: String,
    pub device_name: String,
    pub start_time: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

/// Session key for tracking unique app/window combinations
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct SessionKey {
    pub app_name: String,
    pub window_name: String,
}

impl SessionKey {
    pub fn new(app_name: &str, window_name: &str) -> Self {
        Self {
            app_name: app_name.to_string(),
            window_name: window_name.to_string(),
        }
    }
}

/// Manages active sessions and handles automatic session expiration
pub struct SessionManager {
    db: Arc<DatabaseManager>,
    active_sessions: Arc<RwLock<HashMap<SessionKey, ActiveSession>>>,
    inactivity_timeout_secs: i64,
}

impl SessionManager {
    /// Create a new SessionManager
    pub fn new(db: Arc<DatabaseManager>) -> Self {
        Self {
            db,
            active_sessions: Arc::new(RwLock::new(HashMap::new())),
            inactivity_timeout_secs: DEFAULT_INACTIVITY_TIMEOUT_SECS,
        }
    }

    /// Create a new SessionManager with a custom inactivity timeout
    pub fn with_timeout(db: Arc<DatabaseManager>, timeout_secs: i64) -> Self {
        Self {
            db,
            active_sessions: Arc::new(RwLock::new(HashMap::new())),
            inactivity_timeout_secs: timeout_secs,
        }
    }

    /// Get or create a session for the given app/window combination
    /// This should be called when a new frame is captured
    pub async fn get_or_create_session(
        &self,
        app_name: &str,
        window_name: &str,
        device_name: &str,
    ) -> Result<i64, sqlx::Error> {
        let key = SessionKey::new(app_name, window_name);

        // Check if we have an active session in memory
        {
            let mut sessions = self.active_sessions.write().await;
            if let Some(session) = sessions.get_mut(&key) {
                // Update last activity time
                session.last_activity = Utc::now();
                return Ok(session.session_id);
            }
        }

        // No active session in memory, create or get from database
        let session_id = self
            .db
            .get_or_create_session(app_name, window_name, device_name)
            .await?;

        // Add to active sessions
        let session = ActiveSession {
            session_id,
            app_name: app_name.to_string(),
            window_name: window_name.to_string(),
            device_name: device_name.to_string(),
            start_time: Utc::now(),
            last_activity: Utc::now(),
        };

        let mut sessions = self.active_sessions.write().await;
        sessions.insert(key, session);

        debug!(
            "Created/retrieved session {} for app={}, window={}",
            session_id, app_name, window_name
        );

        Ok(session_id)
    }

    /// Update the last activity time for a session
    pub async fn touch_session(&self, app_name: &str, window_name: &str) {
        let key = SessionKey::new(app_name, window_name);
        let mut sessions = self.active_sessions.write().await;
        if let Some(session) = sessions.get_mut(&key) {
            session.last_activity = Utc::now();
        }
    }

    /// End a specific session
    pub async fn end_session(&self, app_name: &str, window_name: &str) -> Result<(), sqlx::Error> {
        let key = SessionKey::new(app_name, window_name);

        let session_id = {
            let mut sessions = self.active_sessions.write().await;
            sessions.remove(&key).map(|s| s.session_id)
        };

        if let Some(id) = session_id {
            self.db.end_session(id).await?;
            info!("Ended session {} for app={}, window={}", id, app_name, window_name);
        }

        Ok(())
    }

    /// Check for and close stale sessions (sessions that have been inactive)
    pub async fn cleanup_stale_sessions(&self) -> Result<u64, sqlx::Error> {
        let now = Utc::now();
        let timeout = chrono::Duration::seconds(self.inactivity_timeout_secs);

        let mut stale_keys = Vec::new();
        let mut stale_ids = Vec::new();

        // Find stale sessions
        {
            let sessions = self.active_sessions.read().await;
            for (key, session) in sessions.iter() {
                if now - session.last_activity > timeout {
                    stale_keys.push(key.clone());
                    stale_ids.push(session.session_id);
                }
            }
        }

        // Remove from memory
        {
            let mut sessions = self.active_sessions.write().await;
            for key in &stale_keys {
                sessions.remove(key);
            }
        }

        // End in database
        let mut ended = 0u64;
        for id in stale_ids {
            if self.db.end_session(id).await.is_ok() {
                ended += 1;
            }
        }

        // Also clean up any stale sessions directly in the database
        // (for sessions that might have been created but not tracked in memory)
        let db_ended = self.db.end_stale_sessions(self.inactivity_timeout_secs).await?;

        if ended > 0 || db_ended > 0 {
            info!("Cleaned up {} in-memory + {} database stale sessions", ended, db_ended);
        }

        Ok(ended + db_ended)
    }

    /// Get the number of active sessions in memory
    pub async fn active_session_count(&self) -> usize {
        self.active_sessions.read().await.len()
    }

    /// Get all active sessions
    pub async fn get_active_sessions(&self) -> Vec<ActiveSession> {
        self.active_sessions.read().await.values().cloned().collect()
    }

    /// Start the background cleanup task that periodically checks for stale sessions
    pub fn start_cleanup_task(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        let cleanup_interval = Duration::from_secs(60); // Check every minute

        tokio::spawn(async move {
            let mut interval = interval(cleanup_interval);
            loop {
                interval.tick().await;
                if let Err(e) = self.cleanup_stale_sessions().await {
                    error!("Error cleaning up stale sessions: {}", e);
                }
            }
        })
    }

    /// End all active sessions (used during shutdown)
    pub async fn end_all_sessions(&self) -> Result<u64, sqlx::Error> {
        let sessions: Vec<_> = {
            let mut sessions = self.active_sessions.write().await;
            let all_sessions: Vec<_> = sessions.drain().collect();
            all_sessions
        };

        let mut ended = 0u64;
        for (_, session) in sessions {
            if self.db.end_session(session.session_id).await.is_ok() {
                ended += 1;
            }
        }

        info!("Ended {} sessions during shutdown", ended);
        Ok(ended)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_key() {
        let key1 = SessionKey::new("app1", "window1");
        let key2 = SessionKey::new("app1", "window1");
        let key3 = SessionKey::new("app1", "window2");

        assert_eq!(key1, key2);
        assert_ne!(key1, key3);
    }
}
