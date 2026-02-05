//! OpenAI-compatible API server wrapping Apple Foundation Models.
//! Includes a dedicated `/v1/extract-todos` endpoint for TODO extraction
//! using schema-constrained JSON output (guaranteed valid).
//!
//! Start with: cargo run --features server --bin fm-server
//! Then point any OpenAI-compatible client at http://localhost:5273

use axum::{
    extract::Json,
    http::StatusCode,
    response::{sse::{Event, Sse}, IntoResponse},
    routing::{get, post},
    Router,
};
use screenpipe_apple_intelligence::{
    check_availability, generate_text, prewarm, Availability,
};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use tokio_stream::StreamExt as _;

const MODEL_ID: &str = "apple-intelligence";
const MODEL_NAME: &str = "Apple Intelligence (on-device)";

// ─── Action keywords for pre-filtering ─────────────────────────────────────
// Keeps only sentences likely to contain action items before sending to model.
// This reduces volume 10-50x, critical for a ~3B model with ~2000 token context.
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
    "bug", "issue", "ticket", "jira", "linear",
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

// ─── OpenAI-compatible types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ChatCompletionRequest {
    #[serde(default = "default_model")]
    model: String,
    messages: Vec<Message>,
    #[serde(default)]
    stream: bool,
    #[serde(default)]
    temperature: Option<f64>,
    #[serde(default)]
    max_tokens: Option<u32>,
    #[serde(default)]
    tools: Option<Vec<ToolDef>>,
    #[serde(default)]
    tool_choice: Option<serde_json::Value>,
}

fn default_model() -> String {
    MODEL_ID.to_string()
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Message {
    role: String,
    #[serde(default)]
    content: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ToolDef {
    r#type: String,
    function: ToolFunction,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ToolFunction {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    parameters: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ToolCall {
    id: String,
    r#type: String,
    function: ToolCallFunction,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ToolCallFunction {
    name: String,
    arguments: String,
}

#[derive(Serialize)]
struct ChatCompletionResponse {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<Choice>,
    usage: Usage,
}

#[derive(Serialize)]
struct Choice {
    index: u32,
    message: ResponseMessage,
    finish_reason: String,
}

#[derive(Serialize)]
struct ResponseMessage {
    role: String,
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Serialize)]
struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Serialize)]
struct ChatCompletionChunk {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<StreamChoice>,
}

#[derive(Serialize)]
struct StreamChoice {
    index: u32,
    delta: Delta,
    finish_reason: Option<String>,
}

#[derive(Serialize)]
struct Delta {
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Serialize)]
struct ModelList {
    object: String,
    data: Vec<ModelInfo>,
}

#[derive(Serialize)]
struct ModelInfo {
    id: String,
    object: String,
    created: u64,
    owned_by: String,
}

// ─── TODO extraction types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ExtractRequest {
    /// Raw text chunks to process. Each chunk is processed independently.
    chunks: Vec<String>,
    /// Optional: max chars per chunk (server will re-chunk if needed)
    #[serde(default = "default_chunk_size")]
    chunk_size: usize,
}

fn default_chunk_size() -> usize {
    1200
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TodoItem {
    text: String,
    #[serde(default)]
    app: Option<String>,
    #[serde(default = "default_urgency")]
    urgency: String,
}

fn default_urgency() -> String {
    "medium".to_string()
}

#[derive(Debug, Serialize)]
struct ExtractResponse {
    items: Vec<TodoItem>,
    stats: ExtractStats,
}

#[derive(Debug, Serialize)]
struct ExtractStats {
    chunks_processed: usize,
    chunks_with_results: usize,
    total_input_chars: usize,
    filtered_input_chars: usize,
    total_time_ms: f64,
    pre_filter_ratio: f64,
}

// ─── Pre-filtering logic ────────────────────────────────────────────────────

/// Pre-filter text to keep only lines likely to contain action items.
/// Uses keyword matching to reduce volume before sending to the model.
/// Returns (filtered_text, original_char_count).
fn prefilter_for_actions(text: &str) -> (String, usize) {
    let original_len = text.len();
    let lines: Vec<&str> = text.lines().collect();

    if lines.is_empty() {
        return (String::new(), original_len);
    }

    // If text is already small enough, don't filter
    if original_len < 800 {
        return (text.to_string(), original_len);
    }

    let mut keep = vec![false; lines.len()];

    for (i, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        if ACTION_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
            // Keep this line + 1 line of context before/after
            if i > 0 {
                keep[i - 1] = true;
            }
            keep[i] = true;
            if i + 1 < lines.len() {
                keep[i + 1] = true;
            }
        }
    }

    let filtered: Vec<&str> = lines
        .iter()
        .enumerate()
        .filter(|(i, _)| keep[*i])
        .map(|(_, l)| *l)
        .collect();

    // If nothing matched, return first ~800 chars as fallback
    if filtered.is_empty() {
        let truncated: String = text.chars().take(800).collect();
        return (truncated, original_len);
    }

    (filtered.join("\n"), original_len)
}

