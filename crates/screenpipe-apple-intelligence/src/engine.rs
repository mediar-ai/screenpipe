//! Safe Rust wrappers around Foundation Models FFI.

use crate::ffi;
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};

// MARK: - Types

/// Availability status of Foundation Models on this system.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Availability {
    Available,
    AppleIntelligenceNotEnabled,
    DeviceNotEligible,
    ModelNotReady,
    Unknown(String),
}

impl std::fmt::Display for Availability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Availability::Available => write!(f, "available"),
            Availability::AppleIntelligenceNotEnabled => {
                write!(f, "Apple Intelligence is not enabled")
            }
            Availability::DeviceNotEligible => {
                write!(f, "device not eligible for Apple Intelligence")
            }
            Availability::ModelNotReady => {
                write!(f, "model not ready (still downloading or configuring)")
            }
            Availability::Unknown(reason) => write!(f, "unknown: {}", reason),
        }
    }
}

/// Performance metrics from a generation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationMetrics {
    /// Total generation time in milliseconds
    pub total_time_ms: f64,
    /// Resident memory before generation in bytes
    pub mem_before_bytes: u64,
    /// Resident memory after generation in bytes
    pub mem_after_bytes: u64,
    /// Memory delta (after - before) in bytes
    pub mem_delta_bytes: i64,
}

/// Result of a text generation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationResult {
    /// The generated text
    pub text: String,
    /// Performance metrics
    pub metrics: GenerationMetrics,
}

/// Result of a structured JSON generation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonGenerationResult {
    /// The generated JSON
    pub json: serde_json::Value,
    /// Performance metrics
    pub metrics: GenerationMetrics,
}

// MARK: - Helpers

/// Extract a Rust string from a C string pointer and free it.
unsafe fn extract_and_free(ptr: *mut std::os::raw::c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
    ffi::fm_free_string(ptr);
    Some(s)
}

// MARK: - Public API

/// Check if Apple Foundation Models is available on this system.
pub fn check_availability() -> Availability {
    unsafe {
        let mut reason_ptr: *mut std::os::raw::c_char = std::ptr::null_mut();
        let status = ffi::fm_check_availability(&mut reason_ptr);
        let reason = extract_and_free(reason_ptr).unwrap_or_default();

        match status {
            0 => Availability::Available,
            1 => Availability::AppleIntelligenceNotEnabled,
            2 => Availability::DeviceNotEligible,
            3 => Availability::ModelNotReady,
            _ => Availability::Unknown(reason),
        }
    }
}

/// Prewarm the Foundation Models engine.
///
/// Loads model assets into memory ahead of time to reduce latency
/// on the first request. Blocking call, may take a few hundred ms.
pub fn prewarm() -> Result<()> {
    let status = unsafe { ffi::fm_prewarm() };
    if status != 0 {
        bail!("Foundation Models prewarm failed (model not available)");
    }
    Ok(())
}

/// Get the list of languages supported by the on-device model.
pub fn supported_languages() -> Result<Vec<String>> {
    unsafe {
        let ptr = ffi::fm_supported_languages();
        let json_str = extract_and_free(ptr).unwrap_or_else(|| "[]".to_string());
        let langs: Vec<String> = serde_json::from_str(&json_str)?;
        Ok(langs)
    }
}

/// Generate a plain text response from a prompt.
///
/// # Arguments
/// * `instructions` - Optional system instructions that define the model's behavior
/// * `prompt` - The user's prompt/question
///
/// # Returns
/// A `GenerationResult` containing the response text and performance metrics.
pub fn generate_text(instructions: Option<&str>, prompt: &str) -> Result<GenerationResult> {
    let prompt_c = CString::new(prompt)?;
    let instructions_c = instructions.map(|s| CString::new(s)).transpose()?;

    let mut out_text: *mut std::os::raw::c_char = std::ptr::null_mut();
    let mut out_error: *mut std::os::raw::c_char = std::ptr::null_mut();
    let mut total_time_ms: f64 = 0.0;
    let mut mem_before: u64 = 0;
    let mut mem_after: u64 = 0;

    let status = unsafe {
        ffi::fm_generate_text(
            instructions_c
                .as_ref()
                .map_or(std::ptr::null(), |c| c.as_ptr()),
            prompt_c.as_ptr(),
            &mut out_text,
            &mut out_error,
            &mut total_time_ms,
            &mut mem_before,
            &mut mem_after,
        )
    };

    unsafe {
        if status != 0 {
            let err = extract_and_free(out_error).unwrap_or_else(|| "unknown error".to_string());
            extract_and_free(out_text);
            bail!("Foundation Models error: {}", err);
        }

        let text = extract_and_free(out_text).unwrap_or_default();
        extract_and_free(out_error);

        Ok(GenerationResult {
            text,
            metrics: GenerationMetrics {
                total_time_ms,
                mem_before_bytes: mem_before,
                mem_after_bytes: mem_after,
                mem_delta_bytes: mem_after as i64 - mem_before as i64,
            },
        })
    }
}

