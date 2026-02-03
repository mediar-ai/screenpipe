# Supabase Read-Only Agent Skill

Safe, read-only access to the Screenpipe Supabase database for skills and agents.

## 📋 What's Here

| File | Purpose |
|------|---------|
| **SKILL.md** | Main skill documentation - schema, safety guidelines, and usage |
| **SETUP.md** | Quick start guide and troubleshooting |
| **supabase-agent.ts** | Ready-to-use TypeScript/JavaScript agent implementation |
| **PROMPT_TEMPLATE.md** | Prompt templates for skills that use this agent |
| **README.md** | This file |

## 🚀 Quick Start

```bash
# 1. Pull environment variables (never hardcode!)
vercel env pull

# 2. Install dependency
bun add @supabase/supabase-js

# 3. Use in your code
import { SupabaseReadAgent } from "./.pi/skills/supabase-read/supabase-agent"

const features = await SupabaseReadAgent.getActiveFeatures()
```

## 🔒 Safety First

This skill is designed with security in mind:

- **Read-only access** - no writes, deletes, or modifications
- **Public key only** - private keys never in code
- **RLS protection** - blocked tables can't be accessed even with public key
- **Schema documentation** - clear what's safe to query
- **No hardcoded secrets** - uses Vercel CLI or environment variables
- **Rate limiting** - respects Supabase API limits

## 🗂️ Safe Tables

```
user_analytics   → Anonymous event statistics
features         → Feature flag status
pricing_tiers    → Subscription information
```

## 🚫 Blocked Tables

These tables are protected by Supabase Row-Level Security:

```
users, sessions, api_keys, logs, audit_trail
payment_info, support_tickets, error_logs
```

Even if attempted, RLS policies will deny access.

## 📚 Documentation

### For End Users
- Start with **SETUP.md** for installation
- Read **SKILL.md** for what tables exist and how to query them

### For Skill Developers
- Use **supabase-agent.ts** as a reference implementation
- Check **PROMPT_TEMPLATE.md** for how to write prompts
- Review **SKILL.md** for safety guidelines

### For Maintainers
- All three main sections (Setup, Schema, Troubleshooting) in **SKILL.md**
- Add new safe tables in "Safe Tables for Querying" section
- Update blocked tables list if access changes

## 💡 Example Usage

### Get Active Features
```typescript
const agent = SupabaseReadAgent
const features = await agent.getActiveFeatures()

// Output:
// [
//   { id: "uuid", name: "ocr_beta", enabled: true, ... },
//   { id: "uuid", name: "advanced_search", enabled: false, ... }
// ]
```

### Check Feature Status
```typescript
const isEnabled = await agent.getFeatureStatus("ocr_beta")
console.log(`OCR Beta: ${isEnabled ? "enabled" : "disabled"}`)
```

### Get Pricing Information
```typescript
const tiers = await agent.getPricingTiers()
tiers.forEach(tier => {
  console.log(`${tier.name}: $${tier.monthly_price / 100}/month`)
})
```

### Query Analytics with Filters
```typescript
const events = await agent.queryPublicAnalytics({
  eventType: "capture",
  startDate: new Date("2025-01-01"),
  endDate: new Date("2025-02-01"),
  limit: 100
})
```

## 🔑 Environment Variables

The agent reads from `.env.local` (never committed):

```env
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_PUBLIC_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**To get these:**
```bash
vercel env pull
```

## ⚙️ How It Works

1. **Public Key Only** - The agent uses only the Supabase public key
2. **RLS Policies** - Supabase database enforces row-level security
3. **Limited Tables** - Public key can only access documented tables
4. **Read-Only** - Supabase policies block writes/deletes
5. **Rate Limited** - 100 req/min per IP, 10k/day per project

```
┌─────────────────────────────────────────────────────┐
│ Your Agent/Skill                                    │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ (read-only query)
                       ▼
┌─────────────────────────────────────────────────────┐
│ SupabaseReadAgent (public key only)                 │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ (public_key + SELECT query)
                       ▼
┌─────────────────────────────────────────────────────┐
│ Supabase (eu.i.posthog.com)                         │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Row-Level Security                              │ │
│ │ ✅ Allow: SELECT from user_analytics            │ │
│ │ ✅ Allow: SELECT from features                  │ │
│ │ ✅ Allow: SELECT from pricing_tiers             │ │
│ │ ❌ Block: users, sessions, logs, api_keys       │ │
│ │ ❌ Block: Any write/delete operations           │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 🚨 What NOT to Do

```typescript
// ❌ Never hardcode keys
const client = createClient(
  "https://...",
  "eyJ...hardcoded"
)

// ❌ Never commit .env.local
git add .env.local  // NO! It's .gitignored

// ❌ Never query blocked tables
await supabase.from("users").select("*")
await supabase.from("sessions").select("*")
await supabase.from("logs").select("*")

// ❌ Never attempt writes
await supabase.from("features").insert({ ... })
await supabase.from("pricing_tiers").update({ ... })
```

## ✅ What to Do

```typescript
// ✅ Use environment variables
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLIC_KEY!
)

// ✅ Keep .env.local in .gitignore
// (It already is - verified in root .gitignore)

// ✅ Only query safe tables
await supabase.from("features").select("name, enabled")
await supabase.from("pricing_tiers").select("name, price")

// ✅ Read-only operations only
// (Supabase RLS blocks writes automatically)
```

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Missing Supabase environment variables" | Run `vercel env pull` |
| "401 Unauthorized" | Check public key is correct (not private) |
| "403 Forbidden" | Table is blocked by RLS - check SKILL.md |
| "Column not found" | Verify column exists in schema |
| "Rate limit exceeded" | Cache results, wait 1 minute, try again |

See **SETUP.md** for detailed troubleshooting.

## 🔗 Related Resources

- **Supabase Docs:** https://supabase.com/docs
- **Row-Level Security:** https://supabase.com/docs/guides/auth/row-level-security
- **API Limits:** https://supabase.com/docs/guides/platform/api-limits
- **Main skill file:** See `SKILL.md` in this directory

## 📖 For Skill Writers

Want to create a skill that uses this agent?

1. Read `SKILL.md` to understand the schema
2. Import `SupabaseReadAgent` from `supabase-agent.ts`
3. Use `PROMPT_TEMPLATE.md` for your prompts
4. Document what tables you're querying and why
5. Include safety notes in your skill docs

Example skill header:
```markdown
---
name: my-skill
description: "Query Screenpipe feature availability"
allowed-tools: Read, Write
---

This skill queries read-only Supabase tables:
- features (feature status)
- pricing_tiers (pricing information)

No private data is accessed.
```

## 📝 License & Privacy

- **Code:** Licensed under Screenpipe project license
- **Data:** Only public, anonymized data is accessible
- **Privacy:** User data is never exposed via this agent
- **Transparency:** All tables and columns are documented

## ❓ Questions?

If you need to:
- Query a different table
- Access currently blocked data
- Understand a specific column
- Add new tables

Contact the maintainers with a clear use case.

---

**Remember:** With great data access comes great responsibility. Use this agent wisely and respect user privacy. 🔒
