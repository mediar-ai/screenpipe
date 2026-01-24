use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::debug;

use crate::DatabaseManager;

#[derive(Debug, Clone)]
struct ActiveSession {
    id: i64,
    app_name: String,
    window_name: String,
    last_activity: DateTime<Utc>,
}

pub struct SessionTracker {
    db: Arc<DatabaseManager>,
    active_sessions: Arc<Mutex<HashMap<(String, String), ActiveSession>>>,
    inactivity_timeout: Duration,
}

impl SessionTracker {
    pub fn new(db: Arc<DatabaseManager>, inactivity_timeout_secs: i64) -> Self {
        Self {
            db,
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
            inactivity_timeout: Duration::seconds(inactivity_timeout_secs),
        }
    }

    pub async fn process_frame(
        &self,
        frame_id: i64,
        app_name: &str,
        window_name: &str,
        device_name: Option<&str>,
    ) -> Result<i64, sqlx::Error> {
        let key = (app_name.to_string(), window_name.to_string());
        let now = Utc::now();

        let mut sessions = self.active_sessions.lock().await;

        // Check for expired sessions and close them
        let expired: Vec<(String, String)> = sessions
            .iter()
            .filter(|(k, s)| {
                *k != &key && now.signed_duration_since(s.last_activity) > self.inactivity_timeout
            })
            .map(|(k, _)| k.clone())
            .collect();

        for expired_key in expired {
            if let Some(session) = sessions.remove(&expired_key) {
                debug!("Closing inactive session {} for {}:{}", session.id, session.app_name, session.window_name);
                let _ = self.db.end_session(session.id).await;
            }
        }

        let session_id = if let Some(session) = sessions.get_mut(&key) {
            // Check if current session has timed out
            if now.signed_duration_since(session.last_activity) > self.inactivity_timeout {
                // Close old session and create new one
                debug!("Session {} timed out, creating new session", session.id);
                let _ = self.db.end_session(session.id).await;
                let new_id = self.db.create_session(app_name, window_name, device_name).await?;
                session.id = new_id;
                session.last_activity = now;
                new_id
            } else {
                // Update last activity
                session.last_activity = now;
                session.id
            }
        } else {
            // Create new session
            let id = self.db.create_session(app_name, window_name, device_name).await?;
            debug!("Created new session {} for {}:{}", id, app_name, window_name);
            sessions.insert(
                key,
                ActiveSession {
                    id,
                    app_name: app_name.to_string(),
                    window_name: window_name.to_string(),
                    last_activity: now,
                },
            );
            id
        };

        // Update frame with session_id
        self.db.update_frame_session(frame_id, session_id).await?;

        Ok(session_id)
    }

    pub async fn close_all_sessions(&self) -> Result<(), sqlx::Error> {
        let mut sessions = self.active_sessions.lock().await;
        for (_, session) in sessions.drain() {
            let _ = self.db.end_session(session.id).await;
        }
        Ok(())
    }

    pub async fn get_active_session_count(&self) -> usize {
        self.active_sessions.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_session_tracker_creates_new_session() {
        // This test requires a database connection
        // In a real test environment, we'd use a test database
    }
}
