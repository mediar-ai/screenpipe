# Enterprise AI-tool setup policy

<!-- doc-covers: none -->

`lockedSettings.autoConnectAiTools` controls automatic local Screenpipe MCP and
skill setup for supported, detected AI tools. It defaults to enabled when absent.
Both JSON booleans and the control plane's `"true"` / `"false"` strings are accepted.
Malformed values defer automatic setup; missing/null values use the enabled default.
The control plane preserves malformed values as an explicit disable instead of
dropping the key. Clearing the policy in the editor restores the enabled default.

```json
{
  "hiddenSections": ["app_ui"],
  "lockedSettings": { "autoConnectAiTools": "true" }
}
```

The native policy fetch owns this setting, independently of app visibility and
recording authorization. A workspace pause or failed enrollment does not discard
an authenticated AI-tool policy. The background installer checks it before each
scan and after acquiring the setup lock. Re-enabling starts a fresh reconciliation
so changes made while setup was disabled are discovered. A revision counter
preserves even disable/re-enable transitions between scans. Request ordering
prevents a delayed older response from overriding a newer successful decision.

Enterprise startup waits for the first native policy attempt before automatic
setup, preventing an initial enabled default from racing a server-side disable.
A failed attempt releases that barrier using the last cached decision, or the
enabled default when no cache exists. The native watcher continues retrying.
The most recent authenticated decision is cached as `auto_connect_ai_tools` in
the user's `enterprise.json`. Unreadable or malformed caches defer setup until a
valid server policy arrives; existing configuration is never overwritten to
repair a malformed cache. Removing the server setting restores the enabled
default on refresh. Authentication recovery preserves the last decision.

A cache-write failure is logged and the current process still applies the server
policy. After restart, the last successfully persisted decision is used until a
fresh policy arrives. An older cached enabled value can therefore remain active
offline if persisting a later disable failed.

Setting it to `false` stops future automatic setup passes. A pass already running
may finish; existing MCP configurations and skills remain installed. This is not
an access-revocation policy. Explicit per-tool disconnects remain respected when
the organization enables automatic setup.

Only detected clients supported by Screenpipe are configured. MCP-only clients
receive MCP configuration; supported skill clients also receive the bundled
Screenpipe skills. Screenpipe does not install the AI applications themselves.
The policy requires a desktop version that implements it; older versions retain
their existing behavior.

Automatic setup uses the effective local API authentication setting, including
authentication forced by LAN access. It waits for the server to resolve the
shared key before writing authenticated MCP configuration.
