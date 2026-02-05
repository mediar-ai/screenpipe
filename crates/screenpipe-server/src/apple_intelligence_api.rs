//! Generic OpenAI-compatible API wrapping Apple Foundation Models.
//!
//! Thin layer: HTTP in → generate_text() via Swift FFI → HTTP out.
//! No application-specific logic — just an AI endpoint anyone can use.
//! Feature-gated behind `apple-intelligence` (macOS aarch64 only).

use axum::{http::StatusCode, Json};
use screenpipe_apple_intelligence::{check_availability, generate_text, prewarm, Availability};
use serde::{Deserialize, Serialize};
use std::sync::Once;
use tracing::{info, warn};

static PREWARM: Once = Once::new();

// ─── OpenAI-compatible types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ChatCompletionRequest {
    messages: Vec<Message>,
    #[serde(default)]
    #[allow(dead_code)]
    temperature: Option<f64>,
    #[serde(default)]
    #[allow(dead_code)]
    max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Message {
    role: String,
    content: String,
}

#[derive(Serialize)]
pub struct ChatCompletionResponse {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<Choice>,
    usage: Usage,
}

#[derive(Serialize)]
pub struct Choice {
    index: u32,
    message: Message,
    finish_reason: String,
}

#[derive(Serialize)]
pub struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Serialize)]
pub struct StatusResponse {
    available: bool,
    status: String,
    model: String,
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/// GET /ai/status
pub async fn ai_status() -> Json<StatusResponse> {
    let avail = check_availability();
    Json(StatusResponse {
        available: avail == Availability::Available,
        status: avail.to_string(),
        model: "apple-intelligence".to_string(),
    })
}

/// POST /ai/chat/completions — OpenAI-compatible chat completions
pub async fn chat_completions(
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, (StatusCode, Json<serde_json::Value>)> {
    // Prewarm on first call
    PREWARM.call_once(|| {
        info!("prewarming apple intelligence model");
        if let Err(e) = prewarm() {
            warn!("prewarm failed: {}", e);
        }
    });

    // Build prompt from messages
    let mut system: Option<String> = None;
    let mut conversation = Vec::new();

    for msg in &req.messages {
        match msg.role.as_str() {
            "system" => system = Some(msg.content.clone()),
            "user" => conversation.push(format!("User: {}", msg.content)),
            "assistant" => conversation.push(format!("Assistant: {}", msg.content)),
            _ => {}
        }
    }

    let prompt = conversation.join("\n\n");
    let prompt_len = prompt.len();

    // Call Foundation Models (blocking FFI → spawn_blocking)
    let result = tokio::task::spawn_blocking(move || {
        generate_text(system.as_deref(), &prompt)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    Ok(Json(ChatCompletionResponse {
        id: format!("chatcmpl-{}", now),
        object: "chat.completion".to_string(),
        created: now,
        model: "apple-intelligence".to_string(),
        choices: vec![Choice {
            index: 0,
            message: Message {
                role: "assistant".to_string(),
                content: result.text,
            },
            finish_reason: "stop".to_string(),
        }],
        usage: Usage {
            prompt_tokens: (prompt_len / 4) as u32,
            completion_tokens: 0, // we don't track this
            total_tokens: (prompt_len / 4) as u32,
        },
    }))
}
