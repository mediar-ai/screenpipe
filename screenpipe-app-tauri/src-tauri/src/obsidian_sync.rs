//! Obsidian Sync Module
//!
//! Syncs screenpipe activity data to an Obsidian vault using pi as the AI agent.
//! The agent queries screenpipe API in chunks and generates markdown summaries.

use crate::pi;
use crate::store::{ObsidianSettingsStore, SettingsStore};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tracing::{info, warn};

/// Obsidian sync settings stored in the app store
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsidianSyncSettings {
    /// Whether sync is enabled
    pub enabled: bool,
    /// Path to the Obsidian vault
    pub vault_path: String,
    /// Subfolder within vault for notes (e.g., "screenpipe/logs" or "daily/activity")
    #[serde(default = "default_notes_path")]
    pub notes_path: String,
    /// Sync interval in minutes (0 = manual only)
    pub sync_interval_minutes: u32,
    /// Custom user prompt to append to system prompt
    pub custom_prompt: String,
    /// Last successful sync timestamp (ISO 8601)
    pub last_sync_time: Option<String>,
    /// Number of hours to sync (how far back to look)
    pub sync_hours: u32,
}

fn default_notes_path() -> String {
    "screenpipe/logs".to_string()
}

/// Status of an ongoing or completed sync
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ObsidianSyncStatus {
    pub is_syncing: bool,
    pub last_sync_time: Option<String>,
    pub last_error: Option<String>,
    pub notes_created_today: u32,
}

impl Default for ObsidianSyncStatus {
    fn default() -> Self {
        Self {
            is_syncing: false,
            last_sync_time: None,
            last_error: None,
            notes_created_today: 0,
        }
    }
}

/// State for managing obsidian sync
pub struct ObsidianSyncState {
    pub status: Arc<Mutex<ObsidianSyncStatus>>,
    pub scheduler_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    pub current_pid: Arc<Mutex<Option<u32>>>,
}

impl ObsidianSyncState {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(ObsidianSyncStatus::default())),
            current_pid: Arc::new(Mutex::new(None)),
            scheduler_handle: Arc::new(Mutex::new(None)),
        }
    }
}

/// System prompt for the opencode agent with screenpipe API docs
const SYSTEM_PROMPT: &str = r#"You are syncing screenpipe activity data to an Obsidian vault.

## Screenpipe API Reference

Base URL: http://localhost:3030

### Search Endpoint
```
GET /search
```

Query parameters:
- `content_type`: "ocr" | "audio" | "all" (default: all)
- `start_time`: ISO 8601 timestamp (e.g., 2025-02-01T10:00:00Z)
- `end_time`: ISO 8601 timestamp
- `limit`: max results per request (default: 50, max: 1000)
- `offset`: pagination offset

Example:
```bash
curl "http://localhost:3030/search?content_type=all&start_time=2025-02-01T10:00:00Z&end_time=2025-02-01T10:30:00Z&limit=200"
```

Response format:
```json
{
  "data": [
    {
      "type": "OCR",
      "content": {
        "frame_id": 123,
        "text": "screen text content...",
        "app_name": "Arc",
        "window_name": "GitHub - Pull Request",
        "timestamp": "2025-02-01T10:05:00Z"
      }
    },
    {
      "type": "Audio",
      "content": {
        "transcription": "spoken words...",
        "timestamp": "2025-02-01T10:05:30Z"
      }
    }
  ],
  "pagination": { "total": 500, "limit": 200, "offset": 0 }
}
```

## Your Task

1. Query the screenpipe API for the specified time range
2. Process data in 30-minute chunks to manage context size
3. For each chunk, summarize the key activities
4. Append summaries to the daily markdown log file
5. Create folders/files as needed

## Output Format

Create/append to the daily log file using this markdown table format:

```markdown
# Activity Log - YYYY-MM-DD

| Time | Activity | Apps | Tags |
|------|----------|------|------|
| 10:00-10:30 | Reviewed PR #123 for auth module | GitHub, VSCode | #coding #review |
| 10:30-11:00 | Call with team about roadmap | Zoom, Notion | #meeting #planning |
```

