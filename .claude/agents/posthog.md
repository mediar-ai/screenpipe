---
name: posthog
description: Query PostHog for product analytics, create insights, dashboards, and track user behavior. Auto-activates when user asks about analytics, user behavior, funnels, retention, or dashboards. Trigger words: "check posthog", "create insight", "analytics", "user behavior", "dashboard", "funnel", "retention", "user metrics", "usage stats"
allowed-tools: Bash, Read
---

# PostHog Analytics Skill

Query and manage PostHog product analytics for Screenpipe applications.

## Configuration

**Host:** `https://eu.i.posthog.com`
**SDK Project Key (public):** `phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce`

**Personal API Key:** Stored in `.env.local` at the repo root. Always source it before running queries.

### Loading the API Key

**IMPORTANT:** Before running ANY PostHog query, always source the `.env.local` file first:

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
```

Or inline with commands:
```bash
export $(cat /Users/louisbeaumont/Documents/screenpipe/.env.local | xargs) && curl ...
```

### Getting a Personal API Key (if needed)

1. Go to https://eu.posthog.com/settings/user-api-keys
2. Click "Create personal API key"
3. Name it (e.g., "claude-code")
4. Select scopes: `insight:read`, `insight:write`, `dashboard:read`, `dashboard:write`, `query:read`
5. Add to `.env.local`: `POSTHOG_API_KEY=phx_xxx...`

---

## Bash Queries (macOS/Linux)

**Note:** All commands below assume you have sourced `.env.local` first.

### Get Project ID

Run this first to get your project ID:

```bash
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://eu.i.posthog.com/api/projects/" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); [print(f'[{p[\"id\"]}] {p[\"name\"]}') for p in r.get('results', [])]"
```

### List All Insights

```bash
PROJECT_ID="YOUR_PROJECT_ID"  # Get from above query
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/insights/?limit=20" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
for i in r.get('results', []):
    print(f'[{i[\"id\"]}] {i[\"name\"]}')
    print(f'  Type: {i.get(\"filters\", {}).get(\"insight\", \"?\")} | Created: {i[\"created_at\"]}')
"
```

### List All Dashboards

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/dashboards/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
for d in r.get('results', []):
    print(f'[{d[\"id\"]}] {d[\"name\"]}')
    print(f'  Tiles: {len(d.get(\"tiles\", []))} | Created: {d[\"created_at\"]}')
"
```

### Query Recent Events

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT event, count() as count FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY count DESC LIMIT 20"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print('Event | Count')
print('-' * 40)
for row in r.get('results', []):
    print(f'{row[0]} | {row[1]}')
"
```

### Query Events by Platform/OS

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.`$os` as os, count() as count, uniq(distinct_id) as unique_users FROM events WHERE timestamp > now() - INTERVAL 30 DAY GROUP BY os ORDER BY count DESC"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/"
```

### Query User Onboarding Funnel

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT event, count() as count FROM events WHERE event LIKE '\''%onboarding%'\'' AND timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY count DESC"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/"
```

### Get Insight Results

```bash
PROJECT_ID="YOUR_PROJECT_ID"
INSIGHT_ID="YOUR_INSIGHT_ID"
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/insights/$INSIGHT_ID/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print(f'Insight: {r[\"name\"]}')
print(f'Last refresh: {r.get(\"last_refresh\", \"?\")}')
print()
import json as j
print(j.dumps(r.get('result', []), indent=2)[:2000])
"
```

---

## PowerShell Queries (Windows)

### Get Project ID

```powershell
$headers = @{ 'Authorization' = "Bearer $env:POSTHOG_API_KEY" }
$response = Invoke-RestMethod -Uri 'https://eu.i.posthog.com/api/projects/' -Headers $headers
$response.results | ForEach-Object { Write-Host "[$($_.id)] $($_.name)" }
```

### List All Insights

```powershell
$projectId = 'YOUR_PROJECT_ID'
$headers = @{ 'Authorization' = "Bearer $env:POSTHOG_API_KEY" }
$response = Invoke-RestMethod -Uri "https://eu.i.posthog.com/api/projects/$projectId/insights/?limit=20" -Headers $headers
$response.results | ForEach-Object {
    Write-Host "[$($_.id)] $($_.name)"
    Write-Host "  Type: $($_.filters.insight) | Created: $($_.created_at)"
}
```

### List All Dashboards

```powershell
$projectId = 'YOUR_PROJECT_ID'
$headers = @{ 'Authorization' = "Bearer $env:POSTHOG_API_KEY" }
$response = Invoke-RestMethod -Uri "https://eu.i.posthog.com/api/projects/$projectId/dashboards/" -Headers $headers
$response.results | ForEach-Object {
    Write-Host "[$($_.id)] $($_.name)"
    Write-Host "  Tiles: $($_.tiles.Count) | Created: $($_.created_at)"
}
```

### Query Recent Events (HogQL)

```powershell
$projectId = 'YOUR_PROJECT_ID'
$headers = @{
    'Authorization' = "Bearer $env:POSTHOG_API_KEY"
    'Content-Type' = 'application/json'
}
$body = @{
    query = @{
        kind = 'HogQLQuery'
        query = 'SELECT event, count() as count FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY count DESC LIMIT 20'
    }
} | ConvertTo-Json -Depth 5
$response = Invoke-RestMethod -Uri "https://eu.i.posthog.com/api/projects/$projectId/query/" -Method POST -Headers $headers -Body $body
$response.results | ForEach-Object { Write-Host "$($_[0]): $($_[1])" }
```

---

## Create Insights

### Create Pageviews by Page Insight

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Top Pages",
    "filters": {
      "insight": "TRENDS",
      "events": [{"id": "$pageview", "type": "events"}],
      "breakdown": "$pathname",
      "breakdown_type": "event",
      "date_from": "-7d"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/insights/"
```

