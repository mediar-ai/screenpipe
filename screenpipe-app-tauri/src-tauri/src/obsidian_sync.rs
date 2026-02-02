//! Obsidian Sync Module
//!
//! Syncs screenpipe activity data to an Obsidian vault using pi as the AI agent.
//! The agent queries screenpipe API in chunks and generates markdown summaries.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

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
}

impl ObsidianSyncState {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(ObsidianSyncStatus::default())),
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

    // Run opencode
    let result = run_pi_sync(&app, &prompt, user_token.as_deref()).await;

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

/// Ensure pi is configured to use screenpipe as the AI provider
fn ensure_pi_config(user_token: Option<&str>) -> Result<(), String> {
    let config_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".pi")
        .join("agent");
    
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create pi config dir: {}", e))?;
    
    let models_path = config_dir.join("models.json");
    
    // Create models.json with screenpipe provider
    let config = serde_json::json!({
        "providers": {
            "screenpipe": {
                "api": "anthropic",
                "baseURL": "https://api.screenpi.pe/anthropic",
                "models": {
                    "claude-sonnet-4-20250514": {
                        "name": "Claude Sonnet 4"
                    },
                    "claude-haiku-4-5-20251001": {
                        "name": "Claude Haiku 4.5"
                    }
                }
            }
        }
    });
    
    let config_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    std::fs::write(&models_path, config_str)
        .map_err(|e| format!("Failed to write pi config: {}", e))?;
    
    info!("Pi config written to {:?}", models_path);
    Ok(())
}

/// Internal function to run pi with the sync prompt
async fn run_pi_sync(_app: &AppHandle, prompt: &str, user_token: Option<&str>) -> Result<(), String> {
    info!("Starting obsidian sync with pi");

    // Ensure pi is configured to use screenpipe provider
    ensure_pi_config(user_token)?;
    
    // Find pi executable
    let home = dirs::home_dir().map(|h| h.to_string_lossy().to_string()).unwrap_or_default();
    let npm_global = format!("{}/.npm-global/bin/pi", home);
    let nvm_default = format!("{}/.nvm/versions/node/v22.11.0/bin/pi", home); // Common nvm path
    let all_paths = vec![
        npm_global,
        nvm_default,
        "/opt/homebrew/bin/pi".to_string(),
        "/usr/local/bin/pi".to_string(),
        "/usr/bin/pi".to_string(),
        "pi".to_string(), // PATH fallback
    ];
    
    let mut pi_path: Option<String> = None;
    for path in &all_paths {
        if path == "pi" || std::path::Path::new(path).exists() {
            pi_path = Some(path.clone());
            break;
        }
    }
    
    let pi_cmd = pi_path.ok_or("Could not find pi. Install with: npm install -g @mariozechner/pi-coding-agent")?;
    info!("Using pi at: {}", pi_cmd);
    
    // Build command using tokio::process::Command directly
    let mut cmd = tokio::process::Command::new(&pi_cmd);
    cmd.arg("-p").arg(prompt);
    cmd.arg("--provider").arg("screenpipe");
    
    if let Some(token) = user_token {
        cmd.arg("--api-key").arg(token);
    }
    
    // Capture output
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    info!("Running pi command...");
    let output = cmd.output().await
        .map_err(|e| format!("Failed to spawn pi: {}. Make sure pi is installed (npm install -g @mariozechner/pi-coding-agent)", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if !stdout.is_empty() {
        debug!("pi stdout: {}", stdout);
    }
    if !stderr.is_empty() {
        debug!("pi stderr: {}", stderr);
    }

    if output.status.success() {
        info!("Obsidian sync completed successfully");
        Ok(())
    } else {
        let error_msg = if !stderr.is_empty() {
            stderr.to_string()
        } else {
            format!("Pi exited with code {:?}", output.status.code())
        };
        error!("Obsidian sync failed: {}", error_msg);
        Err(error_msg)
    }
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

    if !settings.enabled || settings.sync_interval_minutes == 0 {
        info!("Obsidian sync scheduler not started (disabled or interval=0)");
        return Ok(());
    }

    let interval_mins = settings.sync_interval_minutes;
    let settings_clone = settings.clone();
    let status_arc = state.status.clone();
    let app_handle = app.clone();
    let token_clone = user_token.clone();

    info!(
        "Starting obsidian sync scheduler with {}min interval",
        interval_mins
    );

    let handle = tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(tokio::time::Duration::from_secs(interval_mins as u64 * 60));

        // Skip the first tick (immediate)
        interval.tick().await;

        loop {
            interval.tick().await;

            // Check if we should sync
            {
                let status = status_arc.lock().await;
                if status.is_syncing {
                    debug!("Skipping scheduled sync - already syncing");
                    continue;
                }
            }

            info!("Running scheduled obsidian sync");

            // Run sync
            let result = run_scheduled_sync(&app_handle, &settings_clone, &status_arc, token_clone.as_deref()).await;

            if let Err(e) = result {
                warn!("Scheduled obsidian sync failed: {}", e);
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

/// Internal function to run a scheduled sync
async fn run_scheduled_sync(
    app: &AppHandle,
    settings: &ObsidianSyncSettings,
    status: &Arc<Mutex<ObsidianSyncStatus>>,
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
    let result = run_pi_sync(app, &prompt, user_token).await;

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
