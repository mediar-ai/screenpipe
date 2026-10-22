# Repeated native GPU performance test

Apple M5 Max, macOS 26.6.2, 128 GiB RAM, MLX Metal. The benchmark explicitly
selects `Device::gpu()`, asserts that it is the default device, and records
`Device(gpu, 0)` in every report. These are native Rust runs.

Two fresh processes per model ran in order Bark, Parakeet, Parakeet, Bark.
Each process used the same five mono PCM16 16 kHz recordings, one excluded
warm-up per clip and ten measured repetitions per clip: **100 measured
transcriptions per model**, 200 total. Both models use f32 weights and a
2 GiB MLX allocator cache budget. Bark adds its documented 250 ms leading
silence to each chunk. Input chunk sizes remain 30 seconds.

| Measurement | Bark 3.0 | Parakeet TDT 0.6B v3 |
| --- | ---: | ---: |
| Audio duration across five clips, seconds | 170.52 | 170.52 |
| Sum of pooled per-clip median inference times, seconds | 1.401 | 1.338 |
| Audio seconds per inference second | 121.7 | 127.5 |
| Per-process sum of per-clip medians, seconds | 1.328, 1.469 | 1.288, 1.369 |
| Cached model load, seconds | 7.24, 8.21 | 0.58, 0.50 |
| Peak process RSS, GiB | 3.21, 3.20 | 5.42, 5.44 |
| MLX active memory after run, GiB | 2.37 | 2.37 |
| Diagnostic WER in both processes | 18.02% | 15.31% |

Bark's pooled median time was about 4.8% higher. The run ranges overlap, so this
shared-workstation test does not establish a general speed ranking. Both engines
are much faster than real time here. Bark does not demonstrate a GPU speed
advantage; its smaller download remains useful, with the same active f32 model
memory and a lower peak process allocation. The legacy references have known
inaccuracies, so their WER does not establish general ASR accuracy.

The aggregate time is the sum of each clip's median across its 20 samples.
[summary.json](summary.json) retains these medians, per-clip nearest-rank p90s,
and per-process load and memory values. The raw reports retain every timing
sample and the final transcript from each clip/process:
[Bark 1](bark-1.json), [Parakeet 1](parakeet-1.json),
[Parakeet 2](parakeet-2.json), [Bark 2](bark-2.json).
[Environment and source hashes](environment.json) identify this benchmark.
This measures engine inference, not capture, VAD or recording-to-index latency.

## Reproduction and build limitation

The installed Metal Toolchain is 27A266a (Apple metal 32023.921). Both models use
the same MLX 0.25.1 build with the [documented upstream fence backport](../2026-10-22-m5-max-metal#toolchain-compatibility-and-reproduction)
required by Xcode 27. This does not validate an unmodified production Metal
build. Follow that report's build steps, then run these commands sequentially:

```sh
target/release/examples/bark_parakeet_bench bark crates/screenpipe-bark/bench/fixtures.json 10 gpu > bark-1.json
target/release/examples/bark_parakeet_bench parakeet crates/screenpipe-bark/bench/fixtures.json 10 gpu > parakeet-1.json
target/release/examples/bark_parakeet_bench parakeet crates/screenpipe-bark/bench/fixtures.json 10 gpu > parakeet-2.json
target/release/examples/bark_parakeet_bench bark crates/screenpipe-bark/bench/fixtures.json 10 gpu > bark-2.json
cargo test -p screenpipe-bark --features mlx --release --example bark_parakeet_bench
cargo clippy -p screenpipe-bark --features mlx --release --example bark_parakeet_bench -- -D warnings
```
