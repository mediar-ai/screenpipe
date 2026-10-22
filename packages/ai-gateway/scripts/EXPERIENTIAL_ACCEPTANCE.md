<!-- screenpipe — AI that knows everything you've seen, said, or heard -->
<!-- https://screenpipe.com -->

# Live Experiential acceptance

This tests the existing Screenpipe Worker on loopback with migrated D1 and its
installed provider SDKs. Only the outbound inference transport is bridged to
Experiential. Authentication uses the harness's synthetic internal service token;
this does not prove customer entitlement synchronization or deployed routing.

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
in the report. They are not sent as vendor aliases. The only spelling mapping is
native `claude-haiku-5-5` to the verified catalog slug `claude-haiku-5.5`, whose
Anthropic deployment reports that same native model ID. Legacy names without a
verified destination remain failures; no replacement model is guessed.

Cases exercise JSON, SSE terminal completion and usage, named tools and a second
tool-result turn, parsed schema output, and actual image digit reading. Explicit
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