/// Split text into chunks with overlap for boundary coverage.
fn chunk_text(text: &str, chunk_size: usize) -> Vec<String> {
    if text.len() <= chunk_size {
        return vec![text.to_string()];
    }

    let overlap = chunk_size / 7; // ~15% overlap
    let mut chunks = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0;

    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(chunk);

        if end >= chars.len() {
            break;
        }
        start = end - overlap;
    }

    chunks
}

/// Deduplicate TODO items by text similarity (simple normalized comparison).
fn dedup_todos(items: Vec<TodoItem>) -> Vec<TodoItem> {
    let mut seen: Vec<String> = Vec::new();
    let mut result = Vec::new();

    for item in items {
        let normalized = item
            .text
            .to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        // Check if we've seen something very similar
        let is_dup = seen.iter().any(|s| {
            if s == &normalized {
                return true;
            }
            // Simple substring check for near-duplicates
            if s.len() > 10 && normalized.len() > 10 {
                s.contains(&normalized[..normalized.len().min(30)])
                    || normalized.contains(&s[..s.len().min(30)])
            } else {
                false
            }
        });

        if !is_dup && !normalized.is_empty() {
            seen.push(normalized);
            result.push(item);
        }
    }

    result
}

// ─── Handlers ───────────────────────────────────────────────────────────────