## Best Practices

- Link people names with [[Name]] (Obsidian wiki-links)
- Link projects/concepts with [[concept-name]]
- Keep summaries concise but capture key activities
- Group related activities together
- Include apps used for context
- Add semantic tags for easy filtering
- Skip idle periods or duplicates
- If no meaningful activity in a chunk, skip it or note "idle"

## Important

- Query in chunks to avoid context overflow
- Use curl to fetch data from the API
- Write files using the write tool
- Create the subfolder structure if it doesn't exist
- ONLY create/modify the single daily log file (YYYY-MM-DD.md) - DO NOT create any other files like INDEX.md, TODO.md, QUICK_REF.txt, etc.
- Each sync should append to or update the existing daily log file, not create new files
- Use the user's LOCAL timezone for all times displayed in the log (convert UTC timestamps to local time)
- Detect timezone from the system or use the timestamp offsets in the data
"#;

/// Build the full prompt for opencode
fn build_prompt(settings: &ObsidianSyncSettings, start_time: &str, end_time: &str) -> String {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let notes_path = if settings.notes_path.is_empty() {
        "screenpipe/logs".to_string()
    } else {
        settings.notes_path.trim_matches('/').to_string()
    };
    let note_path = format!(
        "{}/{}/{}.md",
        settings.vault_path.trim_end_matches('/'),
        notes_path,
        today
    );

    let mut prompt = format!(
        r#"Sync my screenpipe activity to Obsidian.

Time range: {} to {}
Output file: {}

{}"#,
        start_time, end_time, note_path, SYSTEM_PROMPT
    );

    // Append user's custom prompt if provided
    if !settings.custom_prompt.is_empty() {
        prompt.push_str("\n\n## Additional Instructions from User\n\n");
        prompt.push_str(&settings.custom_prompt);
    }

    prompt
}

/// Save obsidian settings to persistent store (called when settings change)
#[tauri::command]
#[specta::specta]
pub async fn obsidian_save_settings(
    app: AppHandle,
    settings: ObsidianSyncSettings,
) -> Result<(), String> {
    let store_settings = ObsidianSettingsStore {
        enabled: settings.enabled,
        vault_path: settings.vault_path,
        notes_path: settings.notes_path,
        sync_interval_minutes: settings.sync_interval_minutes,
        custom_prompt: settings.custom_prompt,
        sync_hours: settings.sync_hours,
    };
    store_settings.save(&app)?;
    info!("Obsidian settings saved to store");
    Ok(())
}

/// Validate that a path is a valid Obsidian vault (has .obsidian folder)
#[tauri::command]
#[specta::specta]
pub async fn obsidian_validate_vault(path: String) -> Result<bool, String> {
    let vault_path = PathBuf::from(&path);
    let obsidian_folder = vault_path.join(".obsidian");
    Ok(obsidian_folder.exists() && obsidian_folder.is_dir())
}

