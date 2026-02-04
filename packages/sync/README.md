# @screenpipe/sync

**Sync your Screenpipe data to remote AI agents.**

One-liner to sync daily summaries to a remote server (e.g., [OpenClaw](https://github.com/openclaw/openclaw)). Uses Claude Code CLI for AI-powered extraction.

## Quick Start

```bash
# AI summary to stdout
bunx @screenpipe/sync

# Save daily summaries locally
bunx @screenpipe/sync --output ~/Documents/brain/context --git

# Sync summaries to remote server
bunx @screenpipe/sync --output /tmp/summaries --remote user@host:~/screenpipe-pkm

# Persistent daemon (survives reboot)
bunx @screenpipe/sync --daemon --output /tmp/summaries --remote user@host:~/clawd/screenpipe-pkm
```

## What It Extracts

| Category | Description |
|----------|-------------|
| **Todos** | Action items visible on screen or mentioned |
| **Goals** | Objectives, intentions, targets mentioned |
| **Decisions** | Choices made or discussed |
| **Activities** | Key tasks worked on, by app |
| **Meetings** | Calls, conversations, collaborations |
| **Blockers** | Problems, frustrations, obstacles |
| **Insights** | AI observations about work patterns |

## Example Output

```markdown
# Daily Context - 2026-01-31

> Analyzed 480 minutes of screen activity

## Apps Used
- **VS Code**: ~180 min
- **Chrome**: ~120 min
- **Slack**: ~60 min

## Todos Extracted
- Fix authentication bug in login.ts
- Review PR #234 for payment integration
- Send weekly update to investors

## Goals Mentioned
- Ship v2.9 by Friday
- Reach 50% activation rate

## AI Insights
- Heavy context switching between Slack and VS Code
- Deep focus block from 2-4pm on auth refactor
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Save to directory | stdout |
| `-h, --hours <n>` | Hours to analyze | 12 |
| `-g, --git` | Auto commit & push | false |
| `-r, --remote <host>` | Sync via SSH | - |
| `-d, --daemon` | Install persistent sync | false |
| `--interval <secs>` | Daemon interval | 3600 |
| `--stop` | Stop daemon | - |
| `--json` | JSON output | markdown |
| `-v, --verbose` | Debug output | false |

## AI Summarization

Uses [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) if available:

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Verify it works
claude --version
```

Falls back to structured extraction (no AI) if CLI not found.

## OpenClaw Integration

For daily digests via Telegram:

1. **Local Mac** syncs summaries hourly:
```bash
bunx @screenpipe/sync --daemon --output /tmp/summaries --remote openclaw:~/clawd/screenpipe-pkm
```

2. **OpenClaw** has native cron that reads files and sends digest:
```bash
# Already configured - runs at 9pm PT
sudo docker exec openclaw-gateway node dist/index.js cron list
```

## Use Cases

### Daily Journaling
```bash
bunx @screenpipe/sync --output ~/journal --hours 16
```

### Weekly Review Prep
```bash
bunx @screenpipe/sync --hours 168 --json > week.json
```

### Daemon Mode (Recommended)
```bash
# Install persistent sync - survives reboot
bunx @screenpipe/sync --daemon -r user@host:~/screenpipe-pkm

# Check status
# macOS: cat /tmp/screenpipe-sync.log
# Linux: systemctl --user status screenpipe-sync.timer

# Stop daemon
bunx @screenpipe/sync --stop
```

## How It Works

1. **Query** - Fetches OCR data from local Screenpipe API
2. **Dedupe** - Removes duplicate/similar screen captures
3. **Extract** - Claude Code CLI analyzes for structured data
4. **Format** - Outputs markdown or JSON
5. **Sync** - SCPs to remote server

## Requirements

- [Screenpipe](https://github.com/screenpipe/screenpipe) running locally
- [Bun](https://bun.sh) runtime
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (optional, for AI extraction)

## Privacy

All processing happens locally. Screen data never leaves your machine unless you explicitly sync summaries to a remote.

## License

MIT - Part of the [Screenpipe](https://github.com/screenpipe/screenpipe) project.
