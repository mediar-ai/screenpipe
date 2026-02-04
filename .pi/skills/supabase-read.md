---
name: supabase-read
description: "Read-only Supabase agent. Single-file TS agent doc using dotenv env vars."
allowed-tools: Read
---

# Supabase Read-Only Agent (TypeScript, Single-File)

**Goal:** Read public Supabase tables only using environment variables loaded from `.env` via `dotenv`.

## ✅ Safety Rules

- **Read-only**: no inserts/updates/deletes.
- **Public tables only**: do not query private tables (users, sessions, logs, api_keys, etc.).
- **No secrets in repo**: never commit keys, only read from `.env`.

## Environment

Create `.env` (gitignored):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLIC_KEY=your_public_anon_key
```

Load with dotenv:

```bash
bun add dotenv @supabase/supabase-js
```

## Agent (TypeScript)

```ts
// supabase-read-agent.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLIC_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLIC_KEY in .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function getActiveFeatures() {
  const { data, error } = await supabase
    .from("features")
    .select("id, name, enabled, description, created_at, updated_at")
    .eq("enabled", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPricingTiers() {
  const { data, error } = await supabase
    .from("pricing_tiers")
    .select(
      "id, name, monthly_price, features, storage_gb, api_calls_month, created_at"
    )
    .order("monthly_price", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAnalytics({
  eventType,
  startDate,
  endDate,
  limit = 100,
}: {
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  let query = supabase
    .from("user_analytics")
    .select("id, event_type, event_count, date, created_at");

  if (eventType) query = query.eq("event_type", eventType);
  if (startDate)
    query = query.gte("date", startDate.toISOString().split("T")[0]);
  if (endDate) query = query.lte("date", endDate.toISOString().split("T")[0]);

  query = query.limit(Math.min(limit, 1000));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

## Safe Tables (Public)

- `features`
- `pricing_tiers`
- `user_analytics`

## Blocked Tables (Do Not Touch)

`users`, `sessions`, `api_keys`, `logs`, `audit_trail`, `payment_info`, `support_tickets`, `error_logs`

## Notes

- This agent **must** use `SUPABASE_PUBLIC_KEY` only.
- **Never** hardcode keys or commit `.env` files.
- If data is missing, it likely means RLS blocks the table.
