---
name: supabase
description: Query Supabase for user data, subscriptions, credits, and support issues. Use when user asks about customers, credits, subscriptions, or needs to look up user information.
tools: Bash, Read
---

# Supabase Database Skill

Query and manage Supabase data for Screenpipe applications.

## Configuration

**URL:** Read `NEXT_PUBLIC_SUPABASE_URL` from `.env.local`
**Service Key:** Read `SUPABASE_SERVICE_KEY` from `.env.local`

### Loading Credentials

**IMPORTANT:** Before running any Supabase query, load credentials:

```bash
export SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d'"' -f2)
export SUPABASE_KEY=$(grep SUPABASE_SERVICE_KEY .env.local | cut -d'"' -f2)
```

Or for screenpipe repo specifically:
```bash
export SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL /Users/louisbeaumont/Documents/screenpipe/.env.local | cut -d'"' -f2)
export SUPABASE_KEY=$(grep SUPABASE_SERVICE_KEY /Users/louisbeaumont/Documents/screenpipe/.env.local | cut -d'"' -f2)
```

---

## Database Schema Overview

### Key Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, clerk_id, credits) |
| `credits` | User credit balances |
| `pending_credits` | Unclaimed purchases |
| `cloud_subscriptions` | Active subscriptions |
| `payments` | Payment history |

### Key Functions (RPC)

| Function | Purpose |
|----------|---------|
| `get_user_credit(user_email)` | Get user credit info |
| `increase_user_credit(target_email, amount_to_add)` | Add credits |
| `has_active_subscription_by_email(target_email)` | Check subscription |
| `give_subscription_to_user_by_email(target_email, subscription_price_id)` | Grant subscription |
| `get_subscription_details_by_email(target_email)` | Get subscription details |

---

## Common Queries

### Look Up User by Email

```bash
curl -s "$SUPABASE_URL/rest/v1/users?email=eq.USER_EMAIL" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool
```

### Get User Credit Balance

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_user_credit" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_email": "USER_EMAIL"}' | python3 -m json.tool
```

### Check Credits Table Directly

```bash
# First get user ID, then query credits
USER_ID="USER_UUID_HERE"
curl -s "$SUPABASE_URL/rest/v1/credits?user_id=eq.$USER_ID" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool
```

### Add Credits to User

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/increase_user_credit" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_email": "USER_EMAIL", "amount_to_add": 100}'
```

### Check Subscription Status

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_subscription_details_by_email" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_email": "USER_EMAIL"}' | python3 -m json.tool
```

### Check Pending Credits (Unclaimed Purchases)

```bash
curl -s "$SUPABASE_URL/rest/v1/pending_credits?email=eq.USER_EMAIL" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool
```

---

## Support Workflows

### User Says "I Purchased But Have No Credits"

1. Look up user:
```bash
curl -s "$SUPABASE_URL/rest/v1/users?email=eq.USER_EMAIL" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY"
```

2. Check credits table:
```bash
curl -s "$SUPABASE_URL/rest/v1/credits?user_id=eq.USER_ID" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY"
```

3. Check pending credits:
```bash
curl -s "$SUPABASE_URL/rest/v1/pending_credits?email=eq.USER_EMAIL&claimed=eq.false" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY"
```

4. If purchase verified (via Stripe), add credits:
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/increase_user_credit" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_email": "USER_EMAIL", "amount_to_add": AMOUNT}'
```

### Grant Free Subscription

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/give_subscription_to_user_by_email" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_email": "USER_EMAIL", "subscription_price_id": "PRICE_ID"}'
```

---

## Admin Queries

### List Recent Users

```bash
curl -s "$SUPABASE_URL/rest/v1/users?order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | \
  python3 -c "import sys,json; [print(f'{u[\"email\"]} - {u[\"created_at\"]}') for u in json.load(sys.stdin)]"
```

### List Users with Credits

```bash
curl -s "$SUPABASE_URL/rest/v1/credits?amount=gt.0&order=amount.desc&limit=20" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool
```

### List Active Subscriptions

```bash
curl -s "$SUPABASE_URL/rest/v1/cloud_subscriptions?status=eq.active" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool
```

### Get Sales Stats

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_sales_stats" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool
```

---

## Query Syntax

### Filters
- `eq.VALUE` - Equals
- `neq.VALUE` - Not equals
- `gt.VALUE` - Greater than
- `lt.VALUE` - Less than
- `gte.VALUE` - Greater than or equal
- `lte.VALUE` - Less than or equal
- `like.*pattern*` - Pattern match
- `ilike.*pattern*` - Case-insensitive pattern
- `is.null` / `is.true` / `is.false`

### Ordering
- `order=column.asc`
- `order=column.desc`

### Pagination
- `limit=N`
- `offset=N`

### Select Specific Columns
- `select=col1,col2,col3`

---

## Important Notes

1. **Service Key Required:** Use `SUPABASE_SERVICE_KEY` (not anon key) for admin operations
2. **Never expose keys:** Always load from environment variables
3. **User privacy:** Only query specific users when needed for support
4. **Verify payments:** Cross-reference with Stripe before adding credits manually
