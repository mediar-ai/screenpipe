//! Apple Intelligence API endpoints for screenpipe server.
//!
//! Integrates directly with the screenpipe database — no HTTP round-trips.
//! Feature-gated behind `apple-intelligence` (macOS aarch64 only).

use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, Utc};
use screenpipe_apple_intelligence::{
    check_availability, generate_text, prewarm, Availability,
};
use screenpipe_db::ContentType;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Once};
use tracing::{error, info, warn};

use crate::server::AppState;

// Prewarm once on first request
static PREWARM: Once = Once::new();

// ─── Action keywords for pre-filtering ─────────────────────────────────────
const ACTION_KEYWORDS: &[&str] = &[
    "todo", "to-do", "to do", "need to", "should", "must", "have to", "gotta",
    "follow up", "follow-up", "followup", "deadline", "reminder", "remember",
    "don't forget", "dont forget", "buy", "call", "email", "schedule",
    "fix", "update", "review", "send", "submit", "complete", "finish",
    "prepare", "book", "remind", "set up", "setup", "arrange", "organize",
    "plan", "assign", "check", "respond", "reply", "confirm", "cancel",
    "reschedule", "meeting", "appointment", "task", "action item",
    "important", "urgent", "asap", "priority", "due", "by tomorrow",
    "by friday", "by monday", "next week", "eod", "end of day",
    "action", "blocked", "blocker", "waiting on", "pending",
    "implement", "deploy", "ship", "release", "merge", "pr",
    "bug", "issue", "ticket",
];

const TODO_INSTRUCTIONS: &str = "\
You extract action items and TODOs from screen recordings and audio transcripts.
Rules:
- Only extract clear, actionable tasks (things someone needs to DO)
- Skip vague mentions, completed items, or general discussion
- Each item should be a short, clear sentence
- Set urgency: high (deadline/urgent/asap), medium (should do soon), low (nice to have)
- Include the app name if you can tell where the task was seen
- Respond ONLY with a JSON array, no other text
- Example: [{\"text\":\"Review PR #42\",\"app\":\"GitHub\",\"urgency\":\"high\"}]
- If no action items, respond with: []";

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ExtractTodosRequest {
    /// How many minutes back to look (default 60)
    #[serde(default = "default_lookback")]
    lookback_minutes: u32,
    /// Max chars per chunk sent to model (default 1200)
    #[serde(default = "default_chunk_size")]
    chunk_size: usize,
}

fn default_lookback() -> u32 { 60 }
fn default_chunk_size() -> usize { 1200 }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TodoItem {
    text: String,
    #[serde(default)]
    app: Option<String>,
    #[serde(default = "default_urgency")]
    urgency: String,
}

fn default_urgency() -> String { "medium".to_string() }

#[derive(Debug, Serialize)]
pub struct ExtractTodosResponse {
    available: bool,
    items: Vec<TodoItem>,
    stats: ExtractStats,
}

#[derive(Debug, Serialize)]
pub struct ExtractStats {
    data_sources: usize,
    total_input_chars: usize,
    filtered_input_chars: usize,
    chunks_processed: usize,
    total_time_ms: f64,
}

#[derive(Debug, Serialize)]
pub struct AiStatusResponse {
    available: bool,
    status: String,
}

// ─── Pre-filtering ─────────────────────────────────────────────────────────

fn prefilter_for_actions(text: &str) -> String {
    if text.len() < 800 {
        return text.to_string();
    }

    let lines: Vec<&str> = text.lines().collect();
    let mut keep = vec![false; lines.len()];

    for (i, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        if ACTION_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
            if i > 0 { keep[i - 1] = true; }
            keep[i] = true;
            if i + 1 < lines.len() { keep[i + 1] = true; }
        }
    }

    let filtered: Vec<&str> = lines.iter().enumerate()
        .filter(|(i, _)| keep[*i])
        .map(|(_, l)| *l)
        .collect();

    if filtered.is_empty() {
        // Fallback: return first 800 chars
        text.chars().take(800).collect()
    } else {
        filtered.join("\n")
    }
}

fn chunk_text(text: &str, chunk_size: usize) -> Vec<String> {
    if text.len() <= chunk_size {
        return vec![text.to_string()];
    }

    let overlap = chunk_size / 7;
    let mut chunks = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0;

    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        chunks.push(chars[start..end].iter().collect());
        if end >= chars.len() { break; }
        start = end - overlap;
    }
    chunks
}

