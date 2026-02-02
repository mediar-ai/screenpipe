//! Obsidian Sync Module
//!
//! Syncs screenpipe activity data to an Obsidian vault using the AI proxy.
//! Queries screenpipe API for activity, sends to Claude for summarization,
//! and writes markdown notes to the vault.

use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
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

/// System prompt for summarizing screenpipe data
const SYSTEM_PROMPT: &str = r#"You are summarizing screen activity data into concise markdown notes.

## Output Format

Create a markdown summary using this table format:

| Time | Activity | Apps | Tags |
|------|----------|------|------|
| HH:MM-HH:MM | Brief description of what was done | App1, App2 | #tag1 #tag2 |

## Rules

- Link people names with [[Name]] (Obsidian wiki-links)
- Link projects/concepts with [[concept-name]]
- Keep summaries concise but capture key activities
- Group related activities together
- Include apps used for context
- Add semantic tags for easy filtering (#coding, #meeting, #research, etc.)
- Skip idle periods or duplicates
- If no meaningful activity, just write "No significant activity recorded"
- Focus on what was accomplished, not every detail
"#;

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
        let candidates = vec![
            home.join("Documents"),
            home.join("Obsidian"),
            home.clone(),
        ];

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
        let icloud_obsidian = home
            .join("Library/Mobile Documents/iCloud~md~obsidian/Documents");
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

    // Run the sync
    let result = run_sync_internal(&settings).await;

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

/// Internal function to run the sync
async fn run_sync_internal(settings: &ObsidianSyncSettings) -> Result<(), String> {
    info!("Starting obsidian sync");

    let client = reqwest::Client::new();

    // Calculate time range
    let end_time = chrono::Utc::now();
    let start_time = end_time - chrono::Duration::hours(settings.sync_hours as i64);

    // Query screenpipe for activity data
    let search_url = format!(
        "http://localhost:3030/search?content_type=all&start_time={}&end_time={}&limit=500",
        start_time.to_rfc3339(),
        end_time.to_rfc3339()
    );

    debug!("Querying screenpipe: {}", search_url);

    let search_response = client
        .get(&search_url)
        .send()
        .await
        .map_err(|e| format!("Failed to query screenpipe: {}", e))?;

    if !search_response.status().is_success() {
        return Err(format!(
            "Screenpipe API error: {}",
            search_response.status()
        ));
    }

    let search_data: serde_json::Value = search_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse screenpipe response: {}", e))?;

    let data_array = search_data
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or("No data in screenpipe response")?;

    if data_array.is_empty() {
        info!("No activity data found for the time range");
        // Still create a note saying no activity
        let markdown = format!(
            "# Activity Log - {}\n\nNo significant activity recorded during this period.\n",
            end_time.format("%Y-%m-%d")
        );
        write_note(settings, &markdown)?;
        return Ok(());
    }

    // Prepare a summary of the data for Claude
    let mut activity_summary = String::new();
    activity_summary.push_str(&format!(
        "Activity data from {} to {}:\n\n",
        start_time.format("%H:%M"),
        end_time.format("%H:%M")
    ));

    for item in data_array.iter().take(100) {
        // Limit to avoid token overflow
        if let Some(content) = item.get("content") {
            let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("unknown");

            match item_type {
                "OCR" => {
                    let app = content
                        .get("app_name")
                        .and_then(|a| a.as_str())
                        .unwrap_or("unknown");
                    let window = content
                        .get("window_name")
                        .and_then(|w| w.as_str())
                        .unwrap_or("");
                    let text = content
                        .get("text")
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .chars()
                        .take(200)
                        .collect::<String>();
                    let timestamp = content
                        .get("timestamp")
                        .and_then(|t| t.as_str())
                        .unwrap_or("");

                    if !text.trim().is_empty() {
                        activity_summary.push_str(&format!(
                            "- [{}] {}: {} - \"{}\"\n",
                            timestamp, app, window, text
                        ));
                    }
                }
                "Audio" => {
                    let transcription = content
                        .get("transcription")
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .chars()
                        .take(300)
                        .collect::<String>();
                    let timestamp = content
                        .get("timestamp")
                        .and_then(|t| t.as_str())
                        .unwrap_or("");

                    if !transcription.trim().is_empty() {
                        activity_summary.push_str(&format!(
                            "- [{}] Audio: \"{}\"\n",
                            timestamp, transcription
                        ));
                    }
                }
                _ => {}
            }
        }
    }

    // Build prompt for Claude
    let mut user_prompt = format!(
        "Summarize this screen activity into a markdown table. Time range: {} to {}\n\n{}",
        start_time.format("%H:%M"),
        end_time.format("%H:%M"),
        activity_summary
    );

    // Add custom instructions if provided
    if !settings.custom_prompt.is_empty() {
        user_prompt.push_str(&format!(
            "\n\nAdditional instructions from user:\n{}",
            settings.custom_prompt
        ));
    }

    // Call Claude via screenpipe AI proxy
    let ai_response = client
        .post("http://localhost:3030/v1/chat/completions")
        .json(&json!({
            "model": "gpt-4o",  // Will be routed to Claude via proxy
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            "max_tokens": 2000
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to call AI: {}", e))?;

    if !ai_response.status().is_success() {
        let error_text = ai_response.text().await.unwrap_or_default();
        return Err(format!("AI API error: {}", error_text));
    }

    let ai_data: serde_json::Value = ai_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;

    let summary = ai_data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("Failed to extract AI response")?;

    // Build final markdown
    let today = end_time.format("%Y-%m-%d").to_string();
    let markdown = format!("# Activity Log - {}\n\n{}\n", today, summary);

    // Write to file
    write_note(settings, &markdown)?;

    info!("Obsidian sync completed successfully");
    Ok(())
}

/// Write markdown content to the notes file
fn write_note(settings: &ObsidianSyncSettings, content: &str) -> Result<(), String> {
    let notes_path = if settings.notes_path.is_empty() {
        "screenpipe/logs".to_string()
    } else {
        settings.notes_path.trim_matches('/').to_string()
    };

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let full_path = PathBuf::from(&settings.vault_path)
        .join(&notes_path)
        .join(format!("{}.md", today));

    // Create directory if needed
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Write file (overwrite for now - could append in future)
    std::fs::write(&full_path, content)
        .map_err(|e| format!("Failed to write note: {}", e))?;

    info!("Wrote note to: {:?}", full_path);
    Ok(())
}

/// Start the background scheduler for periodic syncs
#[tauri::command]
#[specta::specta]
pub async fn obsidian_start_scheduler(
    app: AppHandle,
    state: tauri::State<'_, ObsidianSyncState>,
    settings: ObsidianSyncSettings,
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

    info!(
        "Starting obsidian sync scheduler with {}min interval",
        interval_mins
    );

    let handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(
            interval_mins as u64 * 60,
        ));

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

            // Update status
            {
                let mut status = status_arc.lock().await;
                status.is_syncing = true;
                status.last_error = None;
            }

            let _ = app_handle.emit("obsidian_sync_started", ());

            let result = run_sync_internal(&settings_clone).await;

            // Update status
            {
                let mut status = status_arc.lock().await;
                status.is_syncing = false;

                match &result {
                    Ok(_) => {
                        status.last_sync_time = Some(chrono::Utc::now().to_rfc3339());
                        status.last_error = None;
                        status.notes_created_today += 1;
                        let _ = app_handle.emit("obsidian_sync_completed", status.clone());
                    }
                    Err(e) => {
                        status.last_error = Some(e.clone());
                        let _ = app_handle.emit("obsidian_sync_error", e.clone());
                    }
                }
            }

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
