# Remote Agent Service - Plan

> Spawn personal AI agents on VMs with your screen context. Chat from mobile. Let it work for you.

## Vision

Turn screenpipe from "search your screen history" into "AI assistant that knows everything you do and can act on it."

Every user gets their own Clawdbot-like agent:
- Runs 24/7 on a VM (not their laptop)
- Has full context from their daily screenpipe summaries
- Chat via Telegram/WhatsApp/SMS from phone
- Can take actions: send emails, create PRs, schedule meetings, etc.

## User Flow

```
1. User installs screenpipe (already exists)
2. User clicks "Enable Remote Agent" in settings
3. We spin up a VM with their agent
4. They connect via Telegram/WhatsApp
5. Agent receives hourly context syncs
6. User chats: "What was I working on?" / "Send that email I drafted"
```

## Architecture

```
┌─────────────────┐      hourly sync       ┌─────────────────────┐
│  User's Mac     │ ───────────────────▶   │  User's Agent VM    │
│  (screenpipe)   │      summaries.md      │  (clawdbot)         │
└─────────────────┘                        └──────────┬──────────┘
                                                      │
                                                      │ chat
                                                      ▼
                                           ┌─────────────────────┐
                                           │  Telegram/WhatsApp  │
                                           │  (user's phone)     │
                                           └─────────────────────┘
```

## Components

### 1. Agent Provisioning Service
- API to create/destroy agent VMs
- Options: Hetzner ($4/mo), Fly.io, Railway, or self-hosted
- Each user gets isolated container/VM
- Pre-configured with clawdbot + Telegram bot

### 2. Onboarding Flow (in screenpipe app)
```
Settings > Remote Agent
├── [ ] Enable Remote Agent
├── Connect: [Telegram] [WhatsApp] [SMS]
├── Status: ● Running (us-west-1)
└── [Test Connection] [View Logs] [Stop Agent]
```

### 3. Sync Integration
- Extend `@screenpipe/sync` to push to user's agent
- Each user gets unique SSH key or API token
- Summaries land in agent's context folder

### 4. Agent Capabilities (via MCP/tools)
- **Read**: Query screenpipe history, read files
- **Write**: Draft emails, create documents
- **Execute**: Git commits, API calls, shell commands
- **Communicate**: Send messages, schedule reminders

## Pricing Model

| Tier | Price | What You Get |
|------|-------|--------------|
| Free | $0 | Local only, no remote agent |
| Pro | $20/mo | Remote agent VM, Telegram, 24/7 |
| Team | $50/mo | + Shared context, team agents |

Margin: ~$15/user (VM costs ~$5/mo)

## Implementation Phases

### Phase 1: MVP (2 weeks)
- [ ] Agent provisioning API (create VM, deploy clawdbot)
- [ ] Telegram bot setup flow in screenpipe app
- [ ] Sync to user's agent VM
- [ ] Basic chat working

### Phase 2: Polish (2 weeks)
- [ ] WhatsApp integration
- [ ] In-app agent status/logs
- [ ] Retry/reconnect logic
- [ ] Usage dashboard

### Phase 3: Actions (2 weeks)
- [ ] Email drafting/sending
- [ ] Calendar integration
- [ ] GitHub actions (PRs, issues)
- [ ] Custom MCP tools

### Phase 4: Scale (ongoing)
- [ ] Multi-region deployment
- [ ] Team/shared agents
- [ ] Custom agent personas
- [ ] Voice interface

## Technical Decisions

### VM Provider
**Recommendation: Fly.io**
- Easy API for provisioning
- Per-second billing
- Good for containers
- Alternative: Hetzner for cost ($4/mo vs $7/mo)

### Agent Runtime
**Recommendation: Clawdbot/OpenClaw**
- Already battle-tested (Louis uses it)
- Native Telegram/WhatsApp support
- Cron, memory, skills system
- Alternative: Build custom (more control, more work)

### Sync Protocol
**Recommendation: SSH + rsync (existing)**
- Already implemented in @screenpipe/sync
- Simple, secure, works
- Alternative: API-based (more complex, easier to debug)

### Auth/Identity
**Recommendation: Screenpipe account + Telegram linking**
- User creates screenpipe account
- Links Telegram via bot token
- Agent knows who's chatting

## Security Considerations

1. **Data isolation**: Each user's agent is fully isolated
2. **Encryption**: Summaries encrypted in transit (SSH)
3. **Access control**: Only user can chat with their agent
4. **No raw data**: Only AI summaries leave user's machine
5. **Kill switch**: User can delete agent + all data instantly

## Open Questions

1. **Self-hosted option?** Let power users run their own agent
2. **Shared context?** Can teams share an agent?
3. **Offline mode?** What happens when user's laptop is off?
4. **Action approvals?** Should agent ask before sending emails?

## Success Metrics

| Metric | Target |
|--------|--------|
| Agent activation rate | 20% of Pro users |
| Daily active agents | 50% of activated |
| Messages per user/day | 5+ |
| Action completion rate | 80% |

## Risks

1. **Infra costs** - VMs are expensive at scale
2. **Reliability** - Users expect 24/7 uptime
3. **Abuse** - Agents doing bad things
4. **Complexity** - Many moving parts

## Next Steps

1. Validate demand (tweet about it, gauge interest)
2. Build provisioning API prototype
3. Test with 5 beta users
4. Iterate on UX
5. Launch in screenpipe Pro

---

*Draft: 2026-01-31*
