---
name: screenpipe-digest
description: Get a summary of screen activity. "What did I work on today?" "Summarize yesterday"
tools: Bash
---

# Screenpipe Daily Digest

Generate summaries of screen activity from the SQLite database.

## Database Location

```
~/.screenpipe/db.sqlite
```

## Query Patterns

```bash
# App usage breakdown for today
sqlite3 -header -column ~/.screenpipe/db.sqlite "
  SELECT
    o.app_name,
    COUNT(*) as frames,
    ROUND(COUNT(*) * 5.0 / 60, 1) as approx_minutes
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE date(f.timestamp) = date('now')
  GROUP BY o.app_name
  ORDER BY frames DESC
  LIMIT 15;
"

# Timeline of app switches
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT
    strftime('%H:%M', f.timestamp) as time,
    o.app_name,
    o.window_name
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE date(f.timestamp) = date('now')
  GROUP BY strftime('%H', f.timestamp), o.app_name
  ORDER BY f.timestamp;
"

# Sample of content from each app today
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT o.app_name, substr(o.text, 1, 200) as sample
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE date(f.timestamp) = date('now')
  GROUP BY o.app_name
  LIMIT 10;
"

# First and last activity
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT
    MIN(f.timestamp) as first_activity,
    MAX(f.timestamp) as last_activity
  FROM frames f
  WHERE date(f.timestamp) = date('now');
"
```

## Your Task

When the user asks for a digest or summary:

1. Query app usage breakdown (time per app)
2. Get a timeline of major activities
3. Sample content from each major app
4. Summarize into a coherent narrative:
   - What apps were used and for how long
   - What was the user working on
   - Any patterns (deep work, meetings, browsing)

## Output Format

```markdown
## Daily Digest - [Date]

### Time Breakdown
- VS Code: ~3 hours (screenpipe repo)
- Chrome: ~2 hours (GitHub, Docs)
- Slack: ~45 min

### Timeline
- 9am-11am: Deep work on auth feature
- 11am-12pm: Code review, Slack
- 2pm-5pm: Debugging, testing

### Key Activities
- Fixed authentication bug
- Reviewed 3 PRs
- Slack discussion about launch

### Patterns
- Good focus block in morning
- Fragmented afternoon (12 app switches)
```
