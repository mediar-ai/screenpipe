# CLAUDE.md

## Package Manager
- Use `bun` for JS/TS (not npm or pnpm)
- Use `cargo` for Rust

## Key Directories
- `apps/screenpipe-app-tauri/` - Desktop app (Tauri + Next.js)
- `crates/screenpipe-server/` - Core backend (Rust)
- `crates/screenpipe-audio/` - Audio capture/transcription (Rust)
- `crates/screenpipe-vision/` - Screen capture/OCR (Rust)

## Analytics
- PostHog API key: source from `.env.local` (gitignored)
- Project ID: 27525
- Host: eu.i.posthog.com

## Testing
- `cargo test` for Rust
- `bun test` for JS/TS
- **Regression checklist**: `TESTING.md` — must-read before changing window management, tray/dock, monitors, audio, or Apple Intelligence. Lists every edge case that has caused regressions with commit references.

## macOS Dev Builds
- Dev builds are signed with a developer certificate for consistent permissions
- Config: `apps/screenpipe-app-tauri/src-tauri/tauri.conf.json` → `bundle.macOS.signingIdentity`
- This ensures macOS TCC recognizes the app across rebuilds (permissions persist)
- Other devs without the cert will see permission issues - onboarding has "continue anyway" button after 5s
