# Supabase Read-Only Agent Skill - File Index

## 📁 Skill Directory Structure

```
.pi/skills/supabase-read/
├── SKILL.md                 ← Main documentation (read this first)
├── README.md                ← Overview and quick reference
├── SETUP.md                 ← Installation & troubleshooting
├── supabase-agent.ts        ← Implementation (TypeScript)
├── PROMPT_TEMPLATE.md       ← Prompts for skills using this agent
├── INDEX.md                 ← This file
└── .gitignore               ← What not to commit (see root)
```

## 📖 Reading Guide

### 👤 If You're...

**A User/End User:**
1. Start with `README.md` (overview)
2. Follow `SETUP.md` (installation)
3. Jump to examples in `SKILL.md`

**A Skill Developer:**
1. Read `SKILL.md` entirely (schema & safety)
2. Check `supabase-agent.ts` for API
3. Use `PROMPT_TEMPLATE.md` for prompts in your skill
4. Reference `SKILL.md` "Safe Tables" when writing queries

**A Maintainer/Admin:**
1. Review `SKILL.md` (comprehensive documentation)
2. Check `supabase-agent.ts` (implementation)
3. Update "Safe Tables" or "Blocked Tables" sections as needed
4. Review `PROMPT_TEMPLATE.md` safety guardrails
5. Update `SETUP.md` if dependencies or steps change

**An AI/Agent:**
1. Load `PROMPT_TEMPLATE.md` for context
2. Reference `SKILL.md` for schema details
3. Use `supabase-agent.ts` as implementation guide
4. Follow safety guidelines in all files

## 🎯 By Purpose

### Need to Query the Database?
→ `SKILL.md` (Schema section) + `supabase-agent.ts` (Examples)

### Getting "Environment Variables" Error?
→ `SETUP.md` (Step 2: Fetch Environment Variables)

### Writing a Skill That Uses This?
→ `PROMPT_TEMPLATE.md` + `supabase-agent.ts`

### Understanding What's Safe/Unsafe?
→ `SKILL.md` (Safe Tables vs Blocked Tables)

### Troubleshooting Errors?
→ `SETUP.md` (Troubleshooting section)

### Rate Limiting Issues?
→ `SKILL.md` (Rate Limiting section) + `PROMPT_TEMPLATE.md`

### Security Review?
→ `SKILL.md` (Safety Guidelines) + `PROMPT_TEMPLATE.md` (Safety Guardrails)

## 📋 File Purposes

| File | Purpose | Audience | Read Time |
|------|---------|----------|-----------|
| **SKILL.md** | Complete documentation: schema, safety, usage | Everyone | 15 min |
| **README.md** | Quick overview and reference | Everyone | 5 min |
| **SETUP.md** | Installation, environment, troubleshooting | Users, Devs | 8 min |
| **supabase-agent.ts** | Working implementation with examples | Devs | 10 min |
| **PROMPT_TEMPLATE.md** | Prompt patterns and error handling | Skill writers | 12 min |
| **INDEX.md** | This navigation guide | Everyone | 3 min |

## 🔒 Security Features

All files include safety information:

- **SKILL.md**: "Safety Guidelines" + "Unsafe Tables (Blocked)"
- **supabase-agent.ts**: Inline comments about what NOT to do
- **SETUP.md**: "Safety Checklist" section
- **PROMPT_TEMPLATE.md**: "Safety Guardrails in Prompts" + examples
- **README.md**: "What NOT to Do" vs "What to Do"

## 🚀 Quick Reference

### Setup (Copy-Paste Ready)

```bash
# 1. Pull environment
vercel env pull

# 2. Install package
bun add @supabase/supabase-js

# 3. Import in code
import { SupabaseReadAgent } from "./.pi/skills/supabase-read/supabase-agent"

# 4. Use it
const features = await SupabaseReadAgent.getActiveFeatures()
```

### Safe Tables (Always OK to Query)

```
✅ user_analytics  (aggregate stats)
✅ features        (feature flags)
✅ pricing_tiers   (pricing info)
```

### Blocked Tables (RLS Prevents Access)

```
❌ users           (personal data)
❌ sessions        (auth tokens)
❌ api_keys        (credentials)
❌ logs            (internals)
❌ audit_trail     (user tracking)
❌ payment_info    (financial data)
❌ support_tickets (private messages)
❌ error_logs      (system details)
```

## 📚 Cross-References

From any file, you can jump to:

- **SKILL.md** → Schema definitions, safety guidelines, RLS explanation
- **SETUP.md** → Environment variables, installation, error solutions
- **supabase-agent.ts** → API functions, implementation details
- **PROMPT_TEMPLATE.md** → Prompt patterns, error messages, guardrails
- **README.md** → Overview, quick start, architecture

## ✅ Checklist for Skill Writers

Before publishing a skill using this agent:

- [ ] Read `SKILL.md` completely
- [ ] Only query tables in "Safe Tables" list
- [ ] Review `PROMPT_TEMPLATE.md` for error handling
- [ ] Add safety disclaimers to your skill's docs
- [ ] Test with `SUPABASE_PUBLIC_KEY` (never private)
- [ ] Verify `.env.local` is `.gitignored`
- [ ] Document what tables you query
- [ ] Never hardcode any credentials
- [ ] Include "Rate Limiting" note if you do repeated queries
- [ ] Test error cases (network issues, missing env, invalid queries)

## 🆘 Help & Support

| Issue | Resource |
|-------|----------|
| Blank stare at Supabase? | Start with `README.md` |
| "How do I install?" | Follow `SETUP.md` |
| "What tables exist?" | Check `SKILL.md` schema section |
| "Is this table safe?" | See "Safe Tables" in `SKILL.md` |
| "How do I write prompts?" | Use `PROMPT_TEMPLATE.md` |
| "Getting errors?" | Troubleshoot in `SETUP.md` |
| "Is this operation allowed?" | Check safety in `SKILL.md` |
| "Need implementation example?" | Review `supabase-agent.ts` |

## 📝 Notes

- **No secrets in files**: All code files use environment variables
- **All documentation public**: Safe to share on GitHub
- **Maintained by**: Screenpipe maintainers
- **Last updated**: February 3, 2026
- **Version**: Matches Supabase SDK @latest

## 🔄 How to Stay Current

If documentation changes:

1. Check git history: `git log -- .pi/skills/supabase-read/`
2. Review changes: `git diff HEAD~1 .pi/skills/supabase-read/`
3. Update local `.env.local` if needed: `vercel env pull`
4. Reinstall package if major version: `bun install @supabase/supabase-js@latest`

---

**TL;DR:**
- New here? Read `README.md` then `SETUP.md`
- Want schema? Go to `SKILL.md`
- Writing a skill? Use `PROMPT_TEMPLATE.md`
- Need code? Check `supabase-agent.ts`
- Got errors? See `SETUP.md` troubleshooting
