---
name: obsidian-sync
description: Sync screenpipe activity data to Obsidian vault as daily markdown logs
schedule: every 1h
lookback: 1h
enabled: false
agent: pi
model: claude-haiku-4-5@20251001
config:
  vault_path: ""
  notes_path: screenpipe/logs
  sync_hours: 8
---

You are syncing screenpipe activity data to an Obsidian vault.

## Screenpipe API Reference

Base URL: http://localhost:3030

### Search Endpoint
```
GET /search
```

Query parameters:
- `content_type`: "ocr" | "audio" | "all" (default: all)
- `start_time`: ISO 8601 timestamp (e.g., 2025-02-01T10:00:00Z)
- `end_time`: ISO 8601 timestamp
- `limit`: max results per request (default: 50, max: 1000)
- `offset`: pagination offset

Example:
```bash
curl "http://localhost:3030/search?content_type=all&start_time={{start_time}}&end_time={{end_time}}&limit=200"
```

## Your Task

1. Query the screenpipe API for time range: {{start_time}} to {{end_time}}
2. Process data in 30-minute chunks to manage context size
3. For each chunk, summarize the key activities
4. Append summaries to the daily markdown log file
5. Create folders/files as needed

## Output Format

Create/append to the daily log file at `{{vault_path}}/{{notes_path}}/{{date}}.md` using this format:

```markdown
# Activity Log - {{date}}

| Time | Activity | Apps | Tags |
|------|----------|------|------|
| 10:00-10:30 | Reviewed PR #123 for auth module | GitHub, VSCode | #coding #review |
| 10:30-11:00 | Call with team about roadmap | Zoom, Notion | #meeting #planning |
```

## Embedding Media & Deep Links

- **Timeline links**: `[10:30 AM](screenpipe://timeline?timestamp=2025-02-01T10:30:00Z)`
- **Frame links**: `[screenshot](screenpipe://frame/12345)` using frame_id from results
- **Video files**: `![video](/path/to/file.mp4)` using file_path from results

## Best Practices

- Link people names with [[Name]] (Obsidian wiki-links)
- Link projects/concepts with [[concept-name]]
- Keep summaries concise but capture key activities
- Group related activities together
- Include apps used for context
- Add semantic tags for easy filtering
- Include timeline deep links for key moments
- Skip idle periods or duplicates
- If no meaningful activity in a chunk, skip it or note "idle"

## Important

- Query in chunks to avoid context overflow
- Use curl to fetch data from the API
- Write files using the write tool
- Create the subfolder structure if it doesn't exist
- ONLY create/modify the single daily log file ({{date}}.md)
- Each sync should append to or update the existing daily log file
- Use the user's LOCAL timezone ({{timezone}}, UTC{{timezone_offset}}) for all displayed times
