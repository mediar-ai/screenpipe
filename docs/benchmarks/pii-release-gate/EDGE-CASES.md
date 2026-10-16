# Privacy gate edge-case evidence

Historical snapshot. See [the subsequent compatibility fixes and controlled measurements](MERGE-READINESS.md) and the PR body for current validation; the measurements and counts below describe their original revision.

Passing tests establish the stated behavior on their fixtures. They do not exhaust the state space or establish perfect detector recall.

| Case | Evidence | Result or boundary |
| --- | --- | --- |
| Capture before detection | `pending_capture_is_durable_but_not_released_and_late_completion_is_not_lost` | Local source persists; protected read waits for receipt |
| Model unavailable / regex fallback | `regex_fallback_cannot_certify_required_model_processing`, `unavailable_model_keeps_capture_durable_and_pending_after_restart` | No model receipt; capture survives reopening |
| Edit, policy change, duplicate publication | `edits_and_policy_changes_reject_stale_detection_and_revoke_ready_reads`, `legacy_revision_zero_can_only_be_published_once` | Stale work rejected; publication accepted once |
| Delete and reuse identifier | `deleting_and_reusing_an_id_never_accepts_old_text_or_image_work` | Tombstone revision rejects old work |
| Off/on transitions | `reenabling_same_policy_discovers_captures_made_while_disabled`, `pending_jobs_do_not_survive_source_changes_while_disabled` | Rediscovery and invalidation remain effective |
| Randomized transitions | `randomized_revision_policy_delete_reinsert_sequences_never_release_stale_text` | Four deterministic seeds × 500 operations; no stale secret exposed |
| Publication transaction abort | `publication_write_failure_rolls_back_receipt_and_source` | Source and receipt roll back together; capture and retry still work |
| Multiframe / multifield interruption | `small_slices_remain_fair_and_resumed_json_never_exposes_partial_results`, `partial_multifield_work_survives_close_reopen_sqlite_and_hybrid` | Partial work stays hidden; close/reopen resumes in both storage modes |
| Hybrid sealing and pool lifetime | `hybrid_sealing_preserves_receipts_and_owner_close_drains_protected_pool` | Storage generation changes preserve valid receipts; pool lifetime follows owner |
| New traffic versus old backlog | `recent_arrivals_do_not_starve_old_work_and_recovery_clears_worker_error` | Old work progresses and recovery clears error status |
| Young / future screenshots | `image_queue_filters_age_before_limit_during_continuous_capture`, `bounded_image_traversal_moves_past_future_dated_records`, `young_image_tail_does_not_hide_mature_backlog_or_report_retry` | Mature work progresses; age waiting is distinct from retry |
| Malformed image timestamp | `malformed_image_timestamp_does_not_starve_valid_work` | Decode failure is deferred without starving valid screenshots; correcting the timestamp permits recovery |
| Correcting a future timestamp | `correcting_future_image_timestamp_restores_eligibility` | Regression reproduced, then fixed by timestamp invalidation and revision-checked scheduling |
| Response admission | `privacy_export_admission_rejects_policy_change_but_accepts_new_completions` | Revocation rejects prepared output; unrelated completions do not |
| HTTP and screenshots | SQLite/hybrid `privacy_release` route E2E tests | Actual router, gated results, screenshot access/cache and policy revocation |
| Enterprise upload | `enterprise_sync_test` | 141 passing tests include late completion, cursor ties, enrollment cutoff, acknowledgement failure and policy admission |
| Settings states | `privacy-processing-status.test.tsx` | Six component tests from the preceding unchanged UI revision; fixture preview is not packaged desktop E2E |
| Scale and contention | `scale_overhead` | Three-run 1k/100k matrix and one-run 1m matrix; all sample counts and failures retained |
| Actual models | `real_text_sustained`, `real_image_pipeline`, `real_large_fields` | CPU pipeline and publication measurements; drain completion is a measured outcome, not implied by test pass |

The randomized test exposed stale SQLite schema state on pooled writers after trigger installation. The fix reuses unchanged triggers and refreshes writer schema after real startup DDL, following the existing storage migration pattern. The test passed after the fix. The image timestamp regression also passed after its targeted fix.

Not exercised as physical faults: disk exhaustion, corruption, power loss, process termination during an operating-system file write, out-of-memory kills and filesystem tampering. The SQL abort test is not a substitute. Additional unmeasured environments include ordinary low-memory laptops, long thermal/battery runs, accelerated execution providers and Windows/Linux model execution. Hosted gateway E2E and packaged desktop E2E have separate CI status; local router tests cannot establish their success.

The date-only image benchmark fixture was corrected after a worker timeout. A separate regression then confirmed that such malformed legacy values could starve valid work; the worker now defers only decoding failures and propagates other database errors. The main timings preceded this error-path-only fix; final correctness suites include it.
