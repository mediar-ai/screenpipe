# Supabase Read-Only Agent - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
# In your project root
bun add @supabase/supabase-js
```

### 2. Fetch Environment Variables (Secure)

```bash
# Install Vercel CLI if you don't have it
npm i -g vercel

# Pull environment from Vercel (never commit .env.local!)
vercel env pull

# Verify keys are loaded
cat .env.local | grep SUPABASE
```

Your `.env.local` should now have:
```env
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_PUBLIC_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Use the Agent

```typescript
import { SupabaseReadAgent } from "./.pi/skills/supabase-read/supabase-agent";

async function example() {
  // List active features
  const features = await SupabaseReadAgent.getActiveFeatures();
  console.log("Features:", features);

  // Check pricing
  const pricing = await SupabaseReadAgent.getPricingTiers();
  console.log("Pricing tiers:", pricing);

  // Query analytics with filters
  const analytics = await SupabaseReadAgent.queryPublicAnalytics({
    eventType: "capture",
    startDate: new Date("2025-01-01"),
    limit: 100,
  });
  console.log("Events:", analytics);
}

example().catch(console.error);
```

## Safety Checklist

- [ ] Using **public key** only (never private keys)
- [ ] `.env.local` is in `.gitignore` (never commit secrets)
- [ ] Only querying tables in the documented schema
- [ ] Not attempting to modify/delete data (read-only)
- [ ] Not trying to access blocked tables (users, sessions, logs, etc.)
- [ ] Caching results to respect rate limits (100 req/min)

## Troubleshooting

### "Missing Supabase environment variables"

```bash
# Re-pull environment
vercel env pull

# Or manually set (temporary only!)
export SUPABASE_URL=https://[project-id].supabase.co
export SUPABASE_PUBLIC_KEY=your_public_key
```

### "401 Unauthorized"

Your key is invalid or expired:
```bash
# Get fresh key from Vercel
vercel env pull --force

# Verify it's the PUBLIC key, not private
grep SUPABASE_PUBLIC_KEY .env.local
```

### "403 Forbidden"

RLS policy blocks this table for your key:
- Check the table is in the "Safe Tables" section of `SKILL.md`
- Contact maintainers if you need access to a public table

### "Column not found"

Verify the column exists in the schema:
- Check `SKILL.md` for the table definition
- Use specific columns: `.select("id, name")` instead of `.select("*")`

## Integration with Pi Skills

In your Pi skill that uses Supabase:

```markdown
---
name: my-custom-skill
description: "My skill that queries Supabase public data"
allowed-tools: Read, Bash, Write
---

# My Custom Skill

This skill integrates with the Supabase read-only agent...

## Usage

When this skill runs, it reads from public Supabase tables:
- `user_analytics` - Feature usage statistics
- `features` - Feature availability
- `pricing_tiers` - Pricing information

No private data is accessed.
```

## Rate Limiting

Supabase public key has limits:
- **100 requests/minute** per IP
- **10,000 requests/day** per project

**Optimization tips:**
1. Cache frequently accessed data
2. Batch multiple queries
3. Use pagination: `.range(0, 99)`
4. Filter early: `.eq("event_type", "capture")`

## Never Do This

```typescript
// ❌ WRONG: Hardcoding keys
const client = createClient(
  "https://project.supabase.co",
  "eyJ...hardcoded_key"
);

// ❌ WRONG: Committing .env.local
git add .env.local  // No! It's in .gitignore for a reason

// ❌ WRONG: Fetching private tables
await supabase.from("users").select("*");
await supabase.from("api_keys").select("*");
await supabase.from("sessions").select("*");

// ❌ WRONG: Attempting writes
await supabase.from("features").insert({ name: "test" });
await supabase.from("pricing_tiers").update({ price: 99 });
```

## Always Do This

```typescript
// ✅ RIGHT: Use environment variables
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLIC_KEY!
);

// ✅ RIGHT: Keep .env.local in .gitignore
// Verified in .gitignore - never commit secrets

// ✅ RIGHT: Only query documented public tables
await supabase.from("features").select("name, enabled");
await supabase.from("pricing_tiers").select("name, monthly_price");

// ✅ RIGHT: Read-only operations only
// Supabase RLS blocks writes via public key automatically
```

## References

- **Supabase Docs:** https://supabase.com/docs
- **Row-Level Security:** https://supabase.com/docs/guides/auth/row-level-security
- **Public Keys:** Never expose private keys, only public keys are safe to share
- **Rate Limits:** https://supabase.com/docs/guides/platform/api-limits

## Questions?

If you need to query a different table or require different permissions, check:
1. Is the table in the "Safe Tables" section of `SKILL.md`?
2. Do you need data that's currently blocked (users, logs, etc.)?
3. Contact maintainers for approval before expanding access

---

**Remember:** Public ≠ Unsafe. Just because we can query a table doesn't mean we should. Always respect user privacy.
