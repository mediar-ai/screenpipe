# PII gate stress benchmark

Manual release-profile measurements for PR #7634. Synthetic databases and images only. No CI job, production database, capture restart, or cloud inference is involved.

## Reproduce

Build using the repository's unmodified release profile (`opt-level=s`, LTO, one codegen unit):

```sh
cargo test -p screenpipe-redact --test privacy_stress --features onnx-cpu --release --offline --no-run
```

Pass the executable path printed by Cargo to the serial runner:

```sh
python3 docs/benchmarks/pii-release-gate/run.py --binary target/release/deps/privacy_stress-HASH --out /tmp/privacy-scale --suite scale
python3 docs/benchmarks/pii-release-gate/fixtures.py /tmp/privacy-images --font /System/Library/Fonts/Menlo.ttc
python3 docs/benchmarks/pii-release-gate/run.py --binary target/release/deps/privacy_stress-HASH --out /tmp/privacy-models --suite models --images /tmp/privacy-images
python3 docs/benchmarks/pii-release-gate/run.py --binary target/release/deps/privacy_stress-HASH --out /tmp/privacy-identity --suite identity
```

Fixture generation requires Pillow. Model tests require the already installed v50 text and RF-DETR v38 image models. They do not download models. Use an equivalent font path on other systems. Run without other benchmark/compiler workloads. Record whether unrelated desktop workloads were left running; the reported local run did not stop the user’s apps. Do not change target directories or optimization flags to obtain better numbers.

## What is measured

- Histories of 1,000, 100,000, and 1,000,000 frames. Each timed capture burst uses the production three-window database batch insertion path, with distinct synthetic window text by default. It excludes screen acquisition, OCR computation and image encoding.
- Feature absent (`off`), installed but disabled, all ready, all pending, 50 old ready records in a pending history, aggressive legacy discovery, detector failure, and concurrent synthetic detector progress.
- Three fresh-process repetitions for smaller histories, reversing case order on alternating repetitions. The million-record sweep is one run per case. A fresh process does not imply a cold filesystem cache.
- Equal concurrent latest-page reads in all capture comparisons. Safety assertions run outside that timing window. Queue/status measurements have a separate CPU phase.
- Real CPU text inference uses the production regex/cache pipeline and the default worker/governor. Arrival rates are 3, 6, and 15 distinct records/second. A separate duplicate-window case illustrates cache sensitivity. Capture is scheduled over 60 seconds (missed ticks are skipped); drain is bounded to 120 seconds. Frame receipts, rather than the worker counter that includes OCR elements, define frame throughput. `processed_per_s` divides final frame releases by the entire capture-plus-drain-and-shutdown runtime; it is not steady-state capacity. `text_drained` covers text only, with image counts reported separately.
- Single real-model calls on 4 KiB, 64 KiB and 1 MiB fields, with captures offered every 50 ms. Only capture spans overlapping inference are retained. This isolates an indivisible call; it is not sustained governed throughput.
- RF-DETR inference at 512×512, 1920×1080, and 3840×2160, plus actual image publication. First calls are separated from repeated inference. Image resolution cases share a process/governor, with direct detections before worker phases; short four-image worker rates include startup and prior-load effects, not steady-state capacity. Mixed runs use both default workers sharing the governor; synthetic screenshots are deliberately mature to isolate processing capacity from the normal 60-second age requirement.

All-ready receipts in the scale suite are fixture setup, not detector accuracy evidence. Seeded history omits completion events and OCR-element receipts, so retained storage is a partial gate footprint; real publication and additional captured surfaces add storage. Synthetic worker detectors isolate gate overhead. Only the explicitly named model suite performs real inference.

`results.jsonl` contains each case's environment, exit status, metric records and individual sorted latency samples. Failed cases remain in the log. Quantiles from 30 observations do not establish a stable p99. Report observation counts and run-to-run ranges rather than claiming statistical confidence from three repetitions.

CPU is process user+system time; 100% means one fully occupied CPU core, not the entire machine. Capture-window CPU is separate from phase CPU, which includes worker teardown. Peak RSS is the whole-process high-water mark, including setup/model load. DB and WAL lengths are retained file footprints, not cumulative I/O or write amplification. These measurements do not establish battery use, desktop responsiveness, detector recall, native accelerated backend performance, or Windows/Linux results.

Direct SQLite microbenchmarks do not replace HTTP, enterprise-upload, hybrid-storage, or desktop E2E tests. See the PR for their separate receipts and outstanding validation.

## Scope and failure interpretation

The scale suite checks 41 cases and preserves raw samples. The model suite runs seven cases when image fixtures are supplied. Assertions verify visibility, receipt publication and capture counts; passing an overloaded case does not mean its processing backlog drained. The runner exits nonzero for a failed, timed-out or missing test while retaining independent case results.

The large-field tests use one observation per input size. The image worker test publishes four images per resolution, and each resolution has 30 repeated direct detections. These counts support a stress observation, not a stable tail estimate or a model-recall claim. Mixed image fixtures are copied and attached outside each timed capture call; phase CPU includes that fixture work.

Disk failure injection tests a transactional publication abort, not physical disk exhaustion, corruption or power loss. Randomized transitions use four recorded deterministic seeds, not exhaustive state-space verification. Desktop UI responsiveness, thermal throttling, battery drain, low-memory devices, accelerated execution providers and cross-platform behavior remain separate validation.

Mixed final image counts use database receipts after shutdown. Per-second image samples use the worker counter. Use `--suite models --only text-2` for isolated repeats in a fresh output directory.

The primary matrix uses the eight-byte `bench:v1` policy ID. Production constructs an identity from backend, model versions, labels and columns, so its length is configuration-dependent. The separate identity suite probes 8-byte and 512-byte identities at 100k/1m histories: one fresh process per cell, 30 samples per read and 1,000 capture bursts with a concurrent reader. This isolates length sensitivity; 512 bytes is a probe, not a claim about every production policy.

Regenerate the committed charts with `python3 docs/benchmarks/pii-release-gate/plot.py` in an environment with Matplotlib installed. It reads the committed raw JSONL samples.
