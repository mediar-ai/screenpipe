# PII release gate

Draft implementation, not a complete product privacy guarantee.

<!-- doc-covers: crates/screenpipe-db/src/db/privacy_release.rs, crates/screenpipe-redact/src/worker/release.rs, crates/screenpipe-engine/src/routes/privacy_release.rs, apps/screenpipe-app-tauri/src-tauri/src/enterprise/sync.rs -->
<!-- doc-verified: 3872ad7c22434539c7167f65676e538560fec620 -->

Capture persists through the existing writer. Background detectors process a source revision under a desired policy, then publish the sanitized replacement and its receipt in one transaction. A read adapter exposes only current receipts. Text and image completion are independent. Optional regex filtering and legacy timestamps cannot certify required model processing.

```text
capture -> durable local source -> background PII detector
                                       |
                         replacement + revision receipt
                                       |
                      protected reads / completion sequence
                                       |
                      response or upload admission -> transport
```

Model and network I/O remain outside the capture writer. Read requests do not invoke the model. Repeated content can reuse successful detector results under the same policy. The desired identity includes shipped model versions, configured backend, labels, columns and pseudonym mode. A completion receipt proves processing under that contract; it does not prove perfect detection recall.

Enterprise frame, audio transcript, input and memory pages use per-stream completion sequences. An older capture that finishes late remains eligible, and failed uploads retain their checkpoint. The enrollment cutoff remains stable across retries and restarts. Upload admission rejects assembled data after a policy change, deletion or edit of released content. New completions do not invalidate an unrelated prepared batch. Admission is the transport handoff boundary; it cannot retract bytes already sent or remove old cloud copies.

Hybrid payload replacements retain their generation checks. Storage-only sealing preserves receipts. Protected pools participate in database-generation shutdown. Screenshot routes validate image readiness before cache lookup, including fallback candidates. Missing files, unsupported media and model failures remain unreleased.

## Bounded background processing

The work queue is indexed by surface and availability deadline. A completed discovery cursor avoids scanning certified history on every idle poll. Legacy history and policy changes are discovered in pages of 128 IDs using the existing coordinated writer. Each selection examines at most 256 due candidates. Image maturity scheduling advances at most 256 young/future records, and a bounded oldest fallback avoids treating fresh screenshots as an empty queue while mature work is waiting. Source deletion retains a revision tombstone, including while protection is disabled, so reusing an ID cannot accept stale work.

Text scheduling rotates across seven streams and alternates recent and oldest work. A record with multiple fields resumes between slices; no partial record becomes visible. The target duration is checked between model calls, so one inference, JSON parse or large field is not preemptible. Failed attempts count toward CPU cooldown. Images release the shared CPU lane before idle or retry sleeps. Ready events retain only the current event per record; completion sequences still advance monotonically.

## User-visible status

Settings shows processing, history discovery, retry, completion and unavailable states. Text and screenshots are reported separately. The API reads at most 1,001 queue entries per enabled surface, returns counts capped at 1,000, and marks counts as lower bounds during discovery or capping. Normal screenshot maturity waiting does not appear as a failed retry. Status polling runs sequentially every 15 seconds while the settings card is mounted and visible, with a five-second request timeout.

Protected responses expose `x-screenpipe-privacy-completeness: unknown` and `/privacy/status`; JSON search also includes this metadata. An empty protected result must not be treated as proof that matching history does not exist. Status is a global snapshot, not exact completeness for a query range or confirmation of upload completion. HTTP admission checks revocation rather than the completion epoch, so unrelated newly processed records do not reject an otherwise valid response. Caches still use the completion epoch for freshness.

## Performance model

For each modality, let capture rate be λ, sustained governed processing rate be μ, and pending backlog be B. Over Δt seconds, `B_next = max(0, B + (λ - μ) Δt)`. Catch-up time is `B / (μ - λ)` only when μ > λ. A detector outage lasting D needs μ ≥ λ(1 + D/R) to recover within R seconds while capture continues. Text and image rates need separate measurement. The 60-second image maturity delay and normal sync polling add freshness delay even with an empty processing backlog.

Local debug-build measurements on synthetic fixtures: idle queue p95 at 20,000 certified records fell from 12.512 ms for the prior source join to 0.448 ms for the indexed queue. Protected insertion p95 was 0.456 ms in that run; there was no paired protection-off measurement. A 12-record test using the installed v50 ONNX text model loaded in 1.284 s and processed the records in 4.072 s with the worker governor enabled (2.95 records/s). These are stage measurements on one machine, not sustained capacity, recall, end-to-end capture overhead or image throughput guarantees. The ignored benchmark tests are manual and add no CI jobs.

## Validation

The regression suite uses synthetic private text and generated screenshot pixels. It covers real SQLite and hybrid storage, the actual worker and HTTP router, screenshot serving, cached-policy revocation, restart durability, late completion, upload acknowledgement failure and pre-upload policy changes. The synthetic detectors make ordering deterministic; these tests do not measure real-model recall or deployment performance.

## Merge blockers and boundaries

- Protected mode currently closes raw SQL, raw video export, original audio samples, frame streaming, on-demand OCR, live content events, activity summaries, artifacts and database backup. These paths need their own release adapters and accurate product status before rollout.
- Meetings, speakers, semantic actors, outputs, feedback and executions have no release worker in this draft. Their protected views stay empty. Parsed, activity and feedback enterprise uploads are held. This is a functional limitation, not a transient processing delay.
- Historical administrative replay is rejected in protected mode until pending work can be tracked within the exact requested range. Regular sync supports late completion; replay must not report success while relevant records remain pending.
- The gate covers the selected local API and enterprise upload paths. Native model consumers that read the raw database, direct filesystem access, browser tools, other sync services, support logs and cloud history require separate boundary review. An agent with unrestricted filesystem access can bypass an HTTP gate.
- Representative sustained-load tests still need capture-writer contention during discovery/maturity transactions, query p95, memory, real image throughput, large-field inference, power/thermal behavior and policy-upgrade catch-up. The bounded queue and small local benchmarks do not establish zero overhead or production readiness.
- A remote detector upgrade must preserve or advance its policy identity. Local version constants cannot independently attest an unversioned remote deployment. Image receipts also rely on capture-owned files not being rewritten outside the database lifecycle.

The branch should remain draft until these rollout limits have a reviewed resolution.
