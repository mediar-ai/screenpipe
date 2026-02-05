# screenpipe-apple-intelligence

On-device AI processing for screenpipe using Apple's Foundation Models framework (macOS 26+).

**Zero cloud. Zero privacy concerns. All processing happens locally on Apple Silicon.**

## What is this?

This crate provides Rust bindings to Apple's [Foundation Models](https://developer.apple.com/documentation/foundationmodels) framework via a Swift FFI bridge. Foundation Models is the on-device LLM that powers Apple Intelligence — available on macOS 26+ with Apple Silicon (M1+).

### Why?

Screenpipe records everything on your screen and audio. Processing this data with AI to extract action items, summaries, and insights currently requires sending data to cloud APIs. Foundation Models lets us do this **entirely on-device** — your data never leaves your machine.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Rust (screenpipe-apple-intelligence)       │
│  ├── engine.rs   — Safe public API          │
│  └── ffi.rs      — Raw FFI declarations     │
│         │                                   │
│         │ C FFI (@_cdecl)                   │
│         ▼                                   │
│  Swift (swift/bridge.swift)                 │
│  ├── Wraps LanguageModelSession             │
│  ├── Handles async → sync (semaphore)       │
│  └── Memory measurement (mach_task_info)    │
│         │                                   │
│         ▼                                   │
│  Apple Foundation Models Framework          │
│  └── On-device LLM (Apple Silicon NPU)     │
└─────────────────────────────────────────────┘
```

## Requirements

- **macOS 26.0+** (Tahoe)
- **Apple Silicon** (M1, M2, M3, M4)
- **Apple Intelligence enabled** in System Settings
- **Xcode 26+** (for compilation)

## API

### Check availability

```rust
use screenpipe_apple_intelligence::{check_availability, Availability};

match check_availability() {
    Availability::Available => println!("Ready!"),
    Availability::AppleIntelligenceNotEnabled => println!("Enable in System Settings"),
    Availability::DeviceNotEligible => println!("Need Apple Silicon"),
    Availability::ModelNotReady => println!("Model still downloading"),
    _ => {}
}
```

### Generate text

```rust
use screenpipe_apple_intelligence::generate_text;

let result = generate_text(
    Some("You extract action items from screen activity."),
    "User was in VS Code editing auth.rs, then Slack discussing deadline Friday..."
).unwrap();

println!("{}", result.text);
println!("Time: {:.0}ms, Memory delta: {:.1}MB",
    result.metrics.total_time_ms,
    result.metrics.mem_delta_bytes as f64 / 1_048_576.0);
```

### Generate structured JSON

```rust
use screenpipe_apple_intelligence::generate_json;

let schema = r#"{"type":"object","properties":{"items":{"type":"array","items":{"type":"string"}},"summary":{"type":"string"}}}"#;
let result = generate_json(Some("Extract todos."), "...", schema).unwrap();
println!("{}", result.json);
```

### Query screenpipe data (feature: `screenpipe-query`)

```rust
// Fetches recent data from screenpipe HTTP API and processes with Foundation Models
let result = query_screenpipe_with_ai(3030, "What did I work on today?", 6).await?;
```

## Running tests

```bash
# All tests gracefully skip if Apple Intelligence is not available
cargo test -p screenpipe-apple-intelligence -- --nocapture
```

## Benchmark results

Run the benchmark test to get numbers for your machine:

```bash
cargo test -p screenpipe-apple-intelligence test_benchmark -- --nocapture
```

Expected metrics (when Apple Intelligence is available):
- **Prewarm**: ~100-500ms (loads model assets)
- **Short prompt**: ~500-2000ms
- **Medium prompt**: ~1000-3000ms
- **Long context (~500 tokens)**: ~2000-5000ms
- **Memory delta**: ~50-200MB during generation (released after)
- **Back-to-back latency**: Decreases after first request (model stays warm)

## Future work

- [ ] Streaming responses (token-by-token)
- [ ] Custom adapters (fine-tuned models via `SystemLanguageModel.Adapter`)
- [ ] Content tagging use case (`SystemLanguageModel.UseCase.contentTagging`)
- [ ] Integration with screenpipe notification system (daily digest at 6pm)
- [ ] Background processing scheduler (every N hours)
