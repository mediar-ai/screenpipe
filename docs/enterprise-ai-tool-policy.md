# Enterprise AI-tool setup policy

<!-- doc-covers: none -->

`lockedSettings.autoConnectAiTools` controls automatic local Screenpipe MCP and
skill setup for supported, detected AI tools. It defaults to enabled when absent.
Both JSON booleans and the control plane's `"true"` / `"false"` strings are accepted.

```json
{
  "hiddenSections": ["app_ui"],
  "lockedSettings": { "autoConnectAiTools": "true" }
}
```

The native background watcher runs independently of app visibility. It checks
the setting before each scan, including after an administrator changes the
policy while Screenpipe is running. The most recent authenticated decision is
cached as `auto_connect_ai_tools` in the user's `enterprise.json` for offline
startup. Removing the setting restores the enabled default at the next policy
refresh. Authentication recovery preserves the last decision.

Setting it to `false` stops future automatic setup passes. A pass already running
may finish; existing MCP configurations and skills remain installed. This is not
an access-revocation policy. Explicit per-tool disconnects remain respected when
the organization enables automatic setup.

Only detected clients supported by Screenpipe are configured. MCP-only clients
receive MCP configuration; supported skill clients also receive the bundled
Screenpipe skills. Screenpipe does not install the AI applications themselves.
The policy requires a desktop version that implements it; older versions retain
their existing behavior.