/// Get suggested Obsidian vault paths by scanning common locations
#[tauri::command]
#[specta::specta]
pub async fn obsidian_get_vault_paths() -> Result<Vec<String>, String> {
    let mut paths = Vec::new();

    // Common Obsidian vault locations
    if let Some(home) = dirs::home_dir() {
        let candidates = vec![home.join("Documents"), home.join("Obsidian"), home.clone()];

        for candidate in candidates {
            if let Ok(entries) = std::fs::read_dir(&candidate) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let obsidian_folder = path.join(".obsidian");
                        if obsidian_folder.exists() {
                            if let Some(path_str) = path.to_str() {
                                paths.push(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Also check iCloud on macOS
    #[cfg(target_os = "macos")]
    if let Some(home) = dirs::home_dir() {
        let icloud_obsidian = home.join("Library/Mobile Documents/iCloud~md~obsidian/Documents");
        if let Ok(entries) = std::fs::read_dir(&icloud_obsidian) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let obsidian_folder = path.join(".obsidian");
                    if obsidian_folder.exists() {
                        if let Some(path_str) = path.to_str() {
                            paths.push(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(paths)
}

/// Get current sync status
#[tauri::command]
#[specta::specta]
pub async fn obsidian_get_sync_status(
    state: tauri::State<'_, ObsidianSyncState>,
) -> Result<ObsidianSyncStatus, String> {
    let status = state.status.lock().await;
    Ok(status.clone())
}

/// Run a sync operation (manual trigger or from scheduler)
#[tauri::command]
#[specta::specta]
pub async fn obsidian_run_sync(
    app: AppHandle,
    state: tauri::State<'_, ObsidianSyncState>,
    settings: ObsidianSyncSettings,
    user_token: Option<String>,
) -> Result<ObsidianSyncStatus, String> {
    // Check if already syncing
    {
        let status = state.status.lock().await;
        if status.is_syncing {
            return Err("Sync already in progress".to_string());
        }
    }

    // Validate vault path
    if settings.vault_path.is_empty() {
        return Err("Vault path not configured".to_string());
    }

    if !obsidian_validate_vault(settings.vault_path.clone()).await? {
        return Err("Invalid Obsidian vault path".to_string());
    }

    // Update status to syncing
    {
        let mut status = state.status.lock().await;
        status.is_syncing = true;
        status.last_error = None;
    }

    // Emit event for UI
    let _ = app.emit("obsidian_sync_started", ());

    // Calculate time range
    let end_time = chrono::Utc::now();
    let start_time = end_time - chrono::Duration::hours(settings.sync_hours as i64);
    let start_time_str = start_time.to_rfc3339();
    let end_time_str = end_time.to_rfc3339();

    // Build prompt
    let prompt = build_prompt(&settings, &start_time_str, &end_time_str);

    // Debug: check if token is passed
    info!("obsidian_run_sync: user_token present = {}, vault_path = {}", user_token.is_some(), settings.vault_path);
    
    // Create channel to receive PID
    let (pid_tx, pid_rx) = tokio::sync::oneshot::channel();
    let current_pid = state.current_pid.clone();
    
    // Spawn task to store PID when received
    tokio::spawn(async move {
        if let Ok(pid) = pid_rx.await {
            *current_pid.lock().await = Some(pid);
        }
    });
    
    // Run pi in the vault directory
    let result = pi::run(&prompt, user_token.as_deref(), &settings.vault_path, Some(pid_tx)).await.map(|_| ());
    
    // Clear PID when done
    *state.current_pid.lock().await = None;

    // Update status based on result
    {
        let mut status = state.status.lock().await;
        status.is_syncing = false;

        match &result {
            Ok(_) => {
                status.last_sync_time = Some(chrono::Utc::now().to_rfc3339());
                status.last_error = None;
                status.notes_created_today += 1;
                let _ = app.emit("obsidian_sync_completed", status.clone());
            }
            Err(e) => {
                status.last_error = Some(e.clone());
                let _ = app.emit("obsidian_sync_error", e.clone());
            }
        }
    }

    let status = state.status.lock().await;
    result.map(|_| status.clone())
}

/// Start the background scheduler for periodic syncs
#[tauri::command]
#[specta::specta]
pub async fn obsidian_start_scheduler(
    app: AppHandle,
    state: tauri::State<'_, ObsidianSyncState>,
    settings: ObsidianSyncSettings,
    user_token: Option<String>,
) -> Result<(), String> {
    // Stop existing scheduler if any
    obsidian_stop_scheduler(state.clone()).await?;

    // Save settings to persistent store for auto-restart on app launch
    let store_settings = ObsidianSettingsStore {
        enabled: settings.enabled,
        vault_path: settings.vault_path.clone(),
        notes_path: settings.notes_path.clone(),
        sync_interval_minutes: settings.sync_interval_minutes,
        custom_prompt: settings.custom_prompt.clone(),
        sync_hours: settings.sync_hours,
    };
    if let Err(e) = store_settings.save(&app) {
        warn!("Failed to save obsidian settings to store: {}", e);
    }

    if !settings.enabled || settings.sync_interval_minutes == 0 {
        info!("Obsidian sync scheduler not started (disabled or interval=0)");
        return Ok(());
    }

    let interval_mins = settings.sync_interval_minutes;
    let settings_clone = settings.clone();
    let status_arc = state.status.clone();
    let current_pid_arc = state.current_pid.clone();
    let app_handle = app.clone();
    let token_clone = user_token.clone();

    info!(
        "Starting obsidian sync scheduler with {}min interval",
        interval_mins
    );

    let handle = tokio::spawn(async move {
        info!("Obsidian scheduler task started, interval: {}min", interval_mins);
        
        let mut interval =
            tokio::time::interval(tokio::time::Duration::from_secs(interval_mins as u64 * 60));

        // Skip the first tick (immediate)
        interval.tick().await;
        info!("Obsidian scheduler: first tick skipped, waiting for next interval");

        loop {
            info!("Obsidian scheduler: waiting for next tick...");
            interval.tick().await;
            info!("Obsidian scheduler: tick received at {:?}", chrono::Utc::now());

            // Check if we should sync
            {
                let status = status_arc.lock().await;
                if status.is_syncing {
                    info!("Obsidian scheduler: skipping - already syncing");
                    continue;
                }
            }

            info!("Running scheduled obsidian sync");

            // Run sync
            let result = run_scheduled_sync(&app_handle, &settings_clone, &status_arc, &current_pid_arc, token_clone.as_deref()).await;

            match result {
                Ok(_) => {
                    info!("Scheduled obsidian sync completed successfully");
                }
                Err(e) => {
                    warn!("Scheduled obsidian sync failed: {}", e);
                }
            }
        }
    });

    // Store the handle
    let mut scheduler_handle = state.scheduler_handle.lock().await;
    *scheduler_handle = Some(handle);

    Ok(())
}

/// Stop the background scheduler
#[tauri::command]
#[specta::specta]
pub async fn obsidian_stop_scheduler(
    state: tauri::State<'_, ObsidianSyncState>,
) -> Result<(), String> {
    let mut handle = state.scheduler_handle.lock().await;
    if let Some(h) = handle.take() {
        h.abort();
        info!("Obsidian sync scheduler stopped");
    }
    Ok(())
}

/// Auto-start the scheduler on app launch if it was previously enabled
pub async fn auto_start_scheduler(app: AppHandle, state: &ObsidianSyncState) {
    info!("Checking if obsidian scheduler should auto-start...");
    
    // Load obsidian settings from store
    let obsidian_settings = match ObsidianSettingsStore::get(&app) {
        Ok(Some(s)) => s,
        Ok(None) => {
            info!("No obsidian settings found, skipping auto-start");
            return;
        }
        Err(e) => {
            warn!("Failed to load obsidian settings: {}", e);
            return;
        }
    };

    if !obsidian_settings.enabled {
        info!("Obsidian scheduler is disabled, skipping auto-start");
        return;
    }

    if obsidian_settings.vault_path.is_empty() {
        info!("Obsidian vault path is empty, skipping auto-start");
        return;
    }

    if obsidian_settings.sync_interval_minutes == 0 {
        info!("Obsidian sync interval is 0, skipping auto-start");
        return;
    }

    // Get user token from settings store
    let user_token = match SettingsStore::get(&app) {
        Ok(Some(s)) => s.user.token,
        _ => None,
    };

    if user_token.is_none() {
        info!("No user token found, skipping obsidian auto-start (requires login)");
        return;
    }

    // Convert store settings to sync settings
    let settings = ObsidianSyncSettings {
        enabled: obsidian_settings.enabled,
        vault_path: obsidian_settings.vault_path,
        notes_path: obsidian_settings.notes_path,
        sync_interval_minutes: obsidian_settings.sync_interval_minutes,
        custom_prompt: obsidian_settings.custom_prompt,
        last_sync_time: None,
        sync_hours: obsidian_settings.sync_hours,
    };

    info!("Auto-starting obsidian scheduler with {}min interval", settings.sync_interval_minutes);

    // Start the scheduler (similar to obsidian_start_scheduler but without tauri::State)
    let interval_mins = settings.sync_interval_minutes;
    let settings_clone = settings.clone();
    let status_arc = state.status.clone();
    let current_pid_arc = state.current_pid.clone();
    let app_handle = app.clone();
    let token_clone = user_token.clone();

    let handle = tokio::spawn(async move {
        info!("Obsidian scheduler task started (auto-start), interval: {}min", interval_mins);
        
        let mut interval =
            tokio::time::interval(tokio::time::Duration::from_secs(interval_mins as u64 * 60));

        // Skip the first tick (immediate)
        interval.tick().await;
        info!("Obsidian scheduler: first tick skipped, waiting for next interval");

        loop {
            info!("Obsidian scheduler: waiting for next tick...");
            interval.tick().await;
            info!("Obsidian scheduler: tick received at {:?}", chrono::Utc::now());

            // Check if we should sync
            {
                let status = status_arc.lock().await;
                if status.is_syncing {
                    info!("Obsidian scheduler: skipping - already syncing");
                    continue;
                }
            }

            info!("Running scheduled obsidian sync");

            // Run sync
            let result = run_scheduled_sync(&app_handle, &settings_clone, &status_arc, &current_pid_arc, token_clone.as_deref()).await;

            match result {
                Ok(_) => {
                    info!("Scheduled obsidian sync completed successfully");
                }
                Err(e) => {
                    warn!("Scheduled obsidian sync failed: {}", e);
                }
            }
        }
    });

    // Store the handle
    let mut scheduler_handle = state.scheduler_handle.lock().await;
    *scheduler_handle = Some(handle);
    
    info!("Obsidian scheduler auto-started successfully");
}

/// Cancel the currently running sync
#[tauri::command]
#[specta::specta]
pub async fn obsidian_cancel_sync(
    app: AppHandle,
    state: tauri::State<'_, ObsidianSyncState>,
) -> Result<(), String> {
    let mut pid = state.current_pid.lock().await;
    if let Some(p) = pid.take() {
        crate::pi::kill(p)?;
        
        // Update status
        let mut status = state.status.lock().await;
        status.is_syncing = false;
        status.last_error = Some("Cancelled by user".to_string());
        
        let _ = app.emit("obsidian_sync_error", "Cancelled by user");
        info!("Obsidian sync cancelled");
    }
    Ok(())
}

/// Internal function to run a scheduled sync
async fn run_scheduled_sync(
    app: &AppHandle,
    settings: &ObsidianSyncSettings,
    status: &Arc<Mutex<ObsidianSyncStatus>>,
    current_pid: &Arc<Mutex<Option<u32>>>,
    user_token: Option<&str>,
) -> Result<(), String> {
    // Update status
    {
        let mut s = status.lock().await;
        s.is_syncing = true;
        s.last_error = None;
    }

    let _ = app.emit("obsidian_sync_started", ());

    // Calculate time range
    let end_time = chrono::Utc::now();
    let start_time = end_time - chrono::Duration::hours(settings.sync_hours as i64);

    let prompt = build_prompt(settings, &start_time.to_rfc3339(), &end_time.to_rfc3339());
    
    // Create channel to receive PID
    let (pid_tx, pid_rx) = tokio::sync::oneshot::channel();
    let pid_clone = current_pid.clone();
    tokio::spawn(async move {
        if let Ok(pid) = pid_rx.await {
            *pid_clone.lock().await = Some(pid);
        }
    });
    
    let result = pi::run(&prompt, user_token, &settings.vault_path, Some(pid_tx)).await.map(|_| ());
    
    // Clear PID when done
    *current_pid.lock().await = None;

    // Update status
    {
        let mut s = status.lock().await;
        s.is_syncing = false;

        match &result {
            Ok(_) => {
                s.last_sync_time = Some(chrono::Utc::now().to_rfc3339());
                s.last_error = None;
                s.notes_created_today += 1;
                let _ = app.emit("obsidian_sync_completed", s.clone());
            }
            Err(e) => {
                s.last_error = Some(e.clone());
                let _ = app.emit("obsidian_sync_error", e.clone());
            }
        }
    }

    result
}
