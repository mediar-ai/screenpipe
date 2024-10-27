use anyhow::Result;
use hound;
use pyannote_rs::{self, EmbeddingExtractor, EmbeddingManager};
use reqwest;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::OnceCell;
use whisper_rs::{self, FullParams, SamplingStrategy};

struct Models {
    ctx: whisper_rs::WhisperContext,
}

// Global static instance remains the same
static MODELS: OnceCell<Arc<Models>> = OnceCell::const_new();

#[derive(Debug, Clone)]
pub struct DiarizeOptions {
    pub segment_model_path: String,
    pub embedding_model_path: String,
    pub threshold: f32,
    pub max_speakers: usize,
}

#[derive(Debug, Clone)]
pub struct WhisperConfig {
    pub diarize_options: Option<DiarizeOptions>,
}
#[derive(Debug, Clone)]
pub struct WhisperInput {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub device: String,
    pub output_path: PathBuf,
}
#[derive(Debug)]
pub struct WhisperOutput {
    pub input: WhisperInput,
    pub transcription: Option<String>,
    pub timestamp: u64,
    pub error: Option<String>,
    pub speaker: Option<String>,
}

async fn download_model(cache_dir: &PathBuf) -> Result<()> {
    let model_name = "ggml-large-v3-turbo-q5_0.bin";
    let model_path = cache_dir.join(model_name);

    // Skip if model already exists
    if model_path.exists() {
        println!("whisper model already exists at {}", model_path.display());
        return Ok(());
    }

    println!("downloading whisper model to {}", model_path.display());

    // Create cache directory if it doesn't exist
    tokio::fs::create_dir_all(cache_dir).await?;

    // Use async reqwest client
    let client = reqwest::Client::new();
    let url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin?download=true";

    let response = client.get(url).send().await?;

    let bytes = response.bytes().await?;

    // Write to file using tokio's async fs
    tokio::fs::write(&model_path, bytes).await?;
    println!("whisper model downloaded successfully");

    Ok(())
}

async fn init_models() -> Result<Arc<Models>> {
    let cache_dir = dirs::cache_dir()
        .ok_or_else(|| anyhow::anyhow!("failed to get cache dir"))?
        .join("screenpipe")
        .join("models");

    // Download model if needed - now directly async
    download_model(&cache_dir).await?;

    let model_path = cache_dir.join("ggml-large-v3-turbo-q5_0.bin");

    let mut ctx_params = whisper_rs::WhisperContextParameters::default();
    ctx_params.use_gpu = true;

    println!(
        "creating whisper context with model path {}",
        model_path.display()
    );

    let ctx = whisper_rs::WhisperContext::new_with_params(
        model_path
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("invalid model path"))?,
        ctx_params,
    )?;

    Ok(Arc::new(Models { ctx }))
}

fn should_normalize(source: &PathBuf) -> bool {
    if let Some(ext) = source.extension() {
        if ext == "wav" {
            // Check if normalization is needed
            if let Ok(reader) = hound::WavReader::open(source) {
                let spec = reader.spec();
                println!("wav spec: {:?}", spec);
                if spec.channels == 1 && spec.sample_rate == 16000 && spec.bits_per_sample == 16 {
                    return false;
                }
            }
        }
    }
    true
}

async fn normalize_audio(input: &WhisperInput) -> Result<Vec<f32>> {
    // Convert multi-channel to mono if needed
    let mono_samples = if input.channels > 1 {
        let mut mono = vec![0.0; input.samples.len() / input.channels as usize];
        for i in 0..mono.len() {
            let mut sum = 0.0;
            for ch in 0..input.channels {
                sum += input.samples[i * input.channels as usize + ch as usize];
            }
            mono[i] = sum / input.channels as f32;
        }
        mono
    } else {
        input.samples.clone()
    };

    // Resample to 16kHz if needed
    let resampled = if input.sample_rate != 16000 {
        // You'll need to add resampling logic here
        // Consider using rubato or similar library
        println!("resampling from {} to 16000", input.sample_rate);
        mono_samples // placeholder - implement resampling
    } else {
        mono_samples
    };

    Ok(resampled)
}

