//! UI Events API endpoints
//!
//! Provides REST API endpoints for querying UI events (clicks, keystrokes, etc.)

use chrono::{DateTime, Utc};
use screenpipe_db::{DatabaseManager, UiEventRecord};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::error;

/// Query parameters for UI events search
#[derive(Debug, Deserialize)]
pub struct UiEventsQuery {
    /// Search query (text content, app name, etc.)
    #[serde(default)]
    pub q: Option<String>,
    /// Filter by event type (click, text, scroll, key, app_switch, window_focus, clipboard)
    #[serde(default)]
    pub event_type: Option<String>,
    /// Filter by app name
    #[serde(default)]
    pub app_name: Option<String>,
    /// Filter by window title
    #[serde(default)]
    pub window_name: Option<String>,
    /// Start time (ISO 8601)
    #[serde(default)]
    pub start_time: Option<DateTime<Utc>>,
    /// End time (ISO 8601)
    #[serde(default)]
    pub end_time: Option<DateTime<Utc>>,
    /// Maximum number of results (default 50)
    #[serde(default = "default_limit")]
    pub limit: u32,
    /// Offset for pagination (default 0)
    #[serde(default)]
    pub offset: u32,
}

fn default_limit() -> u32 {
    50
}

/// UI Events response
#[derive(Debug, Serialize)]
pub struct UiEventsResponse {
    pub data: Vec<UiEventRecord>,
    pub pagination: PaginationInfo,
}

#[derive(Debug, Serialize)]
pub struct PaginationInfo {
    pub limit: u32,
    pub offset: u32,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct UiEventStats {
    pub app_name: String,
    pub event_type: String,
    pub count: i64,
}

/// Search UI events handler - called from main server router
pub async fn search_ui_events_handler(
    db: Arc<DatabaseManager>,
    params: UiEventsQuery,
) -> Result<UiEventsResponse, String> {
    match db
        .search_ui_events(
            params.q.as_deref(),
            params.event_type.as_deref(),
            params.app_name.as_deref(),
            params.window_name.as_deref(),
            params.start_time,
            params.end_time,
            params.limit,
            params.offset,
        )
        .await
    {
        Ok(events) => {
            let count = events.len();
            Ok(UiEventsResponse {
                data: events,
                pagination: PaginationInfo {
                    limit: params.limit,
                    offset: params.offset,
                    total: count,
                },
            })
        }
        Err(e) => {
            error!("Failed to search UI events: {}", e);
            Err(format!("Failed to search UI events: {}", e))
        }
    }
}

/// Get UI event statistics - called from main server router
pub async fn get_ui_event_stats_handler(
    db: Arc<DatabaseManager>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
) -> Result<Vec<UiEventStats>, String> {
    match db.get_ui_event_stats(start_time, end_time).await {
        Ok(stats) => {
            let result: Vec<UiEventStats> = stats
                .into_iter()
                .map(|(app, event_type, count)| UiEventStats {
                    app_name: app,
                    event_type,
                    count,
                })
                .collect();
            Ok(result)
        }
        Err(e) => {
            error!("Failed to get UI event stats: {}", e);
            Err(format!("Failed to get UI event stats: {}", e))
        }
    }
}
