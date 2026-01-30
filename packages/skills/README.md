# @screenpipe/skills

**Screenpipe skills for AI agents.**

One-liner to install Screenpipe skills to your AI agent (Clawdbot, Claude Code, etc). Your agent can then query your screen history, get daily digests, and search memories.

## Quick Start

```bash
# Install to remote agent (e.g., Clawdbot)
bunx @screenpipe/skills install --remote clawdbot

# Install locally
bunx @screenpipe/skills install

# List available skills
bunx @screenpipe/skills list
```

## Skills Included

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **recall** | "What was I doing at 3pm?" | Query screen history by time |
| **search** | "Find when I saw error 404" | Full-text search memories |
| **digest** | "What did I work on today?" | Daily activity summaries |
| **context** | "Context for the auth refactor" | Get context for a topic |

## Requirements

- [Screenpipe](https://screenpi.pe) installed and running
- Screen data synced to agent via `bunx @screenpipe/sync --daemon`
- SQLite3 available on the agent

## Full Setup

```bash
# 1. Sync your screen data to the agent
bunx @screenpipe/sync --daemon --remote clawdbot:~/.screenpipe/

# 2. Install skills
bunx @screenpipe/skills install --remote clawdbot

# 3. Ask your agent
"What was I doing at 3pm yesterday?"
"Find when I last saw the budget spreadsheet"
"Summarize my work today"
```

## How It Works

Skills are markdown files that teach your AI agent how to query the Screenpipe SQLite database:

```sql
-- Example: Get today's app usage
SELECT app_name, COUNT(*) as frames
FROM ocr_text o
JOIN frames f ON o.frame_id = f.id
WHERE date(f.timestamp) = date('now')
GROUP BY app_name
ORDER BY frames DESC;
```

The agent reads these skill files and uses them to answer your questions about your screen history.

## License

MIT - Part of [Screenpipe](https://github.com/mediar-ai/screenpipe)