pub async fn process_audio(input: WhisperInput, config: WhisperConfig) -> Result<WhisperOutput> {
    let models = MODELS
        .get_or_try_init(|| async { init_models().await })
        .await?;

    // Add normalization step
    let normalized_samples = normalize_audio(&input).await?;

    let mut state = models.ctx.create_state()?;
    let mut params = FullParams::new(SamplingStrategy::default());

    // Configure base parameters
    params.set_print_special(false);
    params.set_print_progress(true);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_token_timestamps(true);

    let mut speaker = None;
    let mut text = String::new();

    if let Some(diarize_opts) = &config.diarize_options {
        // Convert f32 to i16 for pyannote
        let i16_samples: Vec<i16> = normalized_samples
            .iter()
            .map(|&x| (x * 32767.0) as i16)
            .collect();

        // Now use i16 samples with pyannote
        let diarize_segments =
            pyannote_rs::segment(&i16_samples, 16000, &diarize_opts.segment_model_path).unwrap();

        let mut embedding_manager = EmbeddingManager::new(diarize_opts.max_speakers);
        let mut extractor = EmbeddingExtractor::new(&diarize_opts.embedding_model_path).unwrap();

        for diarize_segment in diarize_segments.iter() {
            // Process each segment
            let mut samples = vec![0.0f32; diarize_segment.samples.len()];
            whisper_rs::convert_integer_to_float_audio(&diarize_segment.samples, &mut samples)?;

            state.full(params.clone(), &samples)?;

            if state.full_n_segments()? > 0 {
                // Get embedding and find speaker
                let embedding: Vec<f32> = extractor
                    .compute(&diarize_segment.samples)
                    .unwrap()
                    .collect();

                speaker = if embedding_manager.get_all_speakers().len() == diarize_opts.max_speakers
                {
                    embedding_manager
                        .get_best_speaker_match(embedding)
                        .map(|s| Some(s.to_string()))
                        .unwrap_or_else(|e| {
                            println!("speaker match error: {}", e);
                            None
                        })
                } else {
                    embedding_manager
                        .search_speaker(embedding, diarize_opts.threshold)
                        .map(|s| s.to_string())
                };

                // Append transcribed text
                let segment_text = state.full_get_segment_text_lossy(0)?;
                text.push_str(&segment_text);
                text.push(' ');
            }
        }
    } else {
        // Regular non-diarized processing
        state.full(params, &normalized_samples)?;
        let num_segments = state.full_n_segments()?;
        for i in 0..num_segments {
            let segment_text = state.full_get_segment_text_lossy(i)?;
            text.push_str(&segment_text);
            text.push(' ');
        }
    }

    Ok(WhisperOutput {
        input,
        transcription: Some(text),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs(),
        error: None,
        speaker,
    })
}

pub async fn init_whisper() -> Result<(mpsc::Sender<WhisperInput>, mpsc::Receiver<WhisperOutput>)> {
    let cache_dir = dirs::cache_dir()
        .ok_or_else(|| anyhow::anyhow!("failed to get cache dir"))?
        .join("screenpipe")
        .join("models");

    tokio::fs::create_dir_all(&cache_dir).await?;

    println!("initializing whisper...");
    println!("cache directory: {:?}", cache_dir);

    let (tx, mut rx) = mpsc::channel::<WhisperInput>(100);
    let (output_tx, output_rx) = mpsc::channel::<WhisperOutput>(100);

    tokio::spawn(async move {
        while let Some(input) = rx.recv().await {
            let input_clone = input.clone(); // Clone input before moving
            match process_audio(
                input,
                WhisperConfig {
                    diarize_options: None,
                },
            )
            .await
            {
                Ok(output) => {
                    if output_tx.send(output).await.is_err() {
                        println!("failed to send output - channel closed");
                        break;
                    }
                }
                Err(e) => {
                    println!("error processing audio: {}", e);
                    // Use input_clone here instead of the moved input
                    let error_output = WhisperOutput {
                        input: input_clone, // Use the cloned input
                        transcription: None,
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs(),
                        error: Some(e.to_string()),
                        speaker: None,
                    };
                    if output_tx.send(error_output).await.is_err() {
                        println!("failed to send error output - channel closed");
                        break;
                    }
                }
            }
        }
    });

    Ok((tx, output_rx))
}
