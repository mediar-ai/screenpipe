---
name: reminders
description: Scan screen activity for actionable items and create Apple Reminders
schedule: every 30m
lookback: 30m
enabled: false
agent: pi
model: claude-haiku-4-5@20251001
---

You scan recent screen activity and create Apple Reminders for actionable items.

## Screenpipe API

```bash
curl "http://localhost:3030/search?content_type=all&start_time={{start_time}}&end_time={{end_time}}&limit=100"
```

## Your Task

1. Query screenpipe for recent activity ({{start_time}} to {{end_time}})
2. Look for actionable items: todos mentioned in chat, deadlines in emails, follow-ups from meetings, tasks from project management tools
3. For each actionable item, create an Apple Reminder using the `reminders` CLI or AppleScript

## Creating Reminders (macOS)

Use osascript to create reminders:

```bash
osascript -e 'tell application "Reminders"
    tell list "Screenpipe"
        make new reminder with properties {name:"TITLE", body:"DETAILS", due date:date "DATE"}
    end tell
end tell'
```

If the "Screenpipe" list doesn't exist, create it first:
```bash
osascript -e 'tell application "Reminders" to make new list with properties {name:"Screenpipe"}'
```

## Rules

- Only create reminders for genuinely actionable items
- Don't duplicate — check if a similar reminder already exists
- Include context: where you found the item (app, window, conversation)
- Set due dates when mentioned; otherwise leave without due date
- Keep reminder titles short and actionable (start with a verb)
- Write output summary to ./output/{{date}}.md
