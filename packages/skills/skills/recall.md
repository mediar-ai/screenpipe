---
name: screenpipe-recall
description: Query your screen history by time. "What was I doing at 3pm?" "What did I see yesterday morning?"
tools: Bash
---

# Screenpipe Recall

Query the local Screenpipe SQLite database to recall what was on screen at a specific time.

## Database Location

```
~/.screenpipe/db.sqlite
```

## Query Patterns

```bash
# Get screen content from a specific hour
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT f.timestamp, o.text, o.app_name, o.window_name
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE f.timestamp LIKE '2026-01-29 15:%'
  ORDER BY f.timestamp DESC
  LIMIT 20;
"

# Get content from time range
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT f.timestamp, o.app_name, substr(o.text, 1, 200) as text_preview
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE f.timestamp BETWEEN '2026-01-29 14:00:00' AND '2026-01-29 16:00:00'
  ORDER BY f.timestamp
  LIMIT 50;
"

# Get today's activity by app
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT o.app_name, COUNT(*) as frames
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE date(f.timestamp) = date('now')
  GROUP BY o.app_name
  ORDER BY frames DESC;
"
```

## Your Task

When the user asks about what they were doing at a specific time:

1. Parse the time from their question (e.g., "3pm" → "15:00", "yesterday morning" → yesterday's date + "09:00-12:00")
2. Query the database with appropriate time filters
3. Summarize what apps were used and what content was visible
4. If they ask about a specific topic, filter by text content

## Examples

User: "What was I doing at 3pm?"
→ Query for frames around 15:00 today, summarize apps and content

User: "What did I work on yesterday afternoon?"
→ Query for yesterday's date, 12:00-18:00, group by app

User: "When did I last look at the budget spreadsheet?"
→ Search for "budget" in text, return timestamps
