# PII release gate

Processing and admission contract for the covered local APIs and enterprise uploads. This is not a universal product privacy guarantee.

<!-- doc-covers: crates/screenpipe-db/src/db/privacy_release.rs, crates/screenpipe-db/src/db/privacy_exports.rs, crates/screenpipe-redact/src/worker/release.rs, crates/screenpipe-redact/src/image/worker.rs, crates/screenpipe-engine/src/routes/privacy_release.rs, apps/screenpipe-app-tauri/src-tauri/src/enterprise/sync.rs -->
<!-- doc-verified: c288183019 -->

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

Enterprise frame, audio transcript, input, memory, parsed, activity and feedback pages use per-stream completion sequences. An older capture that finishes late remains eligible, and failed uploads retain their checkpoint. The enrollment cutoff remains stable across retries and restarts. Upload admission rejects assembled data after a policy change, deletion or edit of released content. New completions do not invalidate an unrelated prepared batch. Admission is the transport handoff boundary; it cannot retract bytes already sent or remove old cloud copies.

Hybrid payload replacements retain their generation checks. Storage-only sealing preserves receipts. Protected pools participate in database-generation shutdown. Screenshot routes validate image readiness before cache lookup, including fallback candidates. Missing files, unsupported media and model failures remain unreleased.

## Bounded background processing

The work queue is indexed by surface and availability deadline. A completed discovery cursor avoids scanning certified history on every idle poll. Legacy history and policy changes are discovered in pages of 128 IDs using the existing coordinated writer. Each selection examines at most 256 due candidates. Image maturity scheduling advances at most 256 young/future records, and a bounded oldest fallback avoids treating fresh screenshots as an empty queue while mature work is waiting. Undecodable image timestamps defer that record without blocking valid work; other database errors still propagate. Source deletion retains a revision tombstone, including while protection is disabled, so reusing an ID cannot accept stale work.

Text scheduling rotates across the registered text surfaces, including saved activity tasks and actions and alternates recent and oldest work. A record with multiple fields resumes between slices; no partial record becomes visible. The target duration is checked between backend steps. Local ONNX processing resumes between overlapping model windows; whole-field tokenization, JSON work, one window and remote requests remain indivisible. Failed attempts count toward CPU cooldown. Images release the shared CPU lane before idle or retry sleeps. Ready events retain only the current event per record; completion sequences still advance monotonically.

## User-visible status

Settings shows processing, history discovery, retry, completion and unavailable states. Text and screenshots are reported separately. The API reads at most 1,001 queue entries per enabled surface, returns counts capped at 1,000, and marks counts as lower bounds during discovery or capping. Normal screenshot maturity waiting does not appear as a failed retry. Status polling runs sequentially every 15 seconds while the settings card is mounted and visible, with a five-second request timeout.

Protected responses expose `x-screenpipe-privacy-completeness: unknown` and `/privacy/status`; JSON search, activity ledger and activity summary responses also include this metadata. An empty protected result must not be treated as proof that matching history does not exist. Status is a global snapshot, not exact completeness for a query range or confirmation of upload completion. HTTP admission checks revocation rather than the completion epoch, so unrelated newly processed records do not reject an otherwise valid response. Caches still use the completion epoch for freshness.

## Activities

Saved task titles and action summaries have their own revision receipts. Pending labels use explicit placeholders while interval IDs, timestamps, grouping, evidence links and user-lock flags remain intact. Edits and policy changes revoke the labels immediately. The worker processes both old and new ledger rows; reads never invoke inference.

The summary API uses audited internal queries through the protected read adapter. Frame app names and document paths and input app names are included in text processing because summaries and ledger labels can derive from them. Raw SQL remains unavailable to external callers. A range with pending capture sources reports `privacy_processing`; ledger refresh defers reconciliation so an incomplete read cannot erase saved intervals. A revocation check in the replacement transaction also rejects a rebuild if privacy changed after its source read. Activities polls the existing privacy-status cadence and refreshes its summary and links when the completion epoch changes.

Required-text publication also stamps the legacy audio/input/element compaction markers in the same transaction. These timestamps permit archival but do not authorize reads. Moving unchanged bulk rows into Parquet preserves receipts; content edits and logical element deletion still invalidate them. Upgrading an existing receipt field contract revokes affected old receipts and enrolls them for processing again.

Required-worker failures retain their technical cause and record kind, ID and revision in status and normal support logs. Remote HTTP response bodies and request URLs are excluded because they can echo private source data.

## Performance model

For each modality, let capture rate be λ, sustained governed processing rate be μ, and pending backlog be B. Over Δt seconds, `B_next = max(0, B + (λ - μ) Δt)`. Catch-up time is `B / (μ - λ)` only when μ > λ. A detector outage lasting D needs μ ≥ λ(1 + D/R) to recover within R seconds while capture continues. Text and image rates need separate measurement. The 60-second image maturity delay and normal sync polling add freshness delay even with an empty processing backlog.

