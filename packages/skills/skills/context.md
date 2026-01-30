---
name: screenpipe-context
description: Get context for a task or topic. "What do I know about project X?" "Context for the auth refactor"
tools: Bash
---

# Screenpipe Context

Pull relevant screen history for a specific topic, project, or task.

## Database Location

```
~/.screenpipe/db.sqlite
```

## Query Patterns

```bash
# Search for topic across all time
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT
    date(f.timestamp) as day,
    o.app_name,
    o.window_name,
    substr(o.text, 1, 300) as content
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE o.text LIKE '%auth%' OR o.text LIKE '%authentication%'
  ORDER BY f.timestamp DESC
  LIMIT 50;
"

# Get window titles related to topic
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT DISTINCT
    o.app_name,
    o.window_name,
    COUNT(*) as times_seen
  FROM ocr_text o
  WHERE o.window_name LIKE '%project-name%'
  GROUP BY o.window_name
  ORDER BY times_seen DESC
  LIMIT 20;
"

# Timeline of when topic was worked on
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT
    date(f.timestamp) as day,
    COUNT(*) as frames,
    GROUP_CONCAT(DISTINCT o.app_name) as apps
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE o.text LIKE '%screenpipe%'
  GROUP BY day
  ORDER BY day DESC
  LIMIT 14;
"

# Extract code snippets related to topic
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT f.timestamp, substr(o.text, 1, 500)
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE o.app_name IN ('VS Code', 'Cursor', 'Zed', 'Terminal')
    AND o.text LIKE '%function%'
    AND o.text LIKE '%auth%'
  ORDER BY f.timestamp DESC
  LIMIT 10;
"
```

## Your Task

When the user needs context about something:

1. Extract the topic/project/task from their question
2. Search across all history for related content
3. Group by:
   - When (which days/times)
   - Where (which apps)
   - What (relevant content snippets)
4. Synthesize into useful context

## Output Format

```markdown
## Context: [Topic]

### Timeline
- First seen: 2026-01-15
- Last worked on: 2026-01-29
- Total days: 8

### Apps Used
- VS Code (45 frames) - main development
- Chrome (23 frames) - docs, Stack Overflow
- Slack (12 frames) - discussions

### Key Files/Windows
- `auth.ts` - main auth logic
- `login.tsx` - login UI
- GitHub PR #234

### Relevant Content
- [snippet 1]
- [snippet 2]

### Recent Activity
- Yesterday: Fixed token refresh bug
- 3 days ago: Added OAuth support
```
