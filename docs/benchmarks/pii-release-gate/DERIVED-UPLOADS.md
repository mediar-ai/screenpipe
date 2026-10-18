# Derived enterprise upload validation

Historical snapshot. See [the subsequent compatibility fixes and controlled measurements](MERGE-READINESS.md) and the PR body for current validation; the measurements and counts below describe their original revision.

Measured October 16, 2026. Source revision: `b40eda11d44c13791de28dcd9b05926bec8db07d`. This follow-up restores protected parsed, activity-history and feedback uploads. It does not resolve the whole PR's previously documented rollout blockers.

## Paired source-trigger measurement

Apple M1 Max, 10 CPU cores, 32 GiB RAM, macOS 26.4. Cargo's normal test profile: workspace code unoptimized with debug information; external dependencies use the repository's configured optimization. This differs from the M5 Max/release-profile machine and configuration in [the earlier whole-gate report](RESULTS.md); do not compare their absolute timings.

Each pair uses a fresh database with the same privacy gate and the same 1,000 single-frame writes through the coordinated writer. The baseline removes only the new `privacy_export_*` source-journal triggers; the patched case retains them. Three runs per case alternate execution order. Total: 18,000 timed writes. Tables show the median of three run-level p95 values and their ranges, not confidence intervals. This is a controlled comparison of the new triggers, not a checkout-to-checkout comparison of the entire original PR.

| Case | Baseline p95, ms | Baseline range, ms | Patched p95, ms | Patched range, ms |
| --- | ---: | ---: | ---: | ---: |
| disabled/plain | 0.242 | 0.239–0.250 | 0.245 | 0.244–0.264 |
| enabled/plain | 0.312 | 0.311–0.399 | 0.329 | 0.319–0.347 |
| enabled/parsed | 0.337 | 0.323–0.339 | 0.342 | 0.338–0.364 |

The paired runs finished in 7.17 seconds after native compilation. No compiler processes were observed at the beginning or end; normal desktop workloads were left running. This is not dedicated-machine isolation. Run ranges overlap, so these samples do not establish a precise population-level regression. They do measure the additional journal writes for parsed frames.

The workload excludes screen acquisition, OCR, encoding, snapshot preparation, required-model processing, simultaneous discovery, large histories and high-fanout source edits. It therefore supplies no new detector throughput, backlog-drain, battery or whole-app latency result. The earlier standalone 3/6-frame-per-second model results still have no matching original-model baseline and must not be presented as before/after regressions.

Reproduce from the repository root after compilation, without concurrent compiler workloads:

```sh
cargo test -p screenpipe-redact --test privacy_release --offline derived_capture_journal_benchmark -- --ignored --nocapture
```

Raw samples (`journal=false` is the baseline):

```text
DERIVED_CAPTURE case=disabled/plain run=0 journal=true samples=1000 p50_ms=0.183 p95_ms=0.264 p99_ms=0.771
DERIVED_CAPTURE case=disabled/plain run=0 journal=false samples=1000 p50_ms=0.173 p95_ms=0.242 p99_ms=0.967
DERIVED_CAPTURE case=disabled/plain run=1 journal=false samples=1000 p50_ms=0.174 p95_ms=0.250 p99_ms=0.977
DERIVED_CAPTURE case=disabled/plain run=1 journal=true samples=1000 p50_ms=0.176 p95_ms=0.245 p99_ms=0.535
DERIVED_CAPTURE case=disabled/plain run=2 journal=true samples=1000 p50_ms=0.176 p95_ms=0.244 p99_ms=0.504
DERIVED_CAPTURE case=disabled/plain run=2 journal=false samples=1000 p50_ms=0.174 p95_ms=0.239 p99_ms=0.986
DERIVED_CAPTURE case=enabled/plain run=0 journal=true samples=1000 p50_ms=0.236 p95_ms=0.319 p99_ms=1.007
DERIVED_CAPTURE case=enabled/plain run=0 journal=false samples=1000 p50_ms=0.251 p95_ms=0.399 p99_ms=1.034
DERIVED_CAPTURE case=enabled/plain run=1 journal=false samples=1000 p50_ms=0.235 p95_ms=0.312 p99_ms=1.012
DERIVED_CAPTURE case=enabled/plain run=1 journal=true samples=1000 p50_ms=0.240 p95_ms=0.347 p99_ms=1.043
DERIVED_CAPTURE case=enabled/plain run=2 journal=true samples=1000 p50_ms=0.232 p95_ms=0.329 p99_ms=1.023
DERIVED_CAPTURE case=enabled/plain run=2 journal=false samples=1000 p50_ms=0.235 p95_ms=0.311 p99_ms=1.010
DERIVED_CAPTURE case=enabled/parsed run=0 journal=true samples=1000 p50_ms=0.261 p95_ms=0.364 p99_ms=0.979
DERIVED_CAPTURE case=enabled/parsed run=0 journal=false samples=1000 p50_ms=0.239 p95_ms=0.323 p99_ms=0.999
DERIVED_CAPTURE case=enabled/parsed run=1 journal=false samples=1000 p50_ms=0.240 p95_ms=0.339 p99_ms=0.991
DERIVED_CAPTURE case=enabled/parsed run=1 journal=true samples=1000 p50_ms=0.262 p95_ms=0.342 p99_ms=0.991
DERIVED_CAPTURE case=enabled/parsed run=2 journal=true samples=1000 p50_ms=0.261 p95_ms=0.338 p99_ms=1.003
DERIVED_CAPTURE case=enabled/parsed run=2 journal=false samples=1000 p50_ms=0.242 p95_ms=0.337 p99_ms=1.010
```

## Correctness and failure evidence

| Command | Result |
| --- | --- |
| `cargo test -p screenpipe-redact --test privacy_release --offline` | 30 passed; 2 manual benchmarks ignored |
| `bun run test:tauri --features enterprise-build --no-default-features --test enterprise_sync_test` | 143 passed; 1 ignored |
| `bun run test:tauri --features enterprise-build --no-default-features --bin screenpipe-app -- required_pii_failure_survives_rotation_and_support_redaction export_upload_proceeds_during_capture_and_rejects_deleted_data` | 2 passed |
| `bun run coverage:all:check` | All three generated coverage checks passed |
| `bun scripts/check-doc-freshness.ts` | PII design doc passed; no undeclared docs |
| `git diff --check` | Passed |

Native and coverage commands run from `apps/screenpipe-app-tauri`; native checks used the required build queue and `debug-dev` profile. The 175 passing targeted tests cover durable worker failure/restart, SQLite/hybrid storage, nested text, stable IDs/evidence, source and policy invalidation, edited/reverted/deleted activities, sparse discovery across restart, acknowledgment failure, cleanup, the privacy-mode race, actual support-log collection/redaction/rotation, and continued capture during export. Required-model behavior is exercised with deterministic synthetic detectors; the HTTP sync test uses a mock ingest server. This is not packaged-desktop or real-model recall acceptance.

An earlier broad `privacy` native filter ran five passing tests and one unrelated failure: `health::tests::overlay_failure_details_are_brief_specific_and_privacy_safe`. Its unchanged recovery string is 52 bytes while the test requires at most 49. The same static contradiction exists in parent `497df0c721`; no separate parent native run was performed. `health.rs` and `overlay_health.rs` were not changed by this follow-up. The full enterprise suite also exposed a stream-setting test race; its diagnostic test now holds the existing shared policy lock, and the complete suite passes with the original assertions retained.
