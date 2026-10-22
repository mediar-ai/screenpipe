# Native Metal comparison

Apple M5 Max, 18 CPU cores, 128 GiB RAM, macOS 26.6.2. Separate native Rust
processes, MLX Metal, f32 weights, identical five mono PCM16 16 kHz clips,
one excluded warm-up per clip and three measured repetitions per clip.

| Measurement | Bark 3.0 | Parakeet TDT 0.6B v3 |
| --- | ---: | ---: |
| Model download, decimal MB | 163.4 | 2,508.3 |
| Cached model construction, seconds | 14.18 | 0.92 |
| Sum of per-clip median inference times, seconds | 2.07 | 1.92 |
| Aggregate audio duration, seconds | 170.52 | 170.52 |
| Diagnostic WER | 18.02% (73/405) | 15.31% (62/405) |
| Process peak RSS, GiB | 3.10 | 5.32 |
| MLX active memory after the run, GiB | 2.37 | 2.37 |

Bark was about 8% slower in this run and had more word errors on these clips.
Timing on this shared workstation does not establish a general speed ranking.
The legacy references have known inaccuracies, and normalization covers case
and punctuation only. This is a diagnostic comparison, not an ASR leaderboard.
Bark's clear benefit here is download size. Both models expand to the same f32
active memory footprint; Bark has lower peak process memory but slower loading.
Load measurements include process-local MLX initialization and are single samples.

Raw outputs: [Bark](bark.json), [Parakeet](parakeet.json),
[environment and source fingerprints](environment.json).
The [CPU comparison](../2026-10-22-m5-max-cpu) uses the same inputs and source.

## Toolchain compatibility and reproduction

Apple's Metal Toolchain 27A266a was installed and `xcrun metal --version` verified
Apple metal 32023.921. The unmodified MLX 0.25.1 dependency fails to compile
`fence.metal` with this Xcode 27 toolchain because its preprocessor guard hides
`metal::thread_scope_system`.

This benchmark backports [upstream fix 47430159](https://github.com/ml-explore/mlx/commit/47430159fc5f82392bcc69d41fce2ee89fc2b662)
only to the generated MLX source under this checkout's target directory. The
[exact patch](mlx-fence.patch) moves one `#endif`; no inference algorithm or
model weights change. Both models use this same patched MLX build. This is not
validation of an unmodified production Metal build. The PR does not upgrade
or vendor the shared MLX dependency.

Start with a fresh checkout that has not been configured CPU-only:

```sh
bash crates/screenpipe-bark/bench/prepare.sh
cargo run -p screenpipe-bark --release --example download
# Parakeet must already be in the standard Hugging Face cache.
cargo build -p screenpipe-bark --release --features mlx --example bark_parakeet_bench
```

On Xcode 27, after the documented fence compilation failure, find the generated
`target/release/build/mlx-sys-*/out/build/_deps/mlx-src` directory, then apply:

```sh
patch -d <generated-mlx-src> -p1 < crates/screenpipe-bark/bench/results/2026-10-22-m5-max-metal/mlx-fence.patch
cargo build -p screenpipe-bark --release --features mlx --example bark_parakeet_bench
target/release/examples/bark_parakeet_bench bark crates/screenpipe-bark/bench/fixtures.json 3 gpu
target/release/examples/bark_parakeet_bench parakeet crates/screenpipe-bark/bench/fixtures.json 3 gpu
cargo test -p screenpipe-bark --features mlx --release --lib --tests --examples
```

The full recording-to-index desktop workflow remains untested.
