# PII release gate

Draft implementation, not a complete product privacy guarantee.

<!-- doc-covers: crates/screenpipe-db/src/db/privacy_release.rs, crates/screenpipe-redact/src/worker/release.rs, crates/screenpipe-engine/src/routes/privacy_release.rs, apps/screenpipe-app-tauri/src-tauri/src/enterprise/sync.rs -->
<!-- doc-verified: a71e821de98615c9bafde1574298cb592b664634 -->

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

## Validation

The regression suite uses synthetic private text and generated screenshot pixels. It covers real SQLite and hybrid storage, the actual worker and HTTP router, screenshot serving, cached-policy revocation, restart durability, late completion, upload acknowledgement failure and pre-upload policy changes. The synthetic detectors make ordering deterministic; these tests do not measure real-model recall or deployment performance.

## Merge blockers and boundaries

- Protected mode currently closes raw SQL, raw video export, original audio samples, frame streaming, on-demand OCR, live content events, activity summaries, artifacts and database backup. These paths need their own release adapters and accurate product status before rollout.
- Meetings, speakers, semantic actors, outputs, feedback and executions have no release worker in this draft. Their protected views stay empty. Parsed, activity and feedback enterprise uploads are held. This is a functional limitation, not a transient processing delay.
- Historical administrative replay is rejected in protected mode until pending work can be tracked within the exact requested range. Regular sync supports late completion; replay must not report success while relevant records remain pending.
- The gate covers the selected local API and enterprise upload paths. Native model consumers that read the raw database, direct filesystem access, browser tools, other sync services, support logs and cloud history require separate boundary review. An agent with unrestricted filesystem access can bypass an HTTP gate.
- Large-history pending-queue scans, ready-event retention, policy-upgrade backlogs and inference throughput still need a representative benchmark. Do not describe the change as zero overhead or ready for production based on the regression suite.
- A remote detector upgrade must preserve or advance its policy identity. Local version constants cannot independently attest an unversioned remote deployment. Image receipts also rely on capture-owned files not being rewritten outside the database lifecycle.

The branch should remain draft until these rollout limits have a reviewed resolution.
