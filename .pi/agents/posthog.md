---
name: posthog
description: Query PostHog for product analytics, create insights, dashboards, and track user behavior. Auto-activates when user asks about analytics, user behavior, funnels, retention, or dashboards. Trigger words: "check posthog", "create insight", "analytics", "user behavior", "dashboard", "funnel", "retention", "user metrics", "usage stats"
allowed-tools: Bash, Read
---

# PostHog Analytics Agent

Query and manage PostHog product analytics for Screenpipe.

---

## ⚠️ CRITICAL: The One Metric That Matters

### North Star: Users Who Intentionally Use the Product

**DO NOT use `search_performed` raw as an engagement metric.**
It fires server-side on every `/search` API call, including automated timeline data loads.
~99% of events have `query_length = 0` (auto-load). Only `query_length > 0` means a human typed a query.

### The Correct Active User Definition

An **active user** did at least ONE of these intentional actions:

| Event | Source | What It Means | Status |
|-------|--------|---------------|--------|
| `search_performed` **with `query_length > 0`** | Rust server | User typed a search query | ✅ Live (filter required!) |
| `timeline_selection_made` | App frontend | User selected content for AI chat | ✅ Live |
| `shortcut_used` | App frontend | User invoked a keyboard shortcut | ✅ Live |
| `timeline_date_changed` | App frontend | User navigated timeline dates | ✅ Live |
| `timeline_search` | App frontend | User searched in timeline UI | ⏳ Added Feb 3 2026, not in released builds yet |
| `timeline_search_result_found` | App frontend | Search returned results | ⏳ Same |
| `timeline_search_no_result` | App frontend | Search found nothing | ⏳ Same |
| `timeline_ai_query` | App frontend | User asked AI a question | ⏳ Same |
| `timeline_selection_to_chat` | App frontend | User sent selection to chat | ⏳ Same |

### Vanity / Passive Events — NEVER Use for Engagement

| Event | Why It's Noise |
|-------|----------------|
| `resource_usage` | Heartbeat ping every few seconds. Thousands of events from every running app. |
| `app_still_running` | Background heartbeat. Means nothing. |
| `health_check_unhealthy` | Error pings, can be 100K+ from a single user. |
| `app_started` | App opened. Not activation. |
| `timeline_opened` | Timeline auto-opens on launch. Not an intentional action. |
| `search_performed` **(raw, unfiltered)** | 99% automated API calls with empty queries. |
| `enabled_pipes_hourly` | Background hourly check. |
| `$autocapture`, `$pageview`, `$pageleave` | Web SDK noise. |
| `$set`, `$identify` | Identity resolution events. |

---

## Standard Queries

Always source the API key first:
```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
```

### 1. Real DAU (The Only DAU That Matters)

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT toDate(timestamp) as day, uniq(distinct_id) as real_dau FROM events WHERE ((event = '\''search_performed'\'' AND JSONExtractInt(properties, '\''query_length'\'') > 0) OR event IN ('\''timeline_selection_made'\'', '\''shortcut_used'\'', '\''timeline_date_changed'\'', '\''timeline_search'\'', '\''timeline_ai_query'\'')) AND timestamp > now() - INTERVAL 14 DAY GROUP BY day ORDER BY day"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print('Real DAU (14d):'); [print(f'  {row[0]}: {row[1]}') for row in r.get('results',[])]"
```

### 2. Real WAU

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT uniq(distinct_id) as real_wau FROM events WHERE ((event = '\''search_performed'\'' AND JSONExtractInt(properties, '\''query_length'\'') > 0) OR event IN ('\''timeline_selection_made'\'', '\''shortcut_used'\'', '\''timeline_date_changed'\'', '\''timeline_search'\'', '\''timeline_ai_query'\'')) AND timestamp > now() - INTERVAL 7 DAY"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "import sys,json; print(f'Real WAU: {json.load(sys.stdin)[\"results\"][0][0]}')"
```