fn build_prompt_from_messages(
    messages: &[Message],
    tools: &Option<Vec<ToolDef>>,
) -> (Option<String>, String) {
    let mut system_parts: Vec<String> = Vec::new();
    let mut conversation: Vec<String> = Vec::new();

    if let Some(tools) = tools {
        let mut tool_desc = String::from("You have access to the following tools:\n\n");
        for tool in tools {
            tool_desc.push_str(&format!("### {}\n", tool.function.name));
            if let Some(desc) = &tool.function.description {
                tool_desc.push_str(&format!("{}\n", desc));
            }
            if let Some(params) = &tool.function.parameters {
                tool_desc.push_str(&format!(
                    "Parameters: {}\n",
                    serde_json::to_string(params).unwrap_or_default()
                ));
            }
            tool_desc.push('\n');
        }
        tool_desc.push_str(
            "To call a tool, respond with a JSON block in this exact format:\n\
             ```tool_call\n{\"name\": \"tool_name\", \"arguments\": {\"arg1\": \"value1\"}}\n```\n\n\
             You can call multiple tools. After tool results, continue your response.\n\
             If no tool is needed, respond normally with text.",
        );
        system_parts.push(tool_desc);
    }

    for msg in messages {
        match msg.role.as_str() {
            "system" => {
                if let Some(content) = &msg.content {
                    let text = match content {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    system_parts.push(text);
                }
            }
            "user" => {
                if let Some(content) = &msg.content {
                    let text = match content {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Array(parts) => parts
                            .iter()
                            .filter_map(|p| {
                                if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    p.get("text").and_then(|t| t.as_str()).map(String::from)
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join("\n"),
                        other => other.to_string(),
                    };
                    conversation.push(format!("User: {}", text));
                }
            }
            "assistant" => {
                if let Some(content) = &msg.content {
                    let text = match content {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    conversation.push(format!("Assistant: {}", text));
                }
                if let Some(tool_calls) = &msg.tool_calls {
                    for tc in tool_calls {
                        conversation.push(format!(
                            "Assistant called tool {}: {}",
                            tc.function.name, tc.function.arguments
                        ));
                    }
                }
            }
            "tool" => {
                if let Some(content) = &msg.content {
                    let text = match content {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    let id = msg.tool_call_id.as_deref().unwrap_or("?");
                    conversation.push(format!("Tool result ({}): {}", id, text));
                }
            }
            _ => {}
        }
    }

    let instructions = if system_parts.is_empty() {
        None
    } else {
        Some(system_parts.join("\n\n"))
    };
    (instructions, conversation.join("\n\n"))
}

fn parse_tool_calls(text: &str) -> (Option<String>, Vec<ToolCall>) {
    let mut tool_calls = Vec::new();
    let mut remaining = String::new();
    let mut in_block = false;
    let mut block = String::new();

    for line in text.lines() {
        if line.trim() == "```tool_call" {
            in_block = true;
            block.clear();
            continue;
        }
        if in_block && line.trim() == "```" {
            in_block = false;
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&block) {
                if let (Some(name), Some(args)) = (
                    parsed.get("name").and_then(|n| n.as_str()),
                    parsed.get("arguments"),
                ) {
                    tool_calls.push(ToolCall {
                        id: format!(
                            "call_{}",
                            &uuid::Uuid::new_v4().to_string().replace('-', "")[..24]
                        ),
                        r#type: "function".to_string(),
                        function: ToolCallFunction {
                            name: name.to_string(),
                            arguments: serde_json::to_string(args).unwrap_or_default(),
                        },
                    });
                }
            }
            continue;
        }
        if in_block {
            block.push_str(line);
            block.push('\n');
        } else {
            remaining.push_str(line);
            remaining.push('\n');
        }
    }

    let content = remaining.trim().to_string();
    (
        if content.is_empty() {
            None
        } else {
            Some(content)
        },
        tool_calls,
    )
}

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

async fn list_models() -> Json<ModelList> {
    Json(ModelList {
        object: "list".to_string(),
        data: vec![ModelInfo {
            id: MODEL_ID.to_string(),
            object: "model".to_string(),
            created: 1700000000,
            owned_by: "apple".to_string(),
        }],
    })
}

async fn chat_completions(
    Json(req): Json<ChatCompletionRequest>,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let (instructions, prompt) = build_prompt_from_messages(&req.messages, &req.tools);
    let has_tools = req.tools.as_ref().map_or(false, |t| !t.is_empty());
    let prompt_len = prompt.len();

    eprintln!(
        "[fm-server] chat: {} chars, tools: {}, stream: {}",
        prompt_len, has_tools, req.stream
    );

    let result = tokio::task::spawn_blocking(move || {
        generate_text(instructions.as_deref(), &prompt)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": {"message": e.to_string()}})),
        )
    })?
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": {"message": e.to_string()}})),
        )
    })?;

    eprintln!(
        "[fm-server] response: {} chars, {:.0}ms",
        result.text.len(),
        result.metrics.total_time_ms
    );

    let request_id = format!(
        "chatcmpl-{}",
        &uuid::Uuid::new_v4().to_string().replace('-', "")[..24]
    );
    let est_prompt_tokens = (prompt_len / 4) as u32;
    let est_completion_tokens = (result.text.len() / 4) as u32;

    let (text_content, tool_calls) = if has_tools {
        parse_tool_calls(&result.text)
    } else {
        (Some(result.text.clone()), vec![])
    };

    if req.stream {
        let chunks = vec![
            ChatCompletionChunk {
                id: request_id.clone(),
                object: "chat.completion.chunk".to_string(),
                created: now_ts(),
                model: MODEL_ID.to_string(),
                choices: vec![StreamChoice {
                    index: 0,
                    delta: Delta {
                        role: Some("assistant".to_string()),
                        content: None,
                        tool_calls: None,
                    },
                    finish_reason: None,
                }],
            },
            ChatCompletionChunk {
                id: request_id.clone(),
                object: "chat.completion.chunk".to_string(),
                created: now_ts(),
                model: MODEL_ID.to_string(),
                choices: vec![StreamChoice {
                    index: 0,
                    delta: Delta {
                        role: None,
                        content: text_content.clone(),
                        tool_calls: if tool_calls.is_empty() {
                            None
                        } else {
                            Some(tool_calls.clone())
                        },
                    },
                    finish_reason: None,
                }],
            },
            ChatCompletionChunk {
                id: request_id.clone(),
                object: "chat.completion.chunk".to_string(),
                created: now_ts(),
                model: MODEL_ID.to_string(),
                choices: vec![StreamChoice {
                    index: 0,
                    delta: Delta {
                        role: None,
                        content: None,
                        tool_calls: None,
                    },
                    finish_reason: Some(
                        if tool_calls.is_empty() {
                            "stop"
                        } else {
                            "tool_calls"
                        }
                        .to_string(),
                    ),
                }],
            },
        ];

        let stream = tokio_stream::iter(chunks.into_iter().map(|c| {
            Ok::<_, Infallible>(Event::default().data(serde_json::to_string(&c).unwrap()))
        }))
        .chain(tokio_stream::once(Ok(Event::default().data("[DONE]"))));

        Ok(Sse::new(stream)
            .keep_alive(axum::response::sse::KeepAlive::default())
            .into_response())
    } else {
        let finish_reason = if tool_calls.is_empty() {
            "stop"
        } else {
            "tool_calls"
        };
        Ok(Json(ChatCompletionResponse {
            id: request_id,
            object: "chat.completion".to_string(),
            created: now_ts(),
            model: MODEL_ID.to_string(),
            choices: vec![Choice {
                index: 0,
                message: ResponseMessage {
                    role: "assistant".to_string(),
                    content: text_content,
                    tool_calls: if tool_calls.is_empty() {
                        None
                    } else {
                        Some(tool_calls)
                    },
                },
                finish_reason: finish_reason.to_string(),
            }],
            usage: Usage {
                prompt_tokens: est_prompt_tokens,
                completion_tokens: est_completion_tokens,
                total_tokens: est_prompt_tokens + est_completion_tokens,
            },
        })
        .into_response())
    }
}