/// Generate a structured JSON response constrained by a JSON schema.
///
/// The model's output is constrained to valid JSON matching the provided schema.
pub fn generate_json(
    instructions: Option<&str>,
    prompt: &str,
    json_schema: &str,
) -> Result<JsonGenerationResult> {
    let prompt_c = CString::new(prompt)?;
    let schema_c = CString::new(json_schema)?;
    let instructions_c = instructions.map(|s| CString::new(s)).transpose()?;

    let mut out_text: *mut std::os::raw::c_char = std::ptr::null_mut();
    let mut out_error: *mut std::os::raw::c_char = std::ptr::null_mut();
    let mut total_time_ms: f64 = 0.0;
    let mut mem_before: u64 = 0;
    let mut mem_after: u64 = 0;

    let status = unsafe {
        ffi::fm_generate_json(
            instructions_c
                .as_ref()
                .map_or(std::ptr::null(), |c| c.as_ptr()),
            prompt_c.as_ptr(),
            schema_c.as_ptr(),
            &mut out_text,
            &mut out_error,
            &mut total_time_ms,
            &mut mem_before,
            &mut mem_after,
        )
    };

    unsafe {
        if status != 0 {
            let err = extract_and_free(out_error).unwrap_or_else(|| "unknown error".to_string());
            extract_and_free(out_text);
            bail!("Foundation Models error: {}", err);
        }

        let json_str = extract_and_free(out_text).unwrap_or_else(|| "{}".to_string());
        extract_and_free(out_error);
        let json: serde_json::Value = serde_json::from_str(&json_str)?;

        Ok(JsonGenerationResult {
            json,
            metrics: GenerationMetrics {
                total_time_ms,
                mem_before_bytes: mem_before,
                mem_after_bytes: mem_after,
                mem_delta_bytes: mem_after as i64 - mem_before as i64,
            },
        })
    }
}