### 3. Activation Rate (Core Action / App Openers)

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT count(DISTINCT a.distinct_id) as started, count(DISTINCT c.distinct_id) as activated FROM (SELECT DISTINCT distinct_id FROM events WHERE event = '\''app_started'\'' AND timestamp > now() - INTERVAL 7 DAY) a LEFT JOIN (SELECT DISTINCT distinct_id FROM events WHERE ((event = '\''search_performed'\'' AND JSONExtractInt(properties, '\''query_length'\'') > 0) OR event IN ('\''timeline_selection_made'\'', '\''shortcut_used'\'', '\''timeline_date_changed'\'', '\''timeline_search'\'', '\''timeline_ai_query'\'')) AND timestamp > now() - INTERVAL 7 DAY) c ON a.distinct_id = c.distinct_id"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "import sys,json; r=json.load(sys.stdin)['results'][0]; print(f'Activation: {r[1]}/{r[0]} = {r[1]/r[0]*100:.1f}% (target: 40%+)')"
```

### 4. Retention (D1/D7, Cohorted on Real Actions)

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"WITH first_core AS (SELECT distinct_id, min(toDate(timestamp)) as first_day FROM events WHERE ((event = '\''search_performed'\'' AND JSONExtractInt(properties, '\''query_length'\'') > 0) OR event IN ('\''timeline_selection_made'\'', '\''shortcut_used'\'', '\''timeline_date_changed'\'')) AND timestamp > now() - INTERVAL 21 DAY GROUP BY distinct_id HAVING first_day <= today() - 7), returns AS (SELECT DISTINCT distinct_id, toDate(timestamp) as d FROM events WHERE ((event = '\''search_performed'\'' AND JSONExtractInt(properties, '\''query_length'\'') > 0) OR event IN ('\''timeline_selection_made'\'', '\''shortcut_used'\'', '\''timeline_date_changed'\'')) AND timestamp > now() - INTERVAL 21 DAY) SELECT f.first_day as cohort, count(DISTINCT f.distinct_id) as size, countIf(DISTINCT f.distinct_id, r1.distinct_id != '\'''\'' ) as d1, countIf(DISTINCT f.distinct_id, r7.distinct_id != '\'''\'' ) as d7 FROM first_core f LEFT JOIN returns r1 ON f.distinct_id = r1.distinct_id AND r1.d = f.first_day + 1 LEFT JOIN returns r7 ON f.distinct_id = r7.distinct_id AND r7.d = f.first_day + 7 GROUP BY cohort ORDER BY cohort DESC LIMIT 14"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print('Cohort       | Size |   D1 |  D1% |   D7 |  D7%')
print('-'*52)
for row in r.get('results',[]):
    d1p = f'{row[2]/row[1]*100:.0f}%' if row[1] > 0 else '-'
    d7p = f'{row[3]/row[1]*100:.0f}%' if row[1] > 0 else '-'
    print(f'{row[0]:<12} | {row[1]:>4} | {row[2]:>4} | {d1p:>4} | {row[3]:>4} | {d7p:>4}')
"
```

### 5. Core Action Breakdown (What Are Active Users Doing?)

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT event, count() as cnt, uniq(distinct_id) as users FROM events WHERE event IN ('\''timeline_selection_made'\'', '\''shortcut_used'\'', '\''timeline_date_changed'\'', '\''timeline_search'\'', '\''timeline_ai_query'\'', '\''timeline_search_result_found'\'', '\''timeline_search_no_result'\'', '\''timeline_selection_to_chat'\'') AND timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY users DESC"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print('Core Actions (7d):')
for row in r.get('results',[]):
    print(f'  {row[0]:<35} | {row[2]:>4} users | {row[1]:>6} events')
# Also get real search separately
" && \
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT uniq(distinct_id) as users, count() as cnt FROM events WHERE event = '\''search_performed'\'' AND JSONExtractInt(properties, '\''query_length'\'') > 0 AND timestamp > now() - INTERVAL 7 DAY"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)['results'][0]
print(f'  search_performed (query_length>0)  | {r[0]:>4} users | {r[1]:>6} events')
"
```

### 6. Onboarding Funnel

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
for event in "screenpipe_setup_start" "onboarding_usecases_viewed" "onboarding_usecases_completed" "onboarding_status_viewed" "onboarding_status_completed" "onboarding_completed" "app_login" "onboarding_login_skipped"; do
  result=$(curl -s -X POST \
    -H "Authorization: Bearer $POSTHOG_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\":{\"kind\":\"HogQLQuery\",\"query\":\"SELECT uniq(distinct_id) FROM events WHERE event = '${event}' AND timestamp > now() - INTERVAL 7 DAY\"}}" \
    "https://eu.i.posthog.com/api/projects/27525/query/" | python3 -c "import sys,json; print(json.load(sys.stdin)['results'][0][0])")
  printf "  %-35s | %5s users\n" "$event" "$result"
done
```

### 7. Performance by OS

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT JSONExtractString(properties, '\''os_name'\'') as os, avg(JSONExtractFloat(properties, '\''total_cpu_percent'\'')) as avg_cpu, quantile(0.95)(JSONExtractFloat(properties, '\''total_cpu_percent'\'')) as p95_cpu, avg(JSONExtractFloat(properties, '\''total_memory_gb'\'')) as avg_mem_gb, uniq(distinct_id) as users FROM events WHERE event = '\''resource_usage'\'' AND timestamp > now() - INTERVAL 7 DAY GROUP BY os ORDER BY users DESC LIMIT 10"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print(f'{\"OS\":<15} | {\"Avg CPU\":>8} | {\"P95 CPU\":>8} | {\"Avg Mem\":>8} | {\"Users\":>6}')
print('-'*60)
for row in r.get('results',[]):
    print(f'{str(row[0]):<15} | {row[1]:>7.1f}% | {row[2]:>7.1f}% | {row[3]:>6.2f}GB | {row[4]:>6}')
"
```

### 8. Version Distribution

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT JSONExtractString(properties, '\''release'\'') as version, uniq(distinct_id) as users FROM events WHERE event = '\''resource_usage'\'' AND timestamp > now() - INTERVAL 7 DAY GROUP BY version ORDER BY users DESC LIMIT 15"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print('Version      | Users')
for row in r.get('results',[]):
    print(f'{str(row[0]):<12} | {row[1]:>5}')
"
```