// ─── TODO extraction endpoint ───────────────────────────────────────────────

async fn extract_todos(
    Json(req): Json<ExtractRequest>,
) -> Result<Json<ExtractResponse>, (StatusCode, Json<serde_json::Value>)> {
    let start = std::time::Instant::now();
    let chunk_size = req.chunk_size;

    // Step 1: Pre-filter each input chunk for action-oriented content
    let mut total_input_chars = 0usize;
    let mut filtered_input_chars = 0usize;
    let mut all_filtered_text = String::new();

    for raw_chunk in &req.chunks {
        total_input_chars += raw_chunk.len();
        let (filtered, _original_len) = prefilter_for_actions(raw_chunk);
        filtered_input_chars += filtered.len();
        if !filtered.is_empty() {
            if !all_filtered_text.is_empty() {
                all_filtered_text.push_str("\n---\n");
            }
            all_filtered_text.push_str(&filtered);
        }
    }

    eprintln!(
        "[fm-server] extract: {} input chars → {} after pre-filter ({:.0}% reduction), chunk_size={}",
        total_input_chars,
        filtered_input_chars,
        if total_input_chars > 0 {
            (1.0 - filtered_input_chars as f64 / total_input_chars as f64) * 100.0
        } else {
            0.0
        },
        chunk_size
    );

    if all_filtered_text.is_empty() {
        return Ok(Json(ExtractResponse {
            items: vec![],
            stats: ExtractStats {
                chunks_processed: 0,
                chunks_with_results: 0,
                total_input_chars,
                filtered_input_chars: 0,
                total_time_ms: start.elapsed().as_millis() as f64,
                pre_filter_ratio: 1.0,
            },
        }));
    }

    // Step 2: Re-chunk the filtered text into model-sized pieces
    let chunks = chunk_text(&all_filtered_text, chunk_size);
    let num_chunks = chunks.len();

    eprintln!(
        "[fm-server] extract: processing {} chunks",
        num_chunks
    );

    // Step 3: Process each chunk with generate_json (schema-constrained)
    let mut all_items: Vec<TodoItem> = Vec::new();
    let mut chunks_with_results = 0usize;

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
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": {"message": e.to_string()}})),
            )
        })?;

        match result {
            Ok(gen_result) => {
                eprintln!(
                    "[fm-server] extract chunk {}/{}: {:.0}ms, {} chars",
                    i + 1,
                    num_chunks,
                    gen_result.metrics.total_time_ms,
                    gen_result.text.len()
                );

                // Parse JSON from the text response (model returns JSON array)
                let text = gen_result.text.trim();
                // Strip markdown code fences if present
                let json_text = if text.starts_with("```") {
                    text.lines()
                        .skip(1)
                        .take_while(|l| !l.starts_with("```"))
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    text.to_string()
                };

                // Try parsing as array directly, or as object with "items" key
                let items_result: Option<Vec<TodoItem>> = serde_json::from_str(&json_text)
                    .ok()
                    .or_else(|| {
                        // Try as {"items": [...]}
                        serde_json::from_str::<serde_json::Value>(&json_text)
                            .ok()
                            .and_then(|v| v.get("items").cloned())
                            .and_then(|v| serde_json::from_value(v).ok())
                    });

                if let Some(chunk_items) = items_result {
                    let valid_items: Vec<TodoItem> = chunk_items
                        .into_iter()
                        .filter(|item| !item.text.trim().is_empty())
                        .collect();
                    if !valid_items.is_empty() {
                        chunks_with_results += 1;
                        all_items.extend(valid_items);
                    }
                } else {
                    eprintln!(
                        "[fm-server] extract chunk {}/{}: failed to parse JSON: {}",
                        i + 1,
                        num_chunks,
                        &json_text[..json_text.len().min(200)]
                    );
                }
            }
            Err(e) => {
                eprintln!(
                    "[fm-server] extract chunk {}/{} failed: {}",
                    i + 1,
                    num_chunks,
                    e
                );
                // Continue processing other chunks
            }
        }
    }

    // Step 4: Deduplicate
    let deduped = dedup_todos(all_items);

    let elapsed = start.elapsed().as_millis() as f64;
    eprintln!(
        "[fm-server] extract done: {} items from {} chunks in {:.0}ms",
        deduped.len(),
        num_chunks,
        elapsed
    );

    Ok(Json(ExtractResponse {
        items: deduped,
        stats: ExtractStats {
            chunks_processed: num_chunks,
            chunks_with_results,
            total_input_chars,
            filtered_input_chars,
            total_time_ms: elapsed,
            pre_filter_ratio: if total_input_chars > 0 {
                1.0 - filtered_input_chars as f64 / total_input_chars as f64
            } else {
                0.0
            },
        },
    }))
}

