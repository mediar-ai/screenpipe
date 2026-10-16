# PII release gate

Draft implementation, not a complete product privacy guarantee.

<!-- doc-covers: crates/screenpipe-db/src/db/privacy_release.rs, crates/screenpipe-db/src/db/privacy_exports.rs, crates/screenpipe-redact/src/worker/release.rs, crates/screenpipe-redact/src/image/worker.rs, crates/screenpipe-engine/src/routes/privacy_release.rs, apps/screenpipe-app-tauri/src-tauri/src/enterprise/sync.rs -->
<!-- doc-verified: 497df0c721c4953564d41328cb182a99f7643d2a -->

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

Text scheduling rotates across the registered text surfaces, including saved activity tasks and actions and alternates recent and oldest work. A record with multiple fields resumes between slices; no partial record becomes visible. The target duration is checked between model calls, so one inference, JSON parse or large field is not preemptible. Failed attempts count toward CPU cooldown. Images release the shared CPU lane before idle or retry sleeps. Ready events retain only the current event per record; completion sequences still advance monotonically.

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

Release-profile measurements now cover 41 scale cases, real CPU text/image models, concurrent capture insertion, mixed workers, fields through 1 MiB and repeat load runs. At 100,000 history frames, median capture-insertion p95 was 0.651 ms with the gate absent and 1.463 ms with ready receipts; aggressive discovery reached 7.855 ms. These timings cover the database batch path, excluding screen acquisition, OCR and encoding. The scale fixture uses an eight-byte policy identity; a separate 512-byte probe at one million frames used 2,812 MiB of DB storage versus 665 MiB with eight bytes and reached 17.9 seconds search p95. Each identity cell has one run; storage omits historical completion events and OCR-element receipts.

Remaining limits are material: a broad ready search at one million frames took 1.289 s p95; a sparse ready history took 520 ms for the latest page. All three distinct-content six-frame/second runs retained text backlog after a two-minute drain deadline. A single 1 MiB model call took 569 seconds, well beyond the cooperative 250 ms slice target. The mixed text/image process peaked at 1,340 MiB. The short image-worker runs include startup and preceding inference load; they are not steady-state image capacity.

The [benchmark report](benchmarks/pii-release-gate/RESULTS.md) contains raw samples, run ranges, CPU/storage measurements, identity-length sensitivity, capacity equations and exact scope. These are synthetic measurements on an M5 Max with 128 GiB RAM, not ordinary-device guarantees or detector-recall evidence. No CI jobs were added.

## Derived enterprise uploads

Parsed projections, saved generated activity history, and feedback have durable upload copies in `_privacy_exports`. The existing text worker processes extracted content strings and publishes a version receipt atomically. Known record IDs, hierarchy, evidence references and timestamps remain intact; new text fields require processing by default. Nested text values are processed individually and restored to their original JSON structure. Original activity history and feedback stay unchanged locally.

Database source changes enqueue identifiers and revoke derived copies in the same source transaction. Preparation uses the existing sync page budget and durable discovery state; large histories continue across pages and restarts. Parsed snapshots include frame metadata, parser items and resolved actor labels. Changes to those tables and their joins revoke the snapshot. Preparing a snapshot validates the source revision again before committing it.

The app's activity store is separate from SQLite. Upload admission compares saved activity fingerprints with the prepared copies while holding the history-save lock, alongside the existing database admission lease. Edits and deletions therefore cannot pass transport admission with an older copy. Subsequent preparation replaces changed copies without reprocessing unchanged activities.

Each enabled stream retains its enrollment cutoff before preparation starts and uploads in completion order. Pending detector work does not block ready streams. An unsuccessful transport acknowledgment retains the delivery checkpoint; restart retries it. After that checkpoint is durable, acknowledged upload copies are removed and only their source-version markers remain. Interrupted cleanup retries on the next tick. These adapters restore enterprise uploads, not the otherwise unsupported local API surfaces or administrative replay.

## Validation

The regression suite uses synthetic private text and generated screenshot pixels. It covers real SQLite and hybrid storage, the actual worker and HTTP router, screenshot serving, cached-policy revocation, restart durability, late completion, upload acknowledgement failure and pre-upload policy changes. The synthetic detectors make ordering deterministic; these tests do not measure real-model recall or deployment performance.

## Merge blockers and boundaries

- Protected mode currently closes raw SQL, raw video export, original audio samples, frame streaming, on-demand OCR, live content events, artifacts and database backup. These paths need their own release adapters and accurate product status before rollout.
- Meetings, speakers, semantic actors, outputs, feedback and executions have no release worker in this draft. Their protected views stay empty. Their local API limitation is separate from the protected upload copies described above.
- Historical administrative replay is rejected in protected mode until pending work can be tracked within the exact requested range. Regular sync supports late completion; replay must not report success while relevant records remain pending.
- The gate covers the selected local API and enterprise upload paths. Native model consumers that read the raw database, direct filesystem access, browser tools, other sync services, support logs and cloud history require separate boundary review. An agent with unrestricted filesystem access can bypass an HTTP gate.
- Measured broad/sparse read latency, distinct-content overload and indivisible large-field inference remain rollout blockers. Candidate/receipt selection, compact policy keys and resumable model windows need improvement. Power/thermal behavior, ordinary low-memory hardware, accelerated providers, policy-upgrade catch-up and packaged desktop latency remain unmeasured. The current CPU cooldown is not a hard ceiling for long calls.
- A remote detector upgrade must preserve or advance its policy identity. Local version constants cannot independently attest an unversioned remote deployment. Image receipts also rely on capture-owned files not being rewritten outside the database lifecycle.

The branch should remain draft until these rollout limits have a reviewed resolution.