fn dedup_todos(items: Vec<TodoItem>) -> Vec<TodoItem> {
    let mut seen: Vec<String> = Vec::new();
    let mut result = Vec::new();

    for item in items {
        let normalized: String = item.text.to_lowercase()
            .chars().filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");

        let is_dup = seen.iter().any(|s| {
            if s == &normalized { return true; }
            if s.len() > 10 && normalized.len() > 10 {
                let prefix_len = normalized.len().min(30);
                s.contains(&normalized[..prefix_len]) || normalized.contains(&s[..s.len().min(30)])
            } else { false }
        });

        if !is_dup && !normalized.is_empty() {
            seen.push(normalized);
            result.push(item);
        }
    }
    result
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/// GET /ai/status — check if Apple Intelligence is available
pub async fn ai_status() -> Json<AiStatusResponse> {
    let avail = check_availability();
    Json(AiStatusResponse {
        available: avail == Availability::Available,
        status: avail.to_string(),
    })
}

/// POST /ai/extract-todos — extract action items from recent screenpipe data
///
/// Queries the database directly (no HTTP round-trip), pre-filters for
/// action-oriented content, chunks to fit the ~3B model's context window,
/// and deduplicates results.
pub async fn extract_todos(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ExtractTodosRequest>,
) -> Result<Json<ExtractTodosResponse>, (StatusCode, Json<serde_json::Value>)> {
    let start = std::time::Instant::now();

    // Check availability
    let avail = check_availability();
    if avail != Availability::Available {
        return Ok(Json(ExtractTodosResponse {
            available: false,
            items: vec![],
            stats: ExtractStats {
                data_sources: 0, total_input_chars: 0, filtered_input_chars: 0,
                chunks_processed: 0, total_time_ms: 0.0,
            },
        }));
    }

    // Prewarm on first call
    PREWARM.call_once(|| {
        info!("prewarming Apple Intelligence model...");
        if let Err(e) = prewarm() {
            warn!("prewarm failed: {}", e);
        }
    });

    // Query DB directly for recent OCR + audio data
    let end_time = Utc::now();
    let start_time = end_time - Duration::minutes(req.lookback_minutes as i64);

    let results = state.db.search(
        "",                          // no text filter
        ContentType::All,
        100,                         // limit
        0,                           // offset
        Some(start_time),
        Some(end_time),
        None, None, Some(10), None,  // no app/window filter, min_length=10
        None, None, None, None, None,
    ).await.map_err(|e| {
        error!("db search failed: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()})))
    })?;

    // Build text from search results (direct DB access, no HTTP round-trip)
    let mut text_parts: Vec<String> = Vec::new();
    for item in &results {
        match item {
            screenpipe_db::SearchResult::OCR(frame) => {
                let app = &frame.app_name;
                let window = &frame.window_name;
                let text = &frame.ocr_text;
                if !text.trim().is_empty() {
                    text_parts.push(format!("[{} - {}]\n{}", app, window, text));
                }
            }
            screenpipe_db::SearchResult::Audio(chunk) => {
                let text = &chunk.transcription;
                let speaker = chunk.speaker.as_ref()
                    .map(|s| s.name.as_str())
                    .unwrap_or("Unknown");
                if !text.trim().is_empty() {
                    text_parts.push(format!("[Audio - {}]\n{}", speaker, text));
                }
            }
            _ => {} // UI/Input results skipped
        }
    }

    let data_sources = text_parts.len();
    if text_parts.is_empty() {
        return Ok(Json(ExtractTodosResponse {
            available: true,
            items: vec![],
            stats: ExtractStats {
                data_sources: 0, total_input_chars: 0, filtered_input_chars: 0,
                chunks_processed: 0, total_time_ms: start.elapsed().as_millis() as f64,
            },
        }));
    }

    // Pre-filter and concatenate
    let total_input_chars: usize = text_parts.iter().map(|t| t.len()).sum();
    let all_text = text_parts.join("\n---\n");
    let filtered = prefilter_for_actions(&all_text);
    let filtered_input_chars = filtered.len();

    info!(
        "apple intelligence extract: {} sources, {} chars → {} after filter",
        data_sources, total_input_chars, filtered_input_chars
    );

    // Chunk and process
    let chunks = chunk_text(&filtered, req.chunk_size);
    let num_chunks = chunks.len();
    let mut all_items: Vec<TodoItem> = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_clone = chunk.clone();
        let result = tokio::task::spawn_blocking(move || {
            generate_text(
                Some(TODO_INSTRUCTIONS),
                &format!("Extract action items from this screen/audio activity:\n\n{}", chunk_clone),
            )
        })
        .await
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()})))
        })?;

        match result {
            Ok(gen) => {
                info!("extract chunk {}/{}: {:.0}ms", i + 1, num_chunks, gen.metrics.total_time_ms);

                let text = gen.text.trim();
                let json_text = if text.starts_with("```") {
                    text.lines().skip(1).take_while(|l| !l.starts_with("```"))
                        .collect::<Vec<_>>().join("\n")
                } else {
                    text.to_string()
                };

                let items: Option<Vec<TodoItem>> = serde_json::from_str(&json_text).ok()
                    .or_else(|| {
                        serde_json::from_str::<serde_json::Value>(&json_text).ok()
                            .and_then(|v| v.get("items").cloned())
                            .and_then(|v| serde_json::from_value(v).ok())
                    });

                if let Some(chunk_items) = items {
                    all_items.extend(chunk_items.into_iter().filter(|t| !t.text.trim().is_empty()));
                }
            }
            Err(e) => {
                warn!("extract chunk {}/{} failed: {}", i + 1, num_chunks, e);
            }
        }
    }

    let deduped = dedup_todos(all_items);
    let elapsed = start.elapsed().as_millis() as f64;

    info!("extract done: {} items from {} chunks in {:.0}ms", deduped.len(), num_chunks, elapsed);

    Ok(Json(ExtractTodosResponse {
        available: true,
        items: deduped,
        stats: ExtractStats {
            data_sources,
            total_input_chars,
            filtered_input_chars,
            chunks_processed: num_chunks,
            total_time_ms: elapsed,
        },
    }))
}
