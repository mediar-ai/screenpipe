// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Run each model in a separate process with identical 16 kHz mono WAV files.
//! Usage: bark_parakeet_bench bark|parakeet MANIFEST.json [repeats=5] [gpu|cpu]
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, time::Instant};

#[derive(Deserialize)]
struct Case {
    name: String,
    audio: PathBuf,
    reference: String,
}
#[derive(Serialize)]
struct Measurement {
    name: String,
    audio_seconds: f64,
    seconds: Vec<f64>,
    median_seconds: f64,
    realtime_factor: f64,
    word_errors: usize,
    reference_words: usize,
    transcript: String,
}
#[derive(Serialize)]
struct Report {
    model: String,
    backend: &'static str,
    weight_dtype: &'static str,
    load_seconds: f64,
    peak_rss_bytes: u64,
    mlx_active_bytes: usize,
    mlx_peak_bytes: usize,
    word_error_rate: f64,
    cases: Vec<Measurement>,
}

enum Model {
    Bark(Box<screenpipe_bark::BarkModel>),
    Parakeet(audiopipe::Model),
}
impl Model {
    fn transcribe(&mut self, audio: &[f32]) -> Result<String> {
        match self {
            Self::Bark(model) => model.transcribe(audio),
            Self::Parakeet(model) => {
                // Match Screenpipe's existing Parakeet path: 30s fixed shape.
                let _guard = screenpipe_bark::MLX_LOCK
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut texts = Vec::new();
                for chunk in audio.chunks(30 * 16000) {
                    let mut input = chunk.to_vec();
                    input.resize(30 * 16000, 0.);
                    let text = model.transcribe(&input, Default::default())?.text;
                    if !text.trim().is_empty() {
                        texts.push(text.trim().to_owned());
                    }
                }
                Ok(texts.join(" "))
            }
        }
    }
}

fn words(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect()
}
fn distance(a: &[String], b: &[String]) -> usize {
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, x) in a.iter().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, y) in b.iter().enumerate() {
            let old = row[j + 1];
            row[j + 1] = (old + 1)
                .min(row[j] + 1)
                .min(diagonal + usize::from(x != y));
            diagonal = old;
        }
    }
    row[b.len()]
}

fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    ensure!(
        args.len() >= 3,
        "usage: bark_parakeet_bench bark|parakeet MANIFEST.json [repeats]"
    );
    let repeats: usize = args.get(3).map(|s| s.parse()).transpose()?.unwrap_or(5);
    ensure!((1..=100).contains(&repeats), "repeats must be 1..100");
    let manifest: Vec<Case> = serde_json::from_reader(std::fs::File::open(&args[2])?)?;
    ensure!(!manifest.is_empty(), "empty benchmark manifest");
    let backend = match args.get(4).map(String::as_str).unwrap_or("gpu") {
        "cpu" => {
            mlx_rs::Device::set_default(&mlx_rs::Device::cpu());
            "native Rust / MLX / CPU"
        }
        "gpu" => {
            let mut available = false;
            unsafe {
                mlx_metal_is_available(&mut available);
            }
            ensure!(
                available,
                "Metal is unavailable; use an MLX Metal build or explicitly choose cpu"
            );
            "native Rust / MLX / Metal"
        }
        _ => anyhow::bail!("device must be gpu or cpu"),
    };
    unsafe {
        let mut previous = 0;
        mlx_set_cache_limit(&mut previous, 2 * 1024 * 1024 * 1024);
    }
    let start = Instant::now();
    let mut model = match args[1].as_str() {
        "bark" => Model::Bark(Box::new(screenpipe_bark::BarkModel::load(
            &screenpipe_bark::cached_model()
                .context("Bark is not cached; run the download example first")?,
        )?)),
        "parakeet" => Model::Parakeet(audiopipe::Model::from_pretrained_cache_only(
            "parakeet-tdt-0.6b-v3-mlx",
        )?),
        _ => anyhow::bail!("model must be bark or parakeet"),
    };
    let load_seconds = start.elapsed().as_secs_f64();
    let mut cases = Vec::new();
    let (mut total_errors, mut total_words) = (0, 0);
    for case in manifest {
        let mut wav = hound::WavReader::open(&case.audio)?;
        ensure!(
            wav.spec().sample_rate == 16000
                && wav.spec().channels == 1
                && wav.spec().bits_per_sample == 16,
            "benchmark input must be mono 16 kHz PCM16: {}",
            case.audio.display()
        );
        let audio: Vec<f32> = wav
            .samples::<i16>()
            .map(|s| s.map(|v| v as f32 / 32768.))
            .collect::<std::result::Result<_, _>>()?;
        ensure!(!audio.is_empty(), "empty benchmark audio");
        let _warmup = model.transcribe(&audio)?;
        let mut seconds = Vec::new();
        let mut transcript = String::new();
        for _ in 0..repeats {
            let start = Instant::now();
            transcript = model.transcribe(&audio)?;
            seconds.push(start.elapsed().as_secs_f64());
        }
        let mut sorted = seconds.clone();
        sorted.sort_by(f64::total_cmp);
        let median_seconds = sorted[sorted.len() / 2];
        let reference_words = words(&case.reference);
        ensure!(!reference_words.is_empty(), "empty reference");
        let word_errors = distance(&reference_words, &words(&transcript));
        total_errors += word_errors;
        total_words += reference_words.len();
        let audio_seconds = audio.len() as f64 / 16000.;
        cases.push(Measurement {
            name: case.name,
            audio_seconds,
            seconds,
            median_seconds,
            realtime_factor: median_seconds / audio_seconds,
            word_errors,
            reference_words: reference_words.len(),
            transcript,
        });
    }
    let (mut active, mut peak) = (0, 0);
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe {
        mlx_get_active_memory(&mut active);
        mlx_get_peak_memory(&mut peak);
        libc::getrusage(libc::RUSAGE_SELF, &mut usage);
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&Report {
            model: args[1].clone(),
            backend,
            weight_dtype: "f32 (both models)",
            load_seconds,
            peak_rss_bytes: usage.ru_maxrss as u64,
            mlx_active_bytes: active,
            mlx_peak_bytes: peak,
            word_error_rate: total_errors as f64 / total_words as f64,
            cases,
        })?
    );
    Ok(())
}
extern "C" {
    fn mlx_metal_is_available(out: *mut bool) -> i32;
    fn mlx_set_cache_limit(out: *mut usize, limit: usize) -> i32;
    fn mlx_get_active_memory(out: *mut usize) -> i32;
    fn mlx_get_peak_memory(out: *mut usize) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wer_counts_insertion_deletion_and_substitution() {
        assert_eq!(
            distance(&words("one two three"), &words("one too three four")),
            2
        );
        assert_eq!(distance(&words("one two three"), &words("one three")), 1);
        assert_eq!(distance(&words("Hello, WORLD."), &words("hello world")), 0);
    }
}
