---
name: release
description: "Release the screenpipe monorepo. Bumps versions, triggers GitHub Actions for app, CLI, MCP, and JS packages."
allowed-tools: Bash, Read, Edit, Grep
---

# Screenpipe Monorepo Release Skill

Automate releasing all components of the screenpipe monorepo.

## Components & Versions

| Component | Version File | Current Pattern | Workflow |
|-----------|--------------|-----------------|----------|
| Desktop App | `screenpipe-app-tauri/src-tauri/Cargo.toml` | `version = "X.Y.Z"` | `release-app.yml` |
| CLI/Server | `Cargo.toml` (workspace.package) | `version = "0.2.X"` | `release-cli.yml` |
| MCP | `screenpipe-integrations/screenpipe-mcp/package.json` | `"version": "X.Y.Z"` | `release-mcp.yml` |
| JS Browser SDK | `screenpipe-js/browser-sdk/package.json` | `"version": "X.Y.Z"` | npm publish |
| JS Node SDK | `screenpipe-js/node-sdk/package.json` | `"version": "X.Y.Z"` | npm publish |
| JS CLI | `screenpipe-js/cli/package.json` | `"version": "X.Y.Z"` | npm publish |

## Release Commands

### 1. Check Current Versions
```bash
echo "=== App ===" && grep '^version' screenpipe-app-tauri/src-tauri/Cargo.toml | head -1
echo "=== CLI ===" && grep '^version' Cargo.toml | head -1
echo "=== MCP ===" && grep '"version"' screenpipe-integrations/screenpipe-mcp/package.json
echo "=== JS Browser ===" && grep '"version"' screenpipe-js/browser-sdk/package.json
echo "=== JS Node ===" && grep '"version"' screenpipe-js/node-sdk/package.json
echo "=== JS CLI ===" && grep '"version"' screenpipe-js/cli/package.json
```

### 2. Bump Versions (edit files)
Use Edit tool to update version strings in the files listed above.

### 3. Commit & Push
```bash
git add -A
git commit -m "Bump versions: App vX.Y.Z, CLI v0.2.X, MCP vX.Y.Z"
git pull --rebase
git push
```

### 4. Trigger Releases

**Desktop App (macOS + Windows):**
```bash
gh workflow run release-app.yml
```

**CLI (all platforms):**
```bash
gh workflow run release-cli.yml
```

**MCP:**
```bash
gh workflow run release-mcp.yml
```

### 5. Monitor Build Status
```bash
# List recent runs
gh run list --limit 5

# Check specific run
gh run view <RUN_ID> --json status,conclusion,jobs --jq '{status: .status, conclusion: .conclusion, jobs: [.jobs[] | {name: (.name | split(",")[0]), status: .status, conclusion: .conclusion}]}'
```

## Quick Release (App Only)

Most common release - just the desktop app:

```bash
# 1. Bump app version (edit Cargo.toml)
# 2. Commit and push
git add -A && git commit -m "Bump app to vX.Y.Z" && git pull --rebase && git push

# 3. Trigger release
gh workflow run release-app.yml

# 4. Monitor
sleep 5 && gh run list --workflow=release-app.yml --limit=1
```

## Full Monorepo Release

Release everything:

```bash
# Trigger all release workflows
gh workflow run release-app.yml
gh workflow run release-cli.yml
gh workflow run release-mcp.yml

# Monitor all
gh run list --limit 10
```

## Build Status Table Format

When reporting status, use this format:

```
Build <RUN_ID>:
| Platform | Status |
|----------|--------|
| macOS aarch64 | ✅ success / 🔄 in_progress / ❌ failure |
| macOS x86_64 | ✅ success / 🔄 in_progress / ❌ failure |
| Windows | ✅ success / 🔄 in_progress / ❌ failure |
```

## Troubleshooting

### Build Failed
```bash
# Get failed job logs
gh run view <RUN_ID> --log-failed

# Or check specific job
gh run view --job=<JOB_ID> 2>&1 | tail -50
```

### Cancel Running Build
```bash
gh run cancel <RUN_ID>
```

### Re-run Failed Jobs
```bash
gh run rerun <RUN_ID> --failed
```

## Notes

- Linux desktop app is disabled (bundling issues)
- App builds take ~25-35 minutes
- CLI builds take ~15-20 minutes
- Always pull before push to avoid conflicts
- Sentry DSNs are configured for: app, cli, ai-proxy