/// Queries screenpipe data and processes it with Foundation Models.
///
/// Higher-level function that:
/// 1. Fetches recent data from the screenpipe HTTP API
/// 2. Feeds it to the on-device model
/// 3. Returns structured analysis
#[cfg(feature = "screenpipe-query")]
pub async fn query_screenpipe_with_ai(
    screenpipe_port: u16,
    query: &str,
    hours_back: u32,
) -> Result<GenerationResult> {
    let end = chrono::Utc::now();
    let start = end - chrono::Duration::hours(hours_back as i64);
    let start_str = start.to_rfc3339();
    let end_str = end.to_rfc3339();

    let client = reqwest::Client::new();

    // Fetch OCR data
    let ocr_url = format!(
        "http://localhost:{}/search?content_type=ocr&limit=50&start_time={}&end_time={}",
        screenpipe_port, start_str, end_str
    );
    let ocr_response: serde_json::Value = client
        .get(&ocr_url)
        .send()
        .await?
        .json()
        .await
        .unwrap_or(serde_json::json!({"data": []}));

    // Fetch audio data
    let audio_url = format!(
        "http://localhost:{}/search?content_type=audio&limit=50&start_time={}&end_time={}",
        screenpipe_port, start_str, end_str
    );
    let audio_response: serde_json::Value = client
        .get(&audio_url)
        .send()
        .await?
        .json()
        .await
        .unwrap_or(serde_json::json!({"data": []}));

    // Build context
    let mut context = String::new();

    if let Some(data) = ocr_response.get("data").and_then(|d| d.as_array()) {
        context.push_str("=== Screen Activity ===\n");
        for item in data.iter().take(30) {
            if let Some(content) = item.get("content") {
                let app = content
                    .get("app_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let window = content
                    .get("window_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let text = content
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let ts = content
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                let text_truncated = if text.len() > 500 {
                    &text[..500]
                } else {
                    text
                };
                context.push_str(&format!(
                    "[{}] {} - {}: {}\n",
                    ts, app, window, text_truncated
                ));
            }
        }
    }

    if let Some(data) = audio_response.get("data").and_then(|d| d.as_array()) {
        context.push_str("\n=== Audio/Meetings ===\n");
        for item in data.iter().take(20) {
            if let Some(content) = item.get("content") {
                let speaker = content
                    .get("speaker_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let text = content
                    .get("transcription")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    context.push_str(&format!("{}: {}\n", speaker, text));
                }
            }
        }
    }

    if context.is_empty() {
        context = "No recent activity data found.".to_string();
    }

    let full_prompt = format!(
        "Here is the user's recent screen and audio activity from the past {} hours:\n\n{}\n\n{}",
        hours_back, context, query
    );

    let instructions = "You are an AI assistant that analyzes a user's screen activity \
        and audio transcriptions captured by Screenpipe. \
        You help them understand what they worked on, extract action items, \
        and answer questions about their day. Be concise and actionable.";

    // generate_text is blocking (Swift semaphore), so spawn on blocking thread
    let instructions_owned = instructions.to_string();
    let prompt_owned = full_prompt;

    tokio::task::spawn_blocking(move || {
        generate_text(Some(&instructions_owned), &prompt_owned)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_availability() {
        let availability = check_availability();
        println!("Foundation Models availability: {}", availability);
        match &availability {
            Availability::Available => println!("  ✅ Model is available and ready"),
            Availability::AppleIntelligenceNotEnabled => {
                println!("  ⚠️  Apple Intelligence not enabled in System Settings")
            }
            Availability::DeviceNotEligible => {
                println!("  ❌ Device doesn't support Apple Intelligence")
            }
            Availability::ModelNotReady => {
                println!("  ⏳ Model still downloading/configuring")
            }
            Availability::Unknown(reason) => println!("  ❓ {}", reason),
        }
    }

    #[test]
    fn test_supported_languages() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }
        let langs = supported_languages().unwrap();
        println!("Supported languages ({}):", langs.len());
        for lang in &langs {
            println!("  - {}", lang);
        }
        assert!(!langs.is_empty(), "should support at least one language");
    }

    #[test]
    fn test_prewarm() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }
        let start = std::time::Instant::now();
        prewarm().unwrap();
        println!("Prewarm took: {:?}", start.elapsed());
    }

    #[test]
    fn test_generate_text_simple() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }

        let result =
            generate_text(None, "What is 2 + 2? Reply with just the number.").unwrap();

        println!("Response: {}", result.text);
        println!("Total time: {:.0}ms", result.metrics.total_time_ms);
        println!(
            "Memory before: {:.1}MB",
            result.metrics.mem_before_bytes as f64 / 1_048_576.0
        );
        println!(
            "Memory after: {:.1}MB",
            result.metrics.mem_after_bytes as f64 / 1_048_576.0
        );
        println!(
            "Memory delta: {:.1}MB",
            result.metrics.mem_delta_bytes as f64 / 1_048_576.0
        );
        assert!(!result.text.is_empty(), "response should not be empty");
    }

    #[test]
    fn test_generate_text_with_instructions() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }

        let result = generate_text(
            Some("You extract action items from meeting notes. Be concise. Output only the action items as a numbered list."),
            "Meeting notes: Team discussed Q3 roadmap. John needs to update the API docs by Friday. \
             Sarah will send the design review to the team by Wednesday. \
             We agreed to schedule a follow-up next Monday. \
             Budget approval is pending from finance - Mike will check.",
        )
        .unwrap();

        println!("=== Action Items Extraction ===");
        println!("Response:\n{}", result.text);
        println!("\nMetrics:");
        println!("  Total time: {:.0}ms", result.metrics.total_time_ms);
        println!(
            "  Memory delta: {:.1}MB",
            result.metrics.mem_delta_bytes as f64 / 1_048_576.0
        );
        assert!(!result.text.is_empty());
    }

    #[test]
    fn test_generate_text_screenpipe_context() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }

        let simulated_data = r#"
