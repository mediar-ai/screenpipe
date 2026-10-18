# Privacy gate follow-up: compatibility and controlled measurements

Measured October 16, 2026 on an M1 Max (10 CPU cores, 32 GiB), macOS 26.4. The database and model benchmarks use the normal Cargo test/debug profile, not the earlier M5 Max release-profile environment. Ordinary desktop workloads remained running; compilation was idle during the million-record comparisons. Do not compare these absolute timings to the earlier machine as a regression measurement.

## Controlled receipt-format comparison

One million synthetic history frames, a 512-byte policy identity, five observations per read, and 1,000 capture batches of three windows with a concurrent latest-page reader. Both cases run the same benchmark binary. The baseline reconstructs the previous full-identity receipt storage and protected-frame view; the updated case uses compact generation keys with text-to-text index comparisons. This isolates receipt representation and its query, **not a checkout-to-checkout benchmark of the whole PR**. The full model identity remains available once in policy state.

| Measurement | Previous receipt format | Compact receipt format |
| --- | ---: | ---: |
| Broad FTS query p95 | 12,542.53 ms | 1,710.28 ms |
| Latest page p95 | 22.846 ms | 0.308 ms |
| Count p95 | 1,795.79 ms | 678.52 ms |
| Three-window capture insertion p95 | 3.129 ms | 1.728 ms |
| Database size | 2,948,968,448 bytes | 667,574,272 bytes |

With five read observations, reported read p95 is the maximum sample, not a robust tail estimate. Capture covers database insertion, excluding acquisition/OCR/encoding. WAL size is retained bytes, not bytes written. Fixture receipts do not establish detector recall. Local derived-copy/replay fixes followed these measurements; they do not change the measured frame read view or capture triggers, but this is not a benchmark of their processing throughput.

## Gate-absent control and remaining costs

Separate same-binary million-frame runs with five read observations and 1,000 capture batches. Sparse means only the oldest 50 records are certified. The absent case removes the gate; it is not the original application binary.

| p95 measurement | Gate absent | Current, ready | Current, sparse |
| --- | ---: | ---: | ---: |
| Broad FTS query | 324.17 ms | 1,707.86 ms | 566.27 ms |
| Latest page | 0.948 ms | 0.265 ms | 429.11 ms |
| Count | 4.47 ms | 683.49 ms | 405.71 ms |
| Three-window capture insertion | 1.184 ms | 1.814 ms | 2.734 ms |
| Concurrent latest-page reader | 0.185 ms | 3.281 ms | 701.43 ms |

The gate still adds significant broad/sparse read cost. Cache/warmup differences prevent interpreting the faster ready latest-page sample as a general speedup. Every fixture verifies all 1,003,000 captured frames remain present. These figures establish neither battery improvement nor a guaranteed latency on customer hardware.

## Real ONNX scheduling comparison

The installed CPU model processes the same 8,960-byte synthetic field through both paths. Original one-shot execution takes **2,908.877 ms** without a scheduling yield. The resumable implementation uses **11 model windows**, averaging **264.346 ms**, with a maximum of **267.027 ms** per step. The test checks exact output equality, including spans and offsets.

Total model work is approximately unchanged. Existing CPU accounting can now yield/cool down between windows while retaining partial work privately; publication still waits for the entire record. Whole-field tokenization, JSON work, one model window, and remote requests remain indivisible. This does not remeasure the historical 1 MiB case, steady-state throughput, thermal behavior, or battery life.

The older 3/6/15 frames-per-second backlog numbers in [RESULTS.md](RESULTS.md) are standalone workloads on the previous implementation and hardware. They have **no original-versus-patched control**, so they are not regression percentages or current capacity claims. Backlog remains durable whenever arrival exceeds processing capacity.

## Reproduction and raw observations

[Raw samples and context](merge-readiness-metrics.json) include both receipt-format cases, all three gate states, and the ONNX step comparison. Build before measuring; run workloads serially after compilers exit:

```sh
cargo test -p screenpipe-redact --features onnx-cpu --test privacy_stress --offline --no-run
PRIVACY_BENCH_HISTORY=1000000 PRIVACY_BENCH_POLICY_BYTES=512 PRIVACY_BENCH_READ_SAMPLES=5 PRIVACY_BENCH_LEGACY_RECEIPTS=1 cargo test -p screenpipe-redact --features onnx-cpu --test privacy_stress --offline policy_identity_overhead -- --exact --ignored --nocapture
PRIVACY_BENCH_HISTORY=1000000 PRIVACY_BENCH_POLICY_BYTES=512 PRIVACY_BENCH_READ_SAMPLES=5 cargo test -p screenpipe-redact --features onnx-cpu --test privacy_stress --offline policy_identity_overhead -- --exact --ignored --nocapture
PRIVACY_BENCH_HISTORY=1000000 PRIVACY_BENCH_SAMPLES=1000 PRIVACY_BENCH_READ_SAMPLES=5 PRIVACY_BENCH_MODE=off cargo test -p screenpipe-redact --features onnx-cpu --test privacy_stress --offline scale_overhead -- --exact --ignored --nocapture
# Repeat scale_overhead with PRIVACY_BENCH_MODE=ready and sparse.
cargo test -p screenpipe-redact --features onnx-cpu --test privacy_stress --offline resumable_model_windows -- --exact --ignored --nocapture
```

## Compatibility changes and verification

- Current main's export filtering is retained. Protected transport validates its prepared receipt; refreshing it from raw source rows would undo processing.
- Meetings, speakers, semantic actors/aliases, outputs, feedback and executions retain their local source values and keys. Protected views preserve record structure, display pending content, then use atomically certified copies. Nested JSON remains valid. Discovery, auto-generated IDs, edits, policy changes and restart are covered on SQLite and hybrid storage.
- Historical replay uses its exact start/end range, durable discovery, an independent completion cursor, and retained derived copies until replay completes. It checks pending sources and new unsent completions after selecting the page. Ordinary acknowledgments cannot retire active replay copies. Outside-range work cannot hold replay open.
- Compact receipt migration preserves current completions, revokes older policies, and prevents receipt resurrection when switching A → B → A. Timestamp edits invalidate readiness too.
- Local required-detector failures remain diagnosable through the existing status and collected/redacted/rotated support logs.

The exact final checks and results are recorded in the PR body. No application launch or privileged system inspection is needed for these checks. Synthetic detectors establish publication/admission behavior, not real PII recall.
