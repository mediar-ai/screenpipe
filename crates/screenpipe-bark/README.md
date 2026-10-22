# Native Bark 3.0

Underdog Bark 3.0 speech recognition in Screenpipe's Rust process. The `.bark`
reader reconstructs the official ANS-coded weights and XZ side blobs directly,
then uses the existing audiopipe MLX Conformer, prediction and joint networks.
There is no Python runtime, converted-weight cache, subprocess or local server.

On an Apple silicon build with `parakeet-mlx`, select **Bark 3.0 (English)** in
audio settings, or select the `bark` CLI transcription engine. Bark is English
only. It inherits the MLX platform/memory safety gates; it does not change the
default engine. Current support is Apple silicon on macOS 26 or later, on the
high device tier (at least 24 GB RAM and eight CPU cores).

The first use downloads `model.bark`, the MLX vocabulary config and the upstream
`NOTICE` from pinned revision `85db2ad18ab41e534a222ee253c29191d77ed919`.
Downloads run outside recording admission. Recording continues while weights are
unavailable, and the model refresh path loads them after download. The model's
SHA-256 is verified before decoding. Audio stays in the existing local pipeline.

The compressed download is 163,398,645 bytes. This implementation expands weights
to f32, like Screenpipe's current Parakeet MLX runtime. **Download size is not
runtime memory usage.** Only the selected engine is retained. MLX inference uses
30-second fixed shapes and a 2 GiB allocator cache limit; the expanded model and
working memory are additional allocations. Bark and Parakeet share a lock across
loads/inference, including engine switches. Bark drains outstanding operations
before releasing that lock on success or failure.

The upstream evaluated 250 ms leading silence is added to each Bark chunk.
Digital silence returns empty text without inference. The existing Screenpipe
VAD and speaker segmentation remain in place. Vocabulary replacements still
apply; Bark does not currently implement Parakeet's contextual keyterm boosting.

## Validation

```sh
cargo test -p screenpipe-bark --test weights --release
BARK_MODEL_PATH=/path/to/model.bark \
  cargo test -p screenpipe-bark --test weights --release -- --ignored
```

Small fixtures were encoded independently with Python constriction 0.5.0 and
Python's XZ implementation. They exercise symbol/class order, signed levels,
per-row scaling and malformed inputs. The opt-in full-model test checks all 699
f32 tensor digests against an independently computed official-loader reference.
Python is used only to establish that test oracle, never by Screenpipe or the
benchmark executable.

## Compare with Parakeet

```sh
# Populate the pinned Bark cache; Parakeet must already be cached by Screenpipe.
cargo run -p screenpipe-bark --release --example download
bash crates/screenpipe-bark/bench/prepare.sh
cargo build -p screenpipe-bark --release --features mlx --example bark_parakeet_bench

# Separate processes prevent one model's allocations contaminating the other.
target/release/examples/bark_parakeet_bench bark \
  crates/screenpipe-bark/bench/fixtures.json 5 gpu > work/bark-bench/bark.json
target/release/examples/bark_parakeet_bench parakeet \
  crates/screenpipe-bark/bench/fixtures.json 5 gpu > work/bark-bench/parakeet.json
```

Use `cpu` instead of `gpu` for an explicitly labeled CPU comparison. GPU mode
refuses to run if Metal is unavailable. An Apple Metal Toolchain is required to
build the normal MLX Metal dependency. For a CPU-only build in a fresh checkout:

```sh
CMAKE_TOOLCHAIN_FILE="$(pwd)/crates/screenpipe-bark/bench/mlx-cpu.cmake" \
  cargo build -p screenpipe-bark --release --features mlx --example bark_parakeet_bench
```

The CMake option must be present for the dependency's initial configuration;
use separate clean checkouts when comparing CPU-only and Metal builds.
The comparison measures native engine
inference, not audio capture, VAD or database indexing. Both models receive the
same mono PCM16 16 kHz files and use f32 weights, a 2 GiB MLX cache budget and
30-second fixed inference shapes. Bark additionally uses its documented leading
silence. One warm-up per clip is excluded from the repeated timing samples.

JSON records cached model load time, each timing sample, median real-time factor,
process peak RSS, MLX active/peak memory, transcript and aggregate word error
rate. Normalize case/punctuation only; numbers and URLs are not canonicalized.
The five legacy Screenpipe fixture references contain known transcription and
formatting inconsistencies. Their WER is a diagnostic comparison, not a standard
ASR leaderboard or a claim that one model is more accurate generally. Review the
transcripts alongside the scores. Run on an otherwise idle machine for stable
timing; background workloads can affect results.

See [NOTICE](NOTICE) for NVIDIA, Moondream and Conway Research attribution, the
upstream CC BY 4.0 terms, and the native loader changes. Model weights are not
redistributed in this repository.