### Create User Funnel Insight

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Onboarding Funnel",
    "filters": {
      "insight": "FUNNELS",
      "events": [
        {"id": "app_started", "type": "events", "name": "App Started"},
        {"id": "onboarding_started", "type": "events", "name": "Onboarding Started"},
        {"id": "onboarding_completed", "type": "events", "name": "Onboarding Completed"}
      ],
      "date_from": "-30d"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/insights/"
```

---

## Dashboard Operations

### Create Dashboard

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Screenpipe Overview",
    "description": "Key metrics for Screenpipe app usage"
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/dashboards/"
```

---

## Useful Filters

### Event Properties
- `$pageview` - Page view event
- `$autocapture` - Auto-captured clicks
- `$pathname` - Page path
- `$current_url` - Full URL
- `$browser` - Browser name
- `$os` - Operating system (windows, macos, linux)
- `$device_type` - desktop/mobile/tablet
- `$screen_width` / `$screen_height` - Screen dimensions

### Filter Operators
- `exact` - Exact match
- `icontains` - Case-insensitive contains
- `regex` - Regular expression
- `is_set` - Property exists
- `is_not_set` - Property doesn't exist
- `gt`, `lt`, `gte`, `lte` - Comparisons

### Insight Types
- `TRENDS` - Time series charts
- `FUNNELS` - Conversion funnels
- `RETENTION` - User retention
- `PATHS` - User journey paths
- `STICKINESS` - Feature stickiness
- `LIFECYCLE` - User lifecycle

---

## Rate Limits

- Analytics endpoints: 240/min, 1200/hour
- Query endpoint: 2400/hour

---

## Debugging Windows Onboarding Issues

When investigating user drop-off or issues in onboarding:

1. Query onboarding events by OS:
```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.`$os` as os, event, count() as count FROM events WHERE event LIKE '\''%onboarding%'\'' AND timestamp > now() - INTERVAL 7 DAY GROUP BY os, event ORDER BY os, count DESC"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/"
```

2. Check onboarding completion rate by step:
```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT event, properties.`$os` as os, count() as count, uniq(distinct_id) as unique_users FROM events WHERE event LIKE '\''%onboarding%'\'' AND timestamp > now() - INTERVAL 7 DAY GROUP BY event, os ORDER BY event, os"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/"
```

---

## Audio Transcription Quality Insights

These insights track audio deduplication performance across versions. Use them to verify fixes and catch regressions.

### Available Metrics (in `resource_usage` event)

| Property | Description | Healthy Range |
|----------|-------------|---------------|
| `audio_transcripts_total` | Total transcriptions received | >0 means audio active |
| `audio_transcripts_inserted` | Successfully stored | Should match unique speech |
| `audio_duplicates_blocked` | Exact duplicates caught | 20-50% of total for dual-device |
| `audio_overlaps_trimmed` | Partial overlaps cleaned | Low numbers expected |
| `audio_duplicate_rate` | `blocked / total` | 0.2-0.5 is healthy |
| `audio_avg_word_count` | Average words per transcript | 5-20 typical |

### Query: Audio Dedup Rate by Version

Compare deduplication performance across releases:

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.release as version, avg(properties.audio_duplicate_rate) as avg_dup_rate, sum(properties.audio_duplicates_blocked) as total_blocked, sum(properties.audio_transcripts_total) as total_transcripts, count() as sample_count FROM events WHERE event = '\''resource_usage'\'' AND properties.audio_transcripts_total > 0 AND timestamp > now() - INTERVAL 30 DAY GROUP BY version ORDER BY version DESC LIMIT 20"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print('Version | Avg Dup Rate | Total Blocked | Total Transcripts | Samples')
print('-' * 75)
for row in r.get('results', []):
    rate = row[1] * 100 if row[1] else 0
    print(f'{row[0]:<12} | {rate:>10.1f}% | {row[2]:>13} | {row[3]:>17} | {row[4]:>7}')
"
```

### Query: Audio Quality Trend Over Time

Track dedup rate over the past 7 days:

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT toDate(timestamp) as day, avg(properties.audio_duplicate_rate) as avg_dup_rate, sum(properties.audio_duplicates_blocked) as blocked, sum(properties.audio_transcripts_inserted) as inserted FROM events WHERE event = '\''resource_usage'\'' AND properties.audio_transcripts_total > 0 AND timestamp > now() - INTERVAL 7 DAY GROUP BY day ORDER BY day"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print('Date | Avg Dup Rate | Blocked | Inserted')
print('-' * 50)
for row in r.get('results', []):
    rate = row[1] * 100 if row[1] else 0
    print(f'{row[0]} | {rate:>10.1f}% | {row[2]:>7} | {row[3]:>8}')
"
```

### Query: Users with Zero Dedup (Potential Bug)

Find users where deduplication might not be working:

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT distinct_id, properties.release as version, properties.`$os` as os, sum(properties.audio_transcripts_total) as total, sum(properties.audio_duplicates_blocked) as blocked FROM events WHERE event = '\''resource_usage'\'' AND properties.audio_transcripts_total > 10 AND timestamp > now() - INTERVAL 7 DAY GROUP BY distinct_id, version, os HAVING blocked = 0 ORDER BY total DESC LIMIT 20"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/"
```

### Query: Audio Quality by OS

Compare dedup performance across operating systems:

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.`$os` as os, avg(properties.audio_duplicate_rate) as avg_dup_rate, avg(properties.audio_avg_word_count) as avg_words, count() as samples FROM events WHERE event = '\''resource_usage'\'' AND properties.audio_transcripts_total > 0 AND timestamp > now() - INTERVAL 14 DAY GROUP BY os ORDER BY samples DESC"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print('OS | Avg Dup Rate | Avg Words | Samples')
print('-' * 50)
for row in r.get('results', []):
    rate = row[1] * 100 if row[1] else 0
    words = row[2] if row[2] else 0
    print(f'{row[0]:<12} | {rate:>10.1f}% | {words:>9.1f} | {row[3]:>7}')
"
```

### Create Audio Quality Dashboard

Create a dashboard with audio quality insights:

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Audio Transcription Quality",
    "description": "Track audio deduplication performance and transcription quality across versions"
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/dashboards/"
```

### Create Audio Dedup Rate Trend Insight

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Audio Duplicate Rate Trend",
    "filters": {
      "insight": "TRENDS",
      "events": [{"id": "resource_usage", "type": "events", "math": "avg", "math_property": "audio_duplicate_rate"}],
      "date_from": "-14d",
      "interval": "day"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/insights/"
```

### Create Audio Quality by Version Insight

```bash
PROJECT_ID="YOUR_PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Audio Dedup Rate by Version",
    "filters": {
      "insight": "TRENDS",
      "events": [{"id": "resource_usage", "type": "events", "math": "avg", "math_property": "audio_duplicate_rate"}],
      "breakdown": "release",
      "breakdown_type": "event",
      "date_from": "-30d",
      "interval": "week"
    }
  }' \
  "https://eu.i.posthog.com/api/projects/$PROJECT_ID/insights/"
```

### Alert Thresholds

Monitor these conditions:

| Condition | Query | Action |
|-----------|-------|--------|
| Zero dedup rate | `audio_duplicate_rate = 0` with `total > 10` | Bug - dedup not working |
| Very high dedup | `audio_duplicate_rate > 0.7` | Too aggressive - blocking real content |
| Low word count | `audio_avg_word_count < 3` | Transcription quality issue |
| Sudden drop | Rate drops >20% vs previous version | Regression |

---

## Important Notes

1. **API Key required:** Personal API key needed (not the public project key)
2. **EU Region:** Screenpipe uses `eu.i.posthog.com` (not `app.posthog.com`)
3. **Project ID:** Get from `/api/projects/` endpoint first
4. **HogQL:** Use for complex queries not supported by filters
5. **Rate limits:** 240 requests/min for analytics endpoints
6. **Privacy:** Never log or expose user IDs, emails, or PII in queries
7. **Audio metrics:** Only aggregate counts sent - no transcript content, fully privacy-safe