The [controlled follow-up measurements](benchmarks/pii-release-gate/MERGE-READINESS.md) compare the previous full-string receipt representation with compact policy generations on the same M1 Max and test binary. With a 512-byte identity and one million frames, broad-query p95 changed from 12.54 s to 1.71 s and the database from 2.95 GB to 668 MB. A separate gate-absent control still shows material broad/sparse read overhead. Five read observations are insufficient to establish stable tail latency; the report includes every sample and the capture-insertion controls.

An 8,960-byte real CPU ONNX field changed from a single 2.91 s call to 11 resumable windows, each at most 267 ms in that run, with exact output equality. This improves scheduling, not sustained detector throughput. Backlog can still grow when processing cannot keep up. It remains durable and visible in status; there is no processing-based capture rejection or speculative completion ETA.

The earlier M5 Max release-profile [benchmark report](benchmarks/pii-release-gate/RESULTS.md) remains historical evidence. Its 3/6/15 frames-per-second workloads have no original-versus-patched control and are not current capacity or regression claims. Neither report establishes packaged desktop latency, low-memory behavior, thermal/battery impact, or perfect detector recall.

## Derived enterprise uploads

Parsed projections, saved generated activity history, and feedback have durable upload copies in `_privacy_exports`. The existing text worker processes extracted content strings and publishes a version receipt atomically. Known record IDs, hierarchy, evidence references and timestamps remain intact; new text fields require processing by default. Nested text values are processed individually and restored to their original JSON structure. Original activity history and feedback stay unchanged locally.

Database source changes enqueue identifiers and revoke derived copies in the same source transaction. Preparation uses the existing sync page budget and durable discovery state; large histories continue across pages and restarts. Parsed snapshots include frame metadata, parser items and resolved actor labels. Changes to those tables and their joins revoke the snapshot. Preparing a snapshot validates the source revision again before committing it.

The app's activity store is separate from SQLite. Upload admission compares saved activity fingerprints with the prepared copies while holding the history-save lock, alongside the existing database admission lease. Edits and deletions therefore cannot pass transport admission with an older copy. Subsequent preparation replaces changed copies without reprocessing unchanged activities.

Each enabled stream retains its enrollment cutoff before preparation starts and uploads in completion order. Pending detector work does not block ready streams. An unsuccessful transport acknowledgment retains the delivery checkpoint; restart retries it. After that checkpoint is durable, acknowledged upload copies are removed and only their source-version markers remain. Interrupted cleanup retries on the next tick. Local API projections and administrative replay use the same versioned-copy mechanism described below.

[Follow-up validation and paired trigger measurements](benchmarks/pii-release-gate/DERIVED-UPLOADS.md) record the 175 passing targeted tests, raw timing samples, scope limits and the unrelated native tooltip assertion failure.

## Validation

The regression suite uses synthetic private text and generated screenshot pixels. It covers real SQLite and hybrid storage, the actual worker and HTTP router, screenshot serving, cached-policy revocation, restart durability, late completion, upload acknowledgement failure and pre-upload policy changes. The synthetic detectors make ordering deterministic; these tests do not measure real-model recall or deployment performance.

## Local derived APIs and administrative replay

Meetings, speakers, semantic actors and their aliases, outputs, feedback, and executions retain IDs, times and relationships while sensitive content is pending. Their content comes from processed copies rather than rewriting local paths, reconciliation keys or user-authored originals. The existing worker rotates through durable discovery and preparation; settings includes unfinished discovery. Nested JSON preserves its structure. Source edits delete the old copy and enqueue its revision in the same transaction. SQLite and hybrid read adapters use the same receipts.

Historical replay retains a request-specific discovery cursor and checks the exact half-open event-time range. Previously acknowledged derived records are restaged once and held until replay completes, so ordinary sync cannot erase an active replay's source copies. Completion paging filters by range and stream before its page budget. After selecting a payload, replay checks both pending sources and ready events beyond its selected sequence under the transport's admission token. This avoids falsely completing when a model finishes between selection and status inspection. Restart retains the replay's progress; unrelated captures outside the range do not prevent completion.

## Scope and operating limits

- Raw SQL, raw video export, original audio samples, frame streaming, on-demand OCR, live content events, artifact file reads and database backup remain explicitly unavailable under protection. They have no release adapter; the API reports `privacy_surface_unavailable` rather than exposing raw content. Processed output metadata is available, but that receipt does not authorize the original file's bytes.
- The gate covers the selected local API and enterprise upload paths. Native model consumers reading the raw database, direct filesystem access, browser tools, other sync services, support logs and cloud history are separate boundaries. An agent with unrestricted filesystem access can bypass an HTTP gate.
- Compact keys resolve the policy-identity storage amplification, and resumable local model windows reduce indivisible processing. Broad and sparse reads still have the measured costs above. Sustained overload increases freshness delay; these changes do not promise a particular throughput or a hard CPU ceiling.
- A remote detector upgrade must preserve or advance its policy identity. Local version constants cannot independently attest an unversioned remote deployment. Image receipts rely on capture-owned files not being rewritten outside the database lifecycle.
