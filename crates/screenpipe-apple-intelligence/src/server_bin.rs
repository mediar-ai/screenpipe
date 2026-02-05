//! OpenAI-compatible API server wrapping Apple Foundation Models.
//! Start with: cargo run --features server --bin fm-server
//! Then point any OpenAI-compatible client at http://localhost:5273

use axum::{
    extract::Json,
    http::StatusCode,
    response::{sse::{Event, Sse}, IntoResponse},
    routing::{get, post},
    Router,
};
use screenpipe_apple_intelligence::{check_availability, generate_text, prewarm, Availability};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use tokio_stream::StreamExt as _;

const MODEL_ID: &str = "apple-intelligence";
const MODEL_NAME: &str = "Apple Intelligence (on-device)";

// MARK: - OpenAI-compatible types

#[derive(Debug, Deserialize)]
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

fn default_model() -> String { MODEL_ID.to_string() }

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

// MARK: - Logic

fn build_prompt_from_messages(messages: &[Message], tools: &Option<Vec<ToolDef>>) -> (Option<String>, String) {
    let mut system_parts: Vec<String> = Vec::new();
    let mut conversation: Vec<String> = Vec::new();

    if let Some(tools) = tools {
        let mut tool_desc = String::from("You have access to the following tools:\n\n");
        for tool in tools {
            tool_desc.push_str(&format!("### {}\n", tool.function.name));
            if let Some(desc) = &tool.function.description { tool_desc.push_str(&format!("{}\n", desc)); }
            if let Some(params) = &tool.function.parameters {
                tool_desc.push_str(&format!("Parameters: {}\n", serde_json::to_string(params).unwrap_or_default()));
            }
            tool_desc.push('\n');
        }
        tool_desc.push_str(
            "To call a tool, respond with a JSON block in this exact format:\n\
             ```tool_call\n{\"name\": \"tool_name\", \"arguments\": {\"arg1\": \"value1\"}}\n```\n\n\
             You can call multiple tools. After tool results, continue your response.\n\
             If no tool is needed, respond normally with text."
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
                        serde_json::Value::Array(parts) => {
                            parts.iter().filter_map(|p| {
                                if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    p.get("text").and_then(|t| t.as_str()).map(String::from)
                                } else { None }
                            }).collect::<Vec<_>>().join("\n")
                        }
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
                        conversation.push(format!("Assistant called tool {}: {}", tc.function.name, tc.function.arguments));
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

    let instructions = if system_parts.is_empty() { None } else { Some(system_parts.join("\n\n")) };
    (instructions, conversation.join("\n\n"))
}

fn parse_tool_calls(text: &str) -> (Option<String>, Vec<ToolCall>) {
    let mut tool_calls = Vec::new();
    let mut remaining = String::new();
    let mut in_block = false;
    let mut block = String::new();

    for line in text.lines() {
        if line.trim() == "```tool_call" { in_block = true; block.clear(); continue; }
        if in_block && line.trim() == "```" {
            in_block = false;
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&block) {
                if let (Some(name), Some(args)) = (parsed.get("name").and_then(|n| n.as_str()), parsed.get("arguments")) {
                    tool_calls.push(ToolCall {
                        id: format!("call_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..24]),
                        r#type: "function".to_string(),
                        function: ToolCallFunction { name: name.to_string(), arguments: serde_json::to_string(args).unwrap_or_default() },
                    });
                }
            }
            continue;
        }
        if in_block { block.push_str(line); block.push('\n'); }
        else { remaining.push_str(line); remaining.push('\n'); }
    }

    let content = remaining.trim().to_string();
    (if content.is_empty() { None } else { Some(content) }, tool_calls)
}

fn now_ts() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
}

// MARK: - Handlers

async fn list_models() -> Json<ModelList> {
    Json(ModelList {
        object: "list".to_string(),
        data: vec![ModelInfo { id: MODEL_ID.to_string(), object: "model".to_string(), created: 1700000000, owned_by: "apple".to_string() }],
    })
}

async fn chat_completions(
    Json(req): Json<ChatCompletionRequest>,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let (instructions, prompt) = build_prompt_from_messages(&req.messages, &req.tools);
    let has_tools = req.tools.as_ref().map_or(false, |t| !t.is_empty());
    let prompt_len = prompt.len();

    eprintln!("[fm-server] prompt: {} chars, tools: {}, stream: {}", prompt_len, has_tools, req.stream);

    let result = tokio::task::spawn_blocking(move || generate_text(instructions.as_deref(), &prompt))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": {"message": e.to_string()}}))))?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": {"message": e.to_string()}}))))?;

    eprintln!("[fm-server] response: {} chars, {:.0}ms", result.text.len(), result.metrics.total_time_ms);

    let request_id = format!("chatcmpl-{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..24]);
    let est_prompt_tokens = (prompt_len / 4) as u32;
    let est_completion_tokens = (result.text.len() / 4) as u32;

    let (text_content, tool_calls) = if has_tools { parse_tool_calls(&result.text) } else { (Some(result.text.clone()), vec![]) };

    if req.stream {
        let chunks = vec![
            ChatCompletionChunk {
                id: request_id.clone(), object: "chat.completion.chunk".to_string(), created: now_ts(), model: MODEL_ID.to_string(),
                choices: vec![StreamChoice { index: 0, delta: Delta { role: Some("assistant".to_string()), content: None, tool_calls: None }, finish_reason: None }],
            },
            ChatCompletionChunk {
                id: request_id.clone(), object: "chat.completion.chunk".to_string(), created: now_ts(), model: MODEL_ID.to_string(),
                choices: vec![StreamChoice { index: 0, delta: Delta { role: None, content: text_content.clone(), tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls.clone()) } }, finish_reason: None }],
            },
            ChatCompletionChunk {
                id: request_id.clone(), object: "chat.completion.chunk".to_string(), created: now_ts(), model: MODEL_ID.to_string(),
                choices: vec![StreamChoice { index: 0, delta: Delta { role: None, content: None, tool_calls: None }, finish_reason: Some(if tool_calls.is_empty() { "stop" } else { "tool_calls" }.to_string()) }],
            },
        ];

        let stream = tokio_stream::iter(chunks.into_iter().map(|c| {
            Ok::<_, Infallible>(Event::default().data(serde_json::to_string(&c).unwrap()))
        })).chain(tokio_stream::once(Ok(Event::default().data("[DONE]"))));

        Ok(Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default()).into_response())
    } else {
        let finish_reason = if tool_calls.is_empty() { "stop" } else { "tool_calls" };
        Ok(Json(ChatCompletionResponse {
            id: request_id, object: "chat.completion".to_string(), created: now_ts(), model: MODEL_ID.to_string(),
            choices: vec![Choice {
                index: 0,
                message: ResponseMessage { role: "assistant".to_string(), content: text_content, tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) } },
                finish_reason: finish_reason.to_string(),
            }],
            usage: Usage { prompt_tokens: est_prompt_tokens, completion_tokens: est_completion_tokens, total_tokens: est_prompt_tokens + est_completion_tokens },
        }).into_response())
    }
}

async fn health() -> Json<serde_json::Value> {
    let avail = check_availability();
    Json(serde_json::json!({ "status": if avail == Availability::Available { "ok" } else { "unavailable" }, "model": MODEL_ID }))
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
        .route("/v1/models", get(list_models))
        .route("/health", get(health));

    let port = std::env::var("FM_PORT").unwrap_or_else(|_| "5273".to_string());
    eprintln!("\n🧠 Apple Intelligence API at http://localhost:{}/v1", port);
    eprintln!("   Model: {}\n", MODEL_NAME);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
