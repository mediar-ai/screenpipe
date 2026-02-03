---
name: supabase-read
description: "Read-only Supabase agent. Query public database tables with schema documentation. Secure key retrieval via Vercel CLI."
allowed-tools: Bash, Read, Write
---

# Screenpipe Supabase Read-Only Agent

Safe, read-only access to the Screenpipe Supabase database for querying public data.

## Overview

This agent provides:
- **Read-only database queries** - no writes, deletes, or admin operations
- **Secure key management** - retrieves API key from Vercel CLI (never hardcoded)
- **Schema documentation** - public table structures without operational details
- **Safety guardrails** - blocks dangerous operations and sensitive data access

## Database Schema (Public)

### Safe Tables for Querying

#### `user_analytics` (Public Aggregate Data)
Purpose: User engagement metrics (anonymized)

```sql
-- Public columns only
id                UUID          PRIMARY KEY
user_id           UUID          (hashed/anonymized in public view)
event_type        TEXT          'capture', 'query', 'export'
event_count       INT           Daily aggregate count
date              DATE          Event date
created_at        TIMESTAMP     Record creation
```

**Allowed Queries:**
- Count events by type
- Trending event types over time
- Regional statistics (if available)
- Feature adoption rates

**Forbidden:**
- User identification
- Session logs
- Debug/error information
- Performance metrics that expose infrastructure

---

#### `features` (Public Feature Metadata)
Purpose: Feature flags and availability

```sql
id                UUID          PRIMARY KEY
name              TEXT          Feature name (e.g., 'ocr_beta')
enabled           BOOLEAN       Active/inactive
description       TEXT          Feature description
created_at        TIMESTAMP     Creation date
updated_at        TIMESTAMP     Last update
```

**Allowed Queries:**
- List active features
- Feature availability status
- Feature rollout dates

---

#### `pricing_tiers` (Public Pricing Info)
Purpose: Subscription tier definitions

```sql
id                UUID          PRIMARY KEY
name              TEXT          'free', 'pro', 'enterprise'
monthly_price     INT           Price in cents USD
features          JSONB         Feature set included
storage_gb        INT           Storage limit
api_calls_month   INT           API quota
created_at        TIMESTAMP     Tier creation date
```

**Allowed Queries:**
- Current pricing information
- Tier comparisons
- Feature availability by tier

---

## Unsafe Tables (Blocked)

**NEVER query these tables:**

| Table | Reason |
|-------|--------|
| `users` | Contains personal identifiable information |
| `sessions` | Session tokens, authentication data |
| `api_keys` | Private credentials |
| `logs` | System internals, debug information |
| `audit_trail` | User behavior history (privacy violation) |
| `payment_info` | Financial records |
| `support_tickets` | Private user communications |
| `error_logs` | Stack traces, configuration details |

---

## Environment Setup

### Getting the Supabase Key

**DO NOT** commit the key to git. Retrieve it securely:

```bash
# Using Vercel CLI (recommended)
vercel env pull

# This reads from Vercel project environment and creates .env.local
# Then fetch the public key:
grep SUPABASE_PUBLIC_KEY .env.local
```

If you don't have Vercel CLI:
```bash
# Install it
npm i -g vercel

# Login
vercel login

# Pull environment
vercel env pull

# View key (it's public, safe to share)
cat .env.local | grep SUPABASE_PUBLIC_KEY
```

### .env.local (GitIgnored)

Add to `.env.local` (never commit):

```env
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_PUBLIC_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The **public key** is safe to use in queries. Private keys should NEVER be in repos.

---

## Query Examples

### TypeScript/JavaScript Agent

```typescript
// supabase-agent.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLIC_KEY!
);

// ✅ SAFE: Query public analytics
async function getEventStats() {
  const { data, error } = await supabase
    .from("user_analytics")
    .select("event_type, event_count, date")
    .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // Last 30 days

  if (error) throw error;
  return data;
}

// ✅ SAFE: List features
async function getActiveFeatures() {
  const { data, error } = await supabase
    .from("features")
    .select("name, description, enabled")
    .eq("enabled", true);

  if (error) throw error;
  return data;
}

// ❌ BLOCKED: Don't query user sessions
// async function getUserSessions(userId) {
//   // This will fail - table access denied
//   const { data } = await supabase
//     .from("sessions")
//     .select("*")
//     .eq("user_id", userId);
// }

// ❌ BLOCKED: Don't fetch private API keys
// async function getApiKeys() {
//   // This will fail - table access denied
//   const { data } = await supabase.from("api_keys").select("*");
// }
```

### Row-Level Security (RLS)

All tables have RLS policies enforced:

```sql
-- Public tables only allow SELECT
CREATE POLICY "public_read_only" ON user_analytics
  FOR SELECT
  USING (true);

-- Private tables deny all access via public key
CREATE POLICY "deny_public_access" ON users
  FOR ALL
  USING (false);
```

The Supabase public key is restricted to these policies at the database level.

---

## Safety Guidelines

### ✅ DO

- Query only documented public tables
- Use `.select("col1, col2")` to specify columns
- Filter data with `.eq()`, `.gte()`, `.lte()`
- Aggregate with COUNT, SUM (computed)
- Cache results to reduce queries
- Document why you're querying

### ❌ DON'T

- Try to query undocumented tables
- Select `*` without knowing the schema
- Use `.select("*")` from unknown sources
- Attempt to bypass RLS policies
- Include raw SQL with `rpc()` calls
- Store or expose API keys in code
- Log sensitive data from responses

---

## Rate Limiting

Supabase has rate limits on public key access:
- 100 requests/minute per IP
- 10,000 requests/day per project

**Mitigation:**
- Batch queries where possible
- Cache frequently accessed data
- Use pagination for large result sets

---

## Usage in Skills/Agents

When writing agents that use this skill:

```typescript
import { createClient } from "@supabase/supabase-js";

interface SupabaseAgent {
  queryPublicAnalytics(filters: {
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]>;

  getFeatureStatus(featureName: string): Promise<boolean>;

  getPricingTiers(): Promise<any[]>;
}
```

Document:
- What tables you're querying
- Why you need the data
- What you do with the results
- Any caching strategy

---

## Troubleshooting

### "401 Unauthorized"
- Check `SUPABASE_PUBLIC_KEY` is set correctly
- Verify key hasn't expired
- Confirm key is the **public** key, not private

### "403 Forbidden"
- Table has RLS policies that deny your key
- Check if table is in the "Unsafe Tables" list
- Contact maintainers if you need access to a public table

### "Connection timeout"
- Check network connectivity
- Verify `SUPABASE_URL` is correct
- Check rate limiting (100 req/min)

### "Column not found"
- Verify column name matches schema
- Use `.select("col1, col2")` to list available columns
- Check if column exists in the Supabase dashboard

---

## Related Files

- **Supabase Dashboard:** https://supabase.com/dashboard
- **Project ID:** Check `.env.local` or Vercel project settings
- **Row-Level Security:** Supabase console → Authentication → Policies
- **API Limits:** Supabase console → Settings → API
