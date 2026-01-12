use anyhow::Result;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::DatabaseManager;

const SESSION_TIMEOUT_SECS: i64 = 300; // 5 minutes configurable?

pub struct SessionManager {
    db: Arc<DatabaseManager>,
    active_sessions: Arc<Mutex<HashMap<(String, String), (i64, DateTime<Utc>)>>>,
    focused_session: Arc<Mutex<Option<i64>>>,
}

impl SessionManager {
    pub fn new(db: Arc<DatabaseManager>) -> Self {
        Self {
            db,
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
            focused_session: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn handle_activity(
        &self,
        app_name: &str,
        window_name: &str,
        timestamp: DateTime<Utc>,
        focused: bool,
    ) -> Result<i64> {
        let key = (app_name.to_string(), window_name.to_string());
        let mut sessions = self.active_sessions.lock().await;

        let session_id = if let Some((session_id, last_activity)) = sessions.get(&key) {
            let duration_since_last = timestamp.signed_duration_since(*last_activity).num_seconds();

            if duration_since_last < SESSION_TIMEOUT_SECS {
                let id = *session_id;
                self.db.update_session(id, timestamp).await?;
                sessions.insert(key, (id, timestamp));
                id
            } else {
                let id = self
                    .db
                    .insert_session(app_name, window_name, timestamp, timestamp)
                    .await?;
                sessions.insert(key, (id, timestamp));
                id
            }
        } else {
            let id = self
                .db
                .insert_session(app_name, window_name, timestamp, timestamp)
                .await?;
            sessions.insert(key, (id, timestamp));
            id
        };

        if focused {
            let mut focused_session = self.focused_session.lock().await;
            *focused_session = Some(session_id);
        }

        Ok(session_id)
    }

    pub async fn get_focused_session(&self) -> Option<i64> {
        *self.focused_session.lock().await
    }
}
