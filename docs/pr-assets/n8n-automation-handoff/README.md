# n8n in Automations

<!-- doc-covers: apps/screenpipe-app-tauri/components/n8n-automations.tsx, apps/screenpipe-app-tauri/lib/n8n.ts -->
<!-- doc-verified: 660451ae4 -->

The Automations page previously offered local scheduled tasks and community
workflows. This change adds an n8n tab for connecting an instance, asking the
existing Screenpipe agent to build a draft, and returning to the n8n editor.

## Intended experience

1. Connect an n8n Cloud or self-hosted instance through Screenpipe's existing MCP
   editor. Enable Instance-level MCP in n8n first. OAuth and manual access-token
   entry use the existing local engine and secret storage.
2. Describe an automation or adapt an example. Screenpipe probes the registered
   server's advertised creation, validation, node-schema and SDK-reference tools.
   It keeps the build action disabled when those capabilities are unavailable.
3. Continue in the existing Screenpipe chat. The supplied context asks the agent
   to discover node schemas, validate SDK code, avoid duplicate drafts, and return
   a real workflow ID and editor link. It asks for an unpublished draft and leaves
   execution and publication for review. This is agent guidance, not a new
   deterministic permission layer; the existing runtime permission rules apply.
4. Open the draft in n8n, connect service accounts and choose any missing folder,
   sheet, channel, or recipient. Test and publish there. The UI does not claim
   that a saved workflow or a connected MCP server proves a successful run.

Recent workflows use the read-only `search_workflows` tool. Draft, published and
unknown state come from its response. Provider errors remain errors, including
MCP errors returned with HTTP 200. Existing n8n servers are discovered by their
instance-level endpoint, and users can select among registered instances.

## Scope and follow-up

This is a desktop integration with the user's own n8n instance. It reuses the
existing Screenpipe chat, MCP bridge, connection editor and secret handling.
It does not embed n8n's AI chat or editor. n8n's documentation states that
surfacing its editor inside another product needs an OEM agreement. A hosted
Screenpipe service with per-customer provisioning and account onboarding is a
separate implementation and commercial decision.

Connecting n8n does not create a capture-data bridge. A cloud workflow cannot
reach the user's local Screenpipe API. A workflow that consumes screen data
needs an explicit, minimal payload handoff designed and tested separately.

## Evidence

All images are screenshots of the real `/home?section=pipes` React route in the
maintained browser-mock build, with fictional data. They are not Figma drawings,
installed-app screenshots, real n8n authentication, or live execution receipts.
The baseline was captured from `660451ae4` before editing. Normal captures use
1280×720 in dark mode; the compact error capture uses 900×720 and has no
horizontal page overflow. The task browser viewport was restored afterward.

| Asset | State |
| --- | --- |
| before-automations.jpg | Original My tasks page |
| after-automations.jpg | Same page with the n8n entry |
| n8n-connect.jpg | New instance setup, draft composer available |
| n8n-sign-in.jpg | Reused OAuth/manual connection editor |
| n8n-build-top.jpg | Connected builder with an invoice request |
| n8n-build.jpg | Scrolled workflow list with draft/published labels |
| n8n-limited.jpg | Reachable server without builder tools |
| n8n-error.jpg | Unreachable server, build disabled |
| n8n-compact.jpg | Recovery state at compact desktop width |

Validation from `apps/screenpipe-app-tauri`:

```sh
bun run test:vitest lib/n8n.test.ts components/n8n-automations.test.tsx components/__tests__/pipe-store-error-state.test.tsx lib/pipe-connections.test.ts components/chat/standalone/hooks/use-chat-window-events.test.tsx
bun x tsc --noEmit --pretty false
```

Result: 25 tests passed across five files; TypeScript passed. UI interactions
verified tab navigation, URL normalization into the shared editor, example
selection, draft retention, capability/error states, and navigation into chat.
The browser mock delivered the request to chat but could not run the native
agent; it restored the full request into the composer. This does not establish
live agent behavior. No native command or engine route was added.

Live sign-in, draft creation/readback, missing-account onboarding, and execution
remain unverified. Before promoting the PR, exercise a disposable n8n instance
and retain provider receipts. Cover a valid invoice draft, preserved local task
creation, a read-only/older instance that must not build, an interrupted create
that must not duplicate the workflow, and a request for local data that must not
expose the user's local API. Prompt assertions and mock tests are structural
checks, not agent trials or measured user outcomes.

## Provider references

- [Instance-level MCP and version requirements](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/)
- [Workflow builder tool contracts](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference)
- [n8n AI Workflow Builder](https://docs.n8n.io/build/ways-of-building-workflows/ai-workflow-builder/)
- [OEM editor integration](https://docs.n8n.io/deploy/host-n8n/deploy-as-an-oem-integration/)
