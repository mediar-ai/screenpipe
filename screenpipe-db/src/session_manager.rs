use chrono::Utc;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Mutex;
use tracing::debug;

#[derive(Debug, Clone, PartialEq)]
struct SessionContext {
    device_name: String,
    app_name: String,
    window_name: String,
}

#[derive(Debug)]
struct ActiveSession {
    id: i64,
    context: SessionContext,
}

// SessionManager lives in the db layer to keep session state close to persistence logic
// and allow transactional session creation/closure alongside data insertion
pub struct SessionManager {
    pool: SqlitePool,
    active_sessions: Mutex<HashMap<String, ActiveSession>>,
}

impl SessionManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            active_sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Get or create a session for the given context.
    /// Returns the session_id.
    /// If the context changed (different app/window), closes the old session and creates a new one.
    pub async fn ensure_session(
        &self,
        device_name: &str,
        app_name: &str,
        window_name: &str,
    ) -> Result<i64, sqlx::Error> {
        let new_context = SessionContext {
            device_name: device_name.to_string(),
            app_name: app_name.to_string(),
            window_name: window_name.to_string(),
        };

        let mut sessions = self.active_sessions.lock().unwrap();

        // Check if we have an active session for this device
        if let Some(active) = sessions.get(device_name) {
            // If context matches, return the existing session
            if active.context == new_context {
                return Ok(active.id);
            }

            // Context changed - close the old session
            debug!(
                "Session context changed for device '{}': {:?} -> {:?}",
                device_name, active.context, new_context
            );
            self.close_session_internal(active.id).await?;
        }

        // Create a new session
        let session_id = self.create_session_internal(&new_context).await?;

        sessions.insert(
            device_name.to_string(),
            ActiveSession {
                id: session_id,
                context: new_context,
            },
        );

        Ok(session_id)
    }

    /// Create a new session in the database
    async fn create_session_internal(&self, context: &SessionContext) -> Result<i64, sqlx::Error> {
        let now = Utc::now();
        let id = sqlx::query(
            "INSERT INTO sessions (device_name, app_name, window_name, start_time) VALUES (?1, ?2, ?3, ?4)"
        )
        .bind(&context.device_name)
        .bind(&context.app_name)
        .bind(&context.window_name)
        .bind(now)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();

        debug!(
            "Created session {} for device '{}', app '{}', window '{}'",
            id, context.device_name, context.app_name, context.window_name
        );

        Ok(id)
    }

    /// Close a session by setting its end_time
    async fn close_session_internal(&self, session_id: i64) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query("UPDATE sessions SET end_time = ?1 WHERE id = ?2")
            .bind(now)
            .bind(session_id)
            .execute(&self.pool)
            .await?;

        debug!("Closed session {}", session_id);
        Ok(())
    }
}
