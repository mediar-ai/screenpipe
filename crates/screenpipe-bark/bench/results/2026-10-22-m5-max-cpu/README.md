# Native CPU comparison

Apple M5 Max, 18 CPU cores, 128 GiB RAM, macOS 26.6.2. Both models ran in
separate native Rust processes with MLX 0.25.1's CPU backend, f32 weights and
the same five mono PCM16 16 kHz recordings. One warm-up per clip was excluded;
three measured repetitions per clip are retained in the JSON files.

| Measurement | Bark 3.0 | Parakeet TDT 0.6B v3 |
| --- | ---: | ---: |
| Model download, decimal MB | 163.4 | 2,508.3 |
| Cached model construction, seconds | 7.47 | 0.46 |
| Sum of per-clip median inference times, seconds | 7.77 | 8.08 |
| Aggregate audio duration, seconds | 170.52 | 170.52 |
| Diagnostic word error rate | 18.02% (73/405) | 15.31% (62/405) |
| Process peak RSS, GiB | 3.15 | 5.22 |
| MLX active memory after the run, GiB | 2.37 | 2.37 |

These results do not establish a speed advantage. The workstation was shared,
and a few percent in timing is within the observed local variation. Bark's
smaller download does not reduce the active f32 model footprint in this runtime.
It reduces model storage and avoids the current Parakeet loader's larger peak
process allocation, but model construction takes longer due to decompression.

The five legacy references are not a standard ASR evaluation set. Case and
punctuation are normalized; numbers and URLs are not canonicalized. Some
references have known errors or differ from the actual audio. On this sample,
Bark has more word errors. Review the retained transcripts when interpreting
the numbers; no general accuracy ranking or GPU performance claim is made.

Raw outputs: [Bark](bark.json), [Parakeet](parakeet.json),
[environment and source fingerprints](environment.json).

Reproduce from a fresh checkout on an Apple silicon Mac:

```sh
bash crates/screenpipe-bark/bench/prepare.sh
cargo run -p screenpipe-bark --release --example download
# Parakeet must already be in the standard Hugging Face cache.
CMAKE_TOOLCHAIN_FILE="$(pwd)/crates/screenpipe-bark/bench/mlx-cpu.cmake" \
  cargo build -p screenpipe-bark --release --features mlx --example bark_parakeet_bench
target/release/examples/bark_parakeet_bench bark crates/screenpipe-bark/bench/fixtures.json 3 cpu
target/release/examples/bark_parakeet_bench parakeet crates/screenpipe-bark/bench/fixtures.json 3 cpu
```

A subsequent [Metal comparison](../2026-10-22-m5-max-metal) includes the installed
toolchain and required upstream MLX compatibility backport. The CPU option is
explicit and affects this benchmark build, not the application release settings.