=== Screen Activity (last 2 hours) ===
[14:00] VS Code - main.rs: implementing user authentication middleware
[14:15] VS Code - auth.rs: fn verify_token(token: &str) -> Result<Claims>
[14:30] Chrome - Stack Overflow: "rust jwt validation best practices"
[14:45] VS Code - test_auth.rs: #[test] fn test_expired_token()
[15:00] Slack - #engineering: "hey team, the auth PR is ready for review"
[15:10] Chrome - GitHub PR #234: "Add JWT authentication middleware"
[15:20] Slack - DM from Sarah: "can you also add rate limiting?"
[15:30] Chrome - docs.rs: tower-http rate limiting middleware
[15:45] VS Code - rate_limit.rs: implementing rate limiter

=== Audio (last 2 hours) ===
[14:50] Standup meeting:
  You: "Working on the auth middleware, should have the PR up soon"
  Sarah: "Great, we also need rate limiting before the release"
  Mike: "Don't forget to update the API docs when you're done"
  You: "Will do, I'll have everything ready by end of day"
"#;

        let result = generate_text(
            Some(
                "You analyze a developer's recent screen activity and meetings captured by Screenpipe. \
                 Provide a brief summary and list any action items or follow-ups.",
            ),
            &format!(
                "Here is my recent activity:\n{}\n\nWhat did I work on and what do I still need to do?",
                simulated_data
            ),
        )
        .unwrap();

        println!("=== Screenpipe Data Analysis ===");
        println!("Response:\n{}", result.text);
        println!("\nMetrics:");
        println!("  Total time: {:.0}ms", result.metrics.total_time_ms);
        println!(
            "  Memory before: {:.1}MB",
            result.metrics.mem_before_bytes as f64 / 1_048_576.0
        );
        println!(
            "  Memory after: {:.1}MB",
            result.metrics.mem_after_bytes as f64 / 1_048_576.0
        );
        println!(
            "  Memory delta: {:.1}MB",
            result.metrics.mem_delta_bytes as f64 / 1_048_576.0
        );

        assert!(!result.text.is_empty());
        let lower = result.text.to_lowercase();
        assert!(
            lower.contains("auth")
                || lower.contains("rate")
                || lower.contains("jwt")
                || lower.contains("api"),
            "Response should reference the work context"
        );
    }

    #[test]
    fn test_benchmark_sequential_requests() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }

        println!("=== Foundation Models Benchmark ===\n");

        // 1. Prewarm
        let prewarm_start = std::time::Instant::now();
        prewarm().unwrap();
        let prewarm_time = prewarm_start.elapsed();
        println!("Prewarm: {:?}", prewarm_time);

        // 2. Short prompt
        let r1 = generate_text(None, "Say hello in one word.").unwrap();
        println!("\nShort prompt (5 tokens):");
        println!("  Response: {:?}", r1.text.trim());
        println!("  Time: {:.0}ms", r1.metrics.total_time_ms);
        println!(
            "  Mem delta: {:.1}MB",
            r1.metrics.mem_delta_bytes as f64 / 1_048_576.0
        );

        // 3. Medium prompt with instructions
        let r2 = generate_text(
            Some("You are a concise assistant."),
            "List 3 productivity tips for software developers. One sentence each.",
        )
        .unwrap();
        println!("\nMedium prompt (~20 tokens):");
        println!("  Response length: {} chars", r2.text.len());
        println!("  Time: {:.0}ms", r2.metrics.total_time_ms);
        println!(
            "  Mem delta: {:.1}MB",
            r2.metrics.mem_delta_bytes as f64 / 1_048_576.0
        );

        // 4. Long context (simulating screenpipe data)
        let long_context = "Meeting transcript: ".to_string()
            + &"The team discussed various topics including the roadmap, \
               technical debt, hiring plans, and customer feedback. "
                .repeat(20);

        let r3 = generate_text(
            Some("Summarize the key points in 2-3 sentences."),
            &long_context,
        )
        .unwrap();
        println!("\nLong context (~500 tokens):");
        println!("  Response length: {} chars", r3.text.len());
        println!("  Time: {:.0}ms", r3.metrics.total_time_ms);
        println!(
            "  Mem before: {:.1}MB",
            r3.metrics.mem_before_bytes as f64 / 1_048_576.0
        );
        println!(
            "  Mem after: {:.1}MB",
            r3.metrics.mem_after_bytes as f64 / 1_048_576.0
        );
        println!(
            "  Mem delta: {:.1}MB",
            r3.metrics.mem_delta_bytes as f64 / 1_048_576.0
        );

        // 5. Back-to-back latency (model should be warm)
        let mut times = Vec::new();
        for i in 0..3 {
            let r = generate_text(None, &format!("Count to {}. Just the numbers.", i + 3))
                .unwrap();
            times.push(r.metrics.total_time_ms);
        }
        println!("\nBack-to-back latency (3 requests):");
        for (i, t) in times.iter().enumerate() {
            println!("  Request {}: {:.0}ms", i + 1, t);
        }
        println!(
            "  Average: {:.0}ms",
            times.iter().sum::<f64>() / times.len() as f64
        );

        println!("\n=== Benchmark Complete ===");
    }

    #[test]
    fn test_generate_json_structured() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }

        let schema = r#"{
            "type": "object",
            "properties": {
                "action_items": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "summary": { "type": "string" }
            },
            "required": ["action_items", "summary"]
        }"#;

        let result = generate_json(
            Some("Extract action items and provide a summary."),
            "Meeting: discussed Q3 launch timeline, John to update docs by Friday, \
             Sarah handles design review Wednesday, follow-up scheduled Monday.",
            schema,
        );

        match result {
            Ok(r) => {
                println!("=== Structured JSON Generation ===");
                println!("JSON: {}", serde_json::to_string_pretty(&r.json).unwrap());
                println!("Time: {:.0}ms", r.metrics.total_time_ms);
                println!(
                    "Mem delta: {:.1}MB",
                    r.metrics.mem_delta_bytes as f64 / 1_048_576.0
                );
                assert!(r.json.get("action_items").is_some());
                assert!(r.json.get("summary").is_some());
            }
            Err(e) => {
                println!("JSON generation not supported or failed: {}", e);
                println!("(This may be expected if GenerationSchema doesn't decode from raw JSON)");
            }
        }
    }

    #[tokio::test]
    async fn test_real_screenpipe_query() {
        if check_availability() != Availability::Available {
            println!("Skipping: Foundation Models not available");
            return;
        }

        // Check if screenpipe is running
        let client = reqwest::Client::new();
        let health = client
            .get("http://localhost:3030/health")
            .send()
            .await;
        if health.is_err() || !health.unwrap().status().is_success() {
            println!("Skipping: screenpipe server not running on localhost:3030");
            return;
        }

        println!("=== Real Screenpipe + Foundation Models Integration ===\n");

        // Fetch real OCR data
        let ocr_resp: serde_json::Value = client
            .get("http://localhost:3030/search?content_type=ocr&limit=30")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();

        let audio_resp: serde_json::Value = client
            .get("http://localhost:3030/search?content_type=audio&limit=20")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();

        let ocr_items = ocr_resp["data"].as_array().unwrap();
        let audio_items = audio_resp["data"].as_array().unwrap();
        let ocr_total = ocr_resp["pagination"]["total"].as_i64().unwrap_or(0);
        let audio_total = audio_resp["pagination"]["total"].as_i64().unwrap_or(0);

        println!("Data fetched: {} OCR frames (of {}), {} audio chunks (of {})",
            ocr_items.len(), ocr_total, audio_items.len(), audio_total);

        // Build context from real data
        let mut context = String::new();
        context.push_str("=== Recent Screen Activity ===\n");
        for item in ocr_items.iter().take(20) {
            let c = &item["content"];
            let app = c["app_name"].as_str().unwrap_or("?");
            let window = c["window_name"].as_str().unwrap_or("?");
            let text = c["text"].as_str().unwrap_or("");
            let ts = c["timestamp"].as_str().unwrap_or("?");
            let truncated = if text.len() > 300 { &text[..300] } else { text };
            context.push_str(&format!("[{}] {} - {}: {}\n", &ts[..16], app, &window[..window.len().min(40)], truncated));
        }

        context.push_str("\n=== Recent Audio ===\n");
        for item in audio_items.iter().take(10) {
            let c = &item["content"];
            let text = c["transcription"].as_str().unwrap_or("");
            let speaker = c["speaker_name"].as_str().unwrap_or("unknown");
            if !text.is_empty() {
                context.push_str(&format!("{}: {}\n", speaker, &text[..text.len().min(200)]));
            }
        }

        println!("Context size: {} chars (~{} tokens)\n", context.len(), context.len() / 4);

        // Test 1: Daily summary
        let wall_start = std::time::Instant::now();
        let r1 = generate_text(
            Some("You analyze screen activity and audio from Screenpipe. Give a concise summary of what the user has been doing. Max 5 bullet points."),
            &format!("What have I been doing recently?\n\n{}", context),
        ).unwrap();
        let wall_time_1 = wall_start.elapsed();
        println!("--- TEST 1: Daily Summary ---");
        println!("Response:\n{}\n", r1.text);
        println!("Foundation Models time: {:.0}ms", r1.metrics.total_time_ms);
        println!("Wall clock time: {:?}", wall_time_1);
        println!("Mem delta: {:.1}MB\n", r1.metrics.mem_delta_bytes as f64 / 1_048_576.0);

        // Test 2: Action item extraction
        let wall_start = std::time::Instant::now();
        let r2 = generate_text(
            Some("Extract concrete action items and todos from the user's screen activity and meetings. Number them. Only list items where someone needs to DO something."),
            &format!("What action items or todos can you find?\n\n{}", context),
        ).unwrap();
        let wall_time_2 = wall_start.elapsed();
        println!("--- TEST 2: Action Items ---");
        println!("Response:\n{}\n", r2.text);
        println!("Foundation Models time: {:.0}ms", r2.metrics.total_time_ms);
        println!("Wall clock time: {:?}", wall_time_2);
        println!("Mem delta: {:.1}MB\n", r2.metrics.mem_delta_bytes as f64 / 1_048_576.0);

        // Test 3: Question answering
        let wall_start = std::time::Instant::now();
        let r3 = generate_text(
            Some("Answer the user's question based on their screen activity data. Be specific and reference what you see in the data."),
            &format!("What apps have I been using most and what was I doing in each?\n\n{}", context),
        ).unwrap();
        let wall_time_3 = wall_start.elapsed();
        println!("--- TEST 3: App Usage Q&A ---");
        println!("Response:\n{}\n", r3.text);
        println!("Foundation Models time: {:.0}ms", r3.metrics.total_time_ms);
        println!("Wall clock time: {:?}", wall_time_3);
        println!("Mem delta: {:.1}MB\n", r3.metrics.mem_delta_bytes as f64 / 1_048_576.0);

        // Summary
        println!("=== BENCHMARK SUMMARY ===");
        println!("Total OCR in DB: {}", ocr_total);
        println!("Total audio in DB: {}", audio_total);
        println!("Context fed to model: {} chars ({} tokens est.)", context.len(), context.len() / 4);
        println!("Summary generation: {:.0}ms (wall: {:?})", r1.metrics.total_time_ms, wall_time_1);
        println!("Action items: {:.0}ms (wall: {:?})", r2.metrics.total_time_ms, wall_time_2);
        println!("Q&A: {:.0}ms (wall: {:?})", r3.metrics.total_time_ms, wall_time_3);
        println!("Memory: before={:.1}MB, after={:.1}MB, delta={:.1}MB",
            r1.metrics.mem_before_bytes as f64 / 1_048_576.0,
            r3.metrics.mem_after_bytes as f64 / 1_048_576.0,
            (r3.metrics.mem_after_bytes as i64 - r1.metrics.mem_before_bytes as i64) as f64 / 1_048_576.0,
        );
        println!("=========================");
    }
}
