---
name: sentry
description: Query Sentry for application errors, issues, and events. Use when user asks about errors, exceptions, crashes, or debugging production issues.
tools: Bash, Read
---

# Sentry Error Tracking Skill

Query Sentry issues for Screenpipe applications.

## Configuration

**Org:** `mediar`
**Projects:**
- `screenpipe-desktop-app` - Desktop app (Tauri/Rust) - primary project for app crashes
- `screenpipe-cli` - CLI/server (Rust) - for CLI crashes
- `screenpipe-ai-proxy` - AI proxy service
- Other projects may exist - list them with the projects query

**Credentials:** Read `SENTRY_AUTH_TOKEN` from `.env.local`

### Loading the Token

**IMPORTANT:** Before running any Sentry query, first load the token from `.env.local`:

```bash
export SENTRY_AUTH_TOKEN=$(grep SENTRY_AUTH_TOKEN /Users/louisbeaumont/Documents/screenpipe/.env.local | cut -d'=' -f2)
```

### Getting a Sentry Auth Token

1. Go to https://sentry.io/settings/account/api/auth-tokens/
2. Click "Create New Token"
3. Select scopes: `project:read`, `org:read`, `issue:read`, `issue:write` (optional for resolving)
4. Set env var: `export SENTRY_AUTH_TOKEN=sntrys_xxx...`

---

## Bash Queries (macOS/Linux)

### Auto-Detect Organization Slug

Run this first to find your organization slug:

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/" | \
  python3 -c "import sys,json; orgs=json.load(sys.stdin); [print(f'[{o[\"slug\"]}] {o[\"name\"]}') for o in orgs]"
```

### List Projects

```bash
ORG_SLUG="mediar"  # Replace with actual org slug from above
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/$ORG_SLUG/projects/" | \
  python3 -c "import sys,json; projects=json.load(sys.stdin); [print(f'[{p[\"slug\"]}] {p[\"name\"]} - {p.get(\"platform\", \"unknown\")}') for p in projects]"
```

### Recent Unresolved Issues (All Projects)

```bash
ORG_SLUG="mediar"
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/$ORG_SLUG/issues/?query=is:unresolved&sort=date&limit=15" | \
  python3 -c "
import sys,json
issues=json.load(sys.stdin)
for i in issues:
    print(f'[{i[\"shortId\"]}] {i[\"title\"]}')
    print(f'  Events: {i[\"count\"]} | Last seen: {i[\"lastSeen\"]} | Project: {i.get(\"project\", {}).get(\"slug\", \"?\")}')
    print()
"
```

### Issues for Specific Project (e.g., screenpipe-app)

```bash
ORG_SLUG="mediar"
PROJECT_SLUG="screenpipe-app"
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/$ORG_SLUG/$PROJECT_SLUG/issues/?query=is:unresolved&limit=15" | \
  python3 -c "
import sys,json
issues=json.load(sys.stdin)
for i in issues:
    print(f'[{i[\"shortId\"]}] {i[\"title\"]}')
    print(f'  Events: {i[\"count\"]} | Last: {i[\"lastSeen\"]}')
"
```

### Issues in Last 24 Hours

```bash
ORG_SLUG="mediar"
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/$ORG_SLUG/issues/?query=is:unresolved+lastSeen:-24h&sort=freq&limit=20" | \
  python3 -c "
import sys,json
issues=json.load(sys.stdin)
for i in issues:
    print(f'[{i[\"shortId\"]}] {i[\"title\"]}')
    print(f'  Events: {i[\"count\"]} | Users: {i.get(\"userCount\", 0)} | Project: {i.get(\"project\", {}).get(\"slug\", \"?\")}')
"
```

### Get Issue Details

```bash
ISSUE_ID="SCREENPIPE-APP-123"  # Replace with actual issue ID
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/issues/$ISSUE_ID/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print(f'Issue: {r[\"shortId\"]}')
print(f'Title: {r[\"title\"]}')
print(f'Culprit: {r.get(\"culprit\", \"unknown\")}')
print(f'Status: {r[\"status\"]}')
print(f'Events: {r[\"count\"]}')
print(f'Users: {r.get(\"userCount\", 0)}')
print(f'First: {r[\"firstSeen\"]}')
print(f'Last: {r[\"lastSeen\"]}')
"
```

### Get Latest Event (Stack Trace)

```bash
ISSUE_ID="SCREENPIPE-APP-123"  # Replace with actual issue ID
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/issues/$ISSUE_ID/events/latest/" | \
  python3 -c "
import sys,json
r=json.load(sys.stdin)
print(f'Event: {r.get(\"eventID\", \"?\")}')
print(f'Message: {r.get(\"message\", r.get(\"title\", \"?\"))}')
print(f'Timestamp: {r.get(\"dateCreated\", \"?\")}')
print()
print('Tags:')
for t in r.get('tags', []):
    print(f'  {t[\"key\"]}: {t[\"value\"]}')
print()
print('Exception/Stack trace:')
for entry in r.get('entries', []):
    if entry.get('type') == 'exception':
        for exc in entry.get('data', {}).get('values', []):
            print(f'  {exc.get(\"type\", \"?\")}: {exc.get(\"value\", \"?\")}')
            for frame in exc.get('stacktrace', {}).get('frames', [])[-5:]:
                print(f'    at {frame.get(\"filename\", \"?\")}:{frame.get(\"lineNo\", \"?\")} in {frame.get(\"function\", \"?\")}')
