# CLAUDE.md

## Package Manager
- Use `bun` for JS/TS (not npm or pnpm)
- Use `cargo` for Rust

## Key Directories
- `screenpipe-app-tauri/` - Desktop app (Tauri + Next.js)
- `screenpipe-server/` - Core backend (Rust)
- `screenpipe-audio/` - Audio capture/transcription (Rust)
- `screenpipe-vision/` - Screen capture/OCR (Rust)

## Analytics
- PostHog API key: source from `.env.local` (gitignored)
- Project ID: 27525
- Host: eu.i.posthog.com

## What NOT to mention
- Pipe store (removed)
- Pipes marketplace (removed)

## Testing
- `cargo test` for Rust
- `bun test` for JS/TS
