# screenpipe-sync

**Sync your Screenpipe data to remote AI agents.**

One-liner to permanently sync your screen memory to a remote server (e.g., [Clawdbot](https://github.com/moltinginstar/moltbot), any SSH server). Your AI agent can then query your full history via SQLite.

Also extracts structured daily summaries: todos, goals, decisions, and AI insights.

## Quick Start

```bash
# One-liner - AI summary to stdout
bunx @screenpipe/sync

# Save daily summaries locally
bunx @screenpipe/sync --output ~/Documents/brain/context --git

# Sync raw SQLite database to remote (full history!)
bunx @screenpipe/sync --db --remote user@host:~/.screenpipe/

# Full sync: DB + daily summary
bunx @screenpipe/sync --db -r clawdbot:~/.screenpipe && bunx @screenpipe/sync -o ~/context -g
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
# Daily Context - 2026-01-29

> Analyzed 480 minutes of screen activity

## 📱 Apps Used
- **VS Code**: ~180 min
- **Chrome**: ~120 min
- **Slack**: ~60 min

## ✅ Todos Extracted
- Fix authentication bug in login.ts
- Review PR #234 for payment integration
- Send weekly update to investors

## 🎯 Goals Mentioned
- Ship v2.9 by Friday
- Reach 50% activation rate

## 💡 AI Insights
- Heavy context switching between Slack and VS Code (17 switches/hour)
- Deep focus block from 2-4pm on auth refactor
- Late session (after 10pm) - consider sleep impact
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Save to directory | stdout |
| `-h, --hours <n>` | Hours to analyze | 12 |
| `-g, --git` | Auto commit & push | false |
| `-r, --remote <host>` | Sync via SSH | - |
| `--json` | JSON output | markdown |
| `-v, --verbose` | Debug output | false |

## Environment Variables

```bash
# AI Provider (uses first available)
export ANTHROPIC_API_KEY="sk-..."     # Claude (recommended)
export OPENAI_API_KEY="sk-..."        # OpenAI fallback
export OLLAMA_URL="http://localhost:11434"  # Local Ollama
export OLLAMA_MODEL="llama3.2"        # Ollama model

# Screenpipe
export SCREENPIPE_URL="http://localhost:3030"  # Default
```

**AI Priority:** Claude → OpenAI → Ollama → No AI (basic summary)

## Use Cases

### Daily Journaling
```bash
# Run at end of day
bunx @screenpipe/sync --output ~/journal --hours 16
```

### Sync to Remote AI Assistant
```bash
# Sync context to Clawdbot/Moltbot instance
bunx @screenpipe/sync --output ~/brain/context --git
# Remote pulls via cron
```

### Weekly Review Prep
```bash
# Get full week
bunx @screenpipe/sync --hours 168 --json > week.json
```

### Automated Daily Sync (cron)
```bash
# Add to crontab
0 22 * * * ANTHROPIC_API_KEY=sk-... bunx @screenpipe/sync -o ~/context -g
```

## How It Works

### Summary Mode (default)
1. **Query** - Fetches OCR data from local Screenpipe API
2. **Dedupe** - Removes duplicate/similar screen captures
3. **Extract** - Claude analyzes content for structured data
4. **Format** - Outputs markdown or JSON
5. **Sync** - Optionally git pushes or SCPs to remote

### DB Sync Mode (`--db`)
1. **Copy** - Copies `~/.screenpipe/db.sqlite` (your full history)
2. **Sync** - Uses rsync/scp to transfer to remote
3. **Query** - Remote can query SQLite directly

```bash
# On remote, query your full history:
sqlite3 ~/.screenpipe/db.sqlite "SELECT text FROM ocr_text WHERE text LIKE '%meeting%' LIMIT 10;"
```

## Requirements

- [Screenpipe](https://github.com/mediar-ai/screenpipe) running locally
- [Bun](https://bun.sh) runtime
- Anthropic API key for AI extraction (optional but recommended)

## Privacy

All processing happens locally. Screen data never leaves your machine unless you explicitly sync to a remote.

## License

MIT - Part of the [Screenpipe](https://github.com/mediar-ai/screenpipe) project.