"
```

---

## PowerShell Queries (Windows)

### Auto-Detect Organization Slug

```powershell
$headers = @{ 'Authorization' = "Bearer $env:SENTRY_AUTH_TOKEN" }
$response = Invoke-RestMethod -Uri 'https://sentry.io/api/0/organizations/' -Headers $headers
$response | ForEach-Object { Write-Host "[$($_.slug)] $($_.name)" }
```

### List Projects

```powershell
$orgSlug = 'mediar'  # Replace with actual org slug
$headers = @{ 'Authorization' = "Bearer $env:SENTRY_AUTH_TOKEN" }
$response = Invoke-RestMethod -Uri "https://sentry.io/api/0/organizations/$orgSlug/projects/" -Headers $headers
$response | ForEach-Object { Write-Host "[$($_.slug)] $($_.name) - $($_.platform)" }
```

### Recent Unresolved Issues (All Projects)

```powershell
$orgSlug = 'mediar'
$headers = @{ 'Authorization' = "Bearer $env:SENTRY_AUTH_TOKEN" }
$response = Invoke-RestMethod -Uri "https://sentry.io/api/0/organizations/$orgSlug/issues/?query=is:unresolved&sort=date&limit=15" -Headers $headers
$response | ForEach-Object {
    Write-Host "[$($_.shortId)] $($_.title)"
    Write-Host "  Events: $($_.count) | Last seen: $($_.lastSeen)"
    Write-Host ''
}
```

### Issues for Specific Project

```powershell
$orgSlug = 'mediar'
$projectSlug = 'screenpipe-app'
$headers = @{ 'Authorization' = "Bearer $env:SENTRY_AUTH_TOKEN" }
$response = Invoke-RestMethod -Uri "https://sentry.io/api/0/projects/$orgSlug/$projectSlug/issues/?query=is:unresolved&limit=15" -Headers $headers
$response | ForEach-Object {
    Write-Host "[$($_.shortId)] $($_.title)"
    Write-Host "  Events: $($_.count) | Last: $($_.lastSeen)"
}
```

### Get Issue Details

```powershell
$issueId = 'SCREENPIPE-APP-123'  # Replace with actual issue ID
$headers = @{ 'Authorization' = "Bearer $env:SENTRY_AUTH_TOKEN" }
$response = Invoke-RestMethod -Uri "https://sentry.io/api/0/issues/$issueId/" -Headers $headers
Write-Host "Issue: $($response.shortId)"
Write-Host "Title: $($response.title)"
Write-Host "Culprit: $($response.culprit)"
Write-Host "Status: $($response.status)"
Write-Host "Events: $($response.count)"
Write-Host "Users: $($response.userCount)"
Write-Host "First: $($response.firstSeen)"
Write-Host "Last: $($response.lastSeen)"
```

### Get Latest Event (Stack Trace)

```powershell
$issueId = 'SCREENPIPE-APP-123'  # Replace with actual issue ID
$headers = @{ 'Authorization' = "Bearer $env:SENTRY_AUTH_TOKEN" }
$response = Invoke-RestMethod -Uri "https://sentry.io/api/0/issues/$issueId/events/latest/" -Headers $headers
Write-Host "Event: $($response.eventID)"
Write-Host "Message: $($response.message)"
Write-Host "Timestamp: $($response.dateCreated)"
Write-Host ''
Write-Host 'Tags:'
$response.tags | ForEach-Object { Write-Host "  $($_.key): $($_.value)" }
Write-Host ''
Write-Host 'Full response (for stack trace):'
$response | ConvertTo-Json -Depth 10
```

---

## Write Operations (Ask First)

### Resolve an Issue

```bash
ISSUE_ID="SCREENPIPE-APP-123"
curl -s -X PUT -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved"}' \
  "https://sentry.io/api/0/issues/$ISSUE_ID/"
```

### Ignore an Issue

```bash
ISSUE_ID="SCREENPIPE-APP-123"
curl -s -X PUT -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "ignored"}' \
  "https://sentry.io/api/0/issues/$ISSUE_ID/"
```

---

## Query Syntax

### Filters
- `is:unresolved` / `is:resolved` / `is:ignored`
- `environment:production` / `environment:staging`
- `lastSeen:-24h` / `lastSeen:-7d`
- `level:error` / `level:warning`
- `os:windows` / `os:macos` / `os:linux`

### Sort
- `sort=date` - Most recent
- `sort=freq` - Most frequent
- `sort=user` - Most users affected

### Examples
```
is:unresolved environment:production lastSeen:-24h
is:unresolved level:error sort:user
is:unresolved os:windows
```

---

## Debugging Windows Onboarding Crash

When investigating Windows-specific crashes (like onboarding issues):

1. First, list all issues filtered by Windows:
```bash
ORG_SLUG="mediar"
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/$ORG_SLUG/issues/?query=is:unresolved+os:windows&sort=date&limit=20"
```

2. Search for onboarding-related issues:
```bash
ORG_SLUG="mediar"
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/$ORG_SLUG/issues/?query=is:unresolved+onboarding&sort=date&limit=20"
```

3. Get the stack trace of the most recent crash to identify the root cause.
