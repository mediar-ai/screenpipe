---
name: release
description: "Release the screenpipe monorepo. Bumps versions, generates changelog, triggers GitHub Actions for app, CLI, MCP, and JS packages."
allowed-tools: Bash, Read, Edit, Grep, Write
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

## Release Workflow

### 1. Check Current Versions
```bash
echo "=== App ===" && grep '^version' screenpipe-app-tauri/src-tauri/Cargo.toml | head -1
echo "=== CLI ===" && grep '^version' Cargo.toml | head -1
echo "=== MCP ===" && grep '"version"' screenpipe-integrations/screenpipe-mcp/package.json | head -1
```

### 2. Generate Changelog

Get commits since last release and generate a user-friendly changelog:

```bash
# Get last release tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# Get commits since last release (or last 50 if no tag)
if [ -n "$LAST_TAG" ]; then
  git log $LAST_TAG..HEAD --oneline --no-merges
else
  git log -50 --oneline --no-merges
fi
```

Then create changelog at `content/changelogs/vX.Y.Z.md` with format:

```markdown
## New Features
- Feature description (from commit context)

## Improvements
- Improvement description

## Bug Fixes
- Fix description

#### **Full Changelog:** [abc123..def456](https://github.com/mediar-ai/screenpipe/compare/abc123..def456)
```

Guidelines:
- Only include changes that bring clear **customer value**
- Skip: CI changes, refactors, dependency bumps, merge commits
- Be concise but descriptive
- Group related changes together

Also copy to `screenpipe-app-tauri/public/CHANGELOG.md` for in-app display.

### 3. Bump Version

Edit `screenpipe-app-tauri/src-tauri/Cargo.toml` to update version.

### 4. Commit & Push
```bash
git add -A && git commit -m "Bump app to vX.Y.Z" && git pull --rebase && git push
```

### 5. Trigger Release (Draft Only)
```bash
gh workflow run release-app.yml
```

**Important**: `workflow_dispatch` creates a **draft only** - does NOT auto-publish. This allows manual testing before publishing.

### 6. Monitor Build Status
```bash
# Get latest run ID
gh run list --workflow=release-app.yml --limit=1

# Check status
gh run view <RUN_ID> --json status,conclusion,jobs --jq '{status: .status, conclusion: .conclusion, jobs: [.jobs[] | {name: (.name | split(",")[0]), status: .status, conclusion: .conclusion}]}'
```

### 7. Test the Draft Release
- Download from CrabNebula Cloud: https://web.crabnebula.cloud/mediar/screenpipe/releases
- Test on macOS and Windows
- Verify updater artifacts exist (.tar.gz, .sig files)

### 8. Publish Release
After testing, publish manually via CrabNebula Cloud dashboard, OR commit with magic words:
```bash
git commit --allow-empty -m "release-app-publish" && git push
```

## Quick Release (App Only)

```bash
# 1. Generate changelog (Claude does this)
# 2. Bump version in Cargo.toml
# 3. Commit and push
git add -A && git commit -m "Bump app to vX.Y.Z" && git push

# 4. Trigger release (draft)
gh workflow run release-app.yml

# 5. Monitor
sleep 5 && gh run list --workflow=release-app.yml --limit=1
```

## Build Status Format

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
gh run view <RUN_ID> --log-failed 2>&1 | tail -100
```

### Cancel Running Build
```bash
gh run cancel <RUN_ID>
```

### Re-run Failed Jobs
```bash
gh run rerun <RUN_ID> --failed
```

### Missing Updater Artifacts (.tar.gz, .sig)
The CI copies `tauri.prod.conf.json` to `tauri.conf.json` before building. If artifacts are missing:
1. Check `tauri.prod.conf.json` has `"createUpdaterArtifacts": true`
2. Check the "Use production config" step ran successfully

## Configuration

### Dev vs Prod Configs
- `tauri.conf.json` - Dev config (identifier: `screenpi.pe.dev`)
- `tauri.prod.conf.json` - Prod config (identifier: `screenpi.pe`, updater enabled)

CI automatically uses prod config for releases by copying it before build.

### Auto-Publish Behavior
- `workflow_dispatch` (manual trigger) → Draft only, no publish
- Commit with "release-app-publish" → Auto-publish after successful build

## Notes

- Linux desktop app is disabled (bundling issues)
- App builds take ~25-35 minutes
- CLI builds take ~15-20 minutes
- Always pull before push to avoid conflicts
- Updater artifacts: macOS uses `.tar.gz`/`.sig`, Windows uses `.nsis.zip`/`.sig`
