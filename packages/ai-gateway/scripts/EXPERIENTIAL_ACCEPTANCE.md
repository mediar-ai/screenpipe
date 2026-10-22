<!-- screenpipe — AI that knows everything you've seen, said, or heard -->
<!-- https://screenpipe.com -->

# Live Experiential acceptance

This tests the existing Screenpipe Worker on loopback with migrated D1 and its
installed provider SDKs. The Worker selects its actual Experiential connection for internal-service
requests. Only its synthetic credential is replaced outside the Worker before
live dispatch; endpoint selection and Haiku spelling now belong to runtime code. Authentication uses the harness's synthetic internal service token;
this does not prove deployed routing or customer cutover. Customer JWT traffic
retains Cloudflare enforcement even when the internal canary is enabled.

Load the authorized test credential into `EXPLABS_API_KEY` without printing it.
From `packages/ai-gateway`, set `EXPERIENTIAL_ACCEPTANCE_ORG_ID` to the exact test
organization and `EXPERIENTIAL_ACCEPTANCE_REPORT` to a private absolute JSON path:

```sh
bun scripts/experiential-acceptance.ts --allow-spend
```

The script refuses a different organization or a configuration that does not have
retention enabled and ZDR disabled. It does not modify account settings, expose
the credential to the Worker, or deploy anything. Each case sends synthetic
content; the bundled image shows four digits. Preserve no-training and all other
account settings. Model access denials remain failures, not policy overrides.

Every hosted model from the source policy is tested through `/chat/completions`,
including Auto. Gemini's native Vertex route, the confidential GLM route, and the
self-hosted classifier stay on their existing providers and are listed separately
in the report. They are not sent as vendor aliases. The verified mappings are native `claude-haiku-5-5` to catalog
`claude-haiku-5.5`, and `gpt-5.6` to `gpt-5.6-sol`. OpenAI's official Sol
documentation confirms that unsuffixed alias, and the authenticated destination
model reports the Sol deployment. Source-model metering and response headers
preserve the caller's model. Other names are never guessed.

Cases exercise JSON, SSE terminal completion and usage, named tools and a second
tool-result turn in both JSON and streaming form, parsed schema output, and
actual image digit reading. Explicit
model requests must be answered by the requested model, with a successful live
upstream request ID; fallback success cannot hide a broken explicit model. Auto
may use its existing fallback chain, and every attempted model is recorded.
Failures produce a nonzero exit status and retain completed results incrementally.
The temporary local Worker and database are disposed at the end.

This supersedes the ad hoc direct-request matrix for cutover acceptance. The
older ZDR-only scripts still test their historical contract and do not represent
the user's requested retaining setup. Passing this harness alone does not enable
production traffic or establish that every original provider can be moved.

For a focused recheck, set comma-separated `EXPERIENTIAL_ACCEPTANCE_MODELS` and
`EXPERIENTIAL_ACCEPTANCE_MODES`. Both are validated against the same full model
and feature manifest; omitted filters run every applicable case. Focused results
do not replace evidence for the other cases.

## Worker switch and rollback

`EXPERIENTIAL_CANARY_MODE=internal` plus a dedicated `EXPERIENTIAL_API_KEY` secret
selects Experiential only for requests already authenticated with Screenpipe's
existing internal-service bearer. No client request field enables it. An omitted
mode or `off` restores Cloudflare on the next request. Public customer plans,
Vertex, confidential GLM, classifier and TTS keep their current paths. The key
stays server-side; no Cloudflare credentials or ZDR preferences go to Experiential.

The real Worker integration test exercises Chat, Astra Responses, Auto through
Claude Messages, and switching back to Cloudflare across a restart while
preserving existing D1 state:

```sh
bun test src/test/hosted-chat-connection.unit.test.ts src/test/experiential-canary.integration.test.ts --timeout=30000
```

This is a canary implementation, not permission to deploy or a customer cutover.
Customer enforcement, current-period carry-in and a public traffic switch still
need their own implementation and verification; enabling this binding does not
silently route customer requests through the organization credential.
