---
schedule: every 1h
enabled: false
---

Sync screenpipe activity to an Obsidian vault as a daily markdown log.

## Task

1. Query the screenpipe search API for the time range given in the context header
2. Process data in 30-minute chunks to manage context size
3. For each chunk, summarize the key activities
4. Append summaries to the daily log file at `~/obsidian-vault/screenpipe/<date>.md`
5. Create folders if they don't exist

## Search API

```
GET http://localhost:3030/search?content_type=all&start_time=<ISO8601>&end_time=<ISO8601>&limit=200
```

## Output Format

```markdown
# Activity Log - <date>

| Time | Activity | Apps | Tags |
|------|----------|------|------|
| 10:00-10:30 | Reviewed PR #123 for auth module | GitHub, VSCode | #coding #review |
| 10:30-11:00 | Call with team about roadmap | Zoom, Notion | #meeting #planning |
```

## Deep Links

- Timeline: `[10:30 AM](screenpipe://timeline?timestamp=2025-02-01T10:30:00Z)`
- Frame: `[screenshot](screenpipe://frame/<frame_id>)` using frame_id from results

## Rules

- Link people with [[Name]] and concepts with [[concept]] (Obsidian wiki-links)
- Keep summaries concise, group related activities
- Add semantic tags (#coding, #meeting, etc.)
- Skip idle periods or duplicates
- Use the user's local timezone (from context header) for all displayed times
- Query in chunks to avoid context overflow
- Each sync appends to or updates the existing daily log — don't overwrite