async fn health() -> Json<serde_json::Value> {
    let avail = check_availability();
    Json(serde_json::json!({
        "status": if avail == Availability::Available { "ok" } else { "unavailable" },
        "model": MODEL_ID,
        "endpoints": ["/v1/chat/completions", "/v1/models", "/v1/extract-todos", "/health"]
    }))
}

#[tokio::main]
async fn main() {
    let avail = check_availability();
    eprintln!("Foundation Models: {}", avail);
    if avail != Availability::Available {
        eprintln!("ERROR: Apple Intelligence not available. Enable in System Settings.");
        std::process::exit(1);
    }

    eprint!("Prewarming...");
    let _ = prewarm();
    eprintln!(" done");

    let app = Router::new()
        .route("/v1/chat/completions", post(chat_completions))
        .route("/v1/extract-todos", post(extract_todos))
        .route("/v1/models", get(list_models))
        .route("/health", get(health));

    let port = std::env::var("FM_PORT").unwrap_or_else(|_| "5273".to_string());
    eprintln!("\n🧠 Apple Intelligence API at http://localhost:{}/v1", port);
    eprintln!("   Model: {}", MODEL_NAME);
    eprintln!("   Endpoints:");
    eprintln!("     POST /v1/chat/completions  (OpenAI-compatible)");
    eprintln!("     POST /v1/extract-todos     (TODO extraction)");
    eprintln!("     GET  /v1/models");
    eprintln!("     GET  /health\n");

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();
    axum::serve(listener, app).await.unwrap();
}