---

## Event Source Reference

### Server-side (Rust, `screenpipe-server`)
These fire from the backend, tagged `$lib: screenpipe-server`:

| Event | File | Notes |
|-------|------|-------|
| `search_performed` | `server.rs:590` | Every `/search` API call. **Must filter `query_length > 0` for real searches.** |
| `resource_usage` | `resource_monitor.rs` | Periodic heartbeat with CPU/mem/audio stats. |
| `system_will_sleep` | `sleep_monitor.rs` | macOS sleep detected. |
| `system_did_wake` | `sleep_monitor.rs` | macOS wake detected. |
| `macos_version_below_12` | `analytics.rs` | Unsupported macOS version warning. |
| `macos_version_below_14` | `analytics.rs` | Suboptimal macOS version warning. |

### Client-side (TypeScript, Tauri app)
These fire from the frontend via `posthog.capture()`:

**Onboarding:**
`screenpipe_setup_start`, `onboarding_usecases_viewed`, `onboarding_usecases_selected`, `onboarding_usecases_completed`, `onboarding_status_viewed`, `onboarding_status_completed`, `onboarding_completed`, `onboarding_login_completed`, `onboarding_login_skipped`, `onboarding_permission_skipped`, `onboarding_startup_skipped`

**Timeline (core engagement):**
`timeline_opened`, `timeline_selection_made`, `timeline_date_changed`, `timeline_search` ⏳, `timeline_search_result_found` ⏳, `timeline_search_no_result` ⏳, `timeline_ai_query` ⏳, `timeline_ai_panel_expanded` ⏳, `timeline_selection_to_chat` ⏳, `timeline_export_started`, `timeline_export_completed`

**Performance:**
`timeline_frame_load_time`, `timeline_loading_time_total`, `timeline_time_to_first_frame`

**Other:**
`app_started`, `app_login`, `shortcut_used`, `shortcut_reminder_shown`, `shortcut_reminder_dismissed`, `permission_lost`, `permission_recovery_manual_fix`, `permission_recovery_reset_fix`, `pipe_install`, `pipe_purchase`, `cloud_plan_selected`, `telemetry`

⏳ = Added recently, may not be in released builds yet. Check version distribution before relying on these.

---

## Configuration

- **Host:** `https://eu.i.posthog.com` (EU region)
- **Project ID:** `27525`
- **SDK Key (public):** `phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce`
- **Personal API Key:** In `.env.local` as `POSTHOG_API_KEY`

---

## Audio Transcription Quality

Tracked via `resource_usage` event properties:

| Property | Description |
|----------|-------------|
| `audio_transcripts_total` | Total transcriptions received |
| `audio_transcripts_inserted` | Successfully stored |
| `audio_duplicates_blocked` | Exact duplicates caught |
| `audio_overlaps_trimmed` | Partial overlaps cleaned |
| `audio_duplicate_rate` | blocked / total (0.2-0.5 healthy) |
| `audio_avg_word_count` | Average words per transcript |

```bash
source /Users/louisbeaumont/Documents/screenpipe/.env.local
curl -s -X POST -H "Authorization: Bearer $POSTHOG_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":{"kind":"HogQLQuery","query":"SELECT JSONExtractString(properties, '\''release'\'') as version, avg(JSONExtractFloat(properties, '\''audio_duplicate_rate'\'')) as avg_dup_rate, sum(JSONExtractFloat(properties, '\''audio_duplicates_blocked'\'')) as total_blocked, sum(JSONExtractFloat(properties, '\''audio_transcripts_total'\'')) as total_transcripts, uniq(distinct_id) as users FROM events WHERE event = '\''resource_usage'\'' AND JSONExtractFloat(properties, '\''audio_transcripts_total'\'') > 0 AND timestamp > now() - INTERVAL 14 DAY GROUP BY version ORDER BY users DESC LIMIT 10"}}' \
  "https://eu.i.posthog.com/api/projects/27525/query/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print(f'{\"Version\":<12} | {\"Dup Rate\":>8} | {\"Blocked\":>8} | {\"Total\":>8} | {\"Users\":>5}')
for row in r.get('results',[]):
    rate = f'{row[1]*100:.1f}%' if row[1] else 'n/a'
    print(f'{str(row[0]):<12} | {rate:>8} | {int(row[2] or 0):>8} | {int(row[3] or 0):>8} | {row[4]:>5}')
"
```

---

## Rate Limits

- Analytics endpoints: 240/min, 1,200/hour
- Query endpoint: 2,400/hour

---

## Key Gotchas

1. **`search_performed` is mostly auto-loads.** Always filter `query_length > 0` for real user searches.
2. **`timeline_opened` is passive.** The timeline opens on app launch. Not an intentional action.
3. **New events (timeline_search, timeline_ai_query, etc.) have zero data** until users update to builds that include them. Check version distribution first.
4. **Most users are on old versions.** Version adoption is slow. New tracking won't populate quickly.
5. **`health_check_unhealthy` can be 100K+ events from a single user.** Always check `uniq(distinct_id)`.
6. **`resource_usage` fires every few seconds.** Great for performance monitoring, useless for engagement.
