use crate::constants::CONFIG;
use anyhow;
use dirs;
use lazy_static::lazy_static;
use log::debug;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Once;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::info;
use vad_rs::Vad;

#[derive(Clone, Copy, Debug)]
pub enum VadSensitivity {
    Low,
    Medium,
    High,
}

pub enum VadEngineEnum {
    Silero,
}

#[derive(Debug, PartialEq)]
pub enum SpeechBoundary {
    Start,
    End,
    Continuing,
    Silence,
}

lazy_static! {
    static ref MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

static DOWNLOAD_ONCE: Once = Once::new();

pub trait VadEngine: Send {
    fn process_frame(&mut self, frame: &[f32]) -> anyhow::Result<bool>;
    fn reset(&mut self);
    fn buffer(&mut self) -> &mut VadBuffer;
}

pub struct VadBuffer {
    // main buffers
    pre_speech_buffer: VecDeque<Vec<f32>>,
    vad_buffer: VecDeque<Vec<f32>>,
    speech_buffer: Vec<f32>,

    // state tracking
    is_speech_active: bool,
    last_speech_time: Option<Instant>,
    continuous_speech_start: Option<Instant>,
    sample_rate: u32,
    frame_size: usize,
}

impl VadBuffer {
    pub fn new(sample_rate: u32, frame_size: usize) -> Self {
        // Remove the pre-calculated buffer sizes since we'll calculate them dynamically
        Self {
            pre_speech_buffer: VecDeque::new(), // Remove fixed capacity
            vad_buffer: VecDeque::new(),        // Remove fixed capacity
            speech_buffer: Vec::new(),
            is_speech_active: false,
            last_speech_time: None,
            continuous_speech_start: None,
            sample_rate,
            frame_size,
        }
    }

    pub fn add_frame(&mut self, frame: Vec<f32>) {
        // Calculate buffer sizes dynamically using current CONFIG values
        let pre_speech_frames = (CONFIG.pre_speech_buffer_duration_secs * self.sample_rate as f32)
            as usize
            / self.frame_size;
        let vad_frames =
            (CONFIG.vad_buffer_duration_secs * self.sample_rate as f32) as usize / self.frame_size;

        // maintain pre-speech buffer
        self.pre_speech_buffer.push_back(frame.clone());
        while self.pre_speech_buffer.len() > pre_speech_frames {
            self.pre_speech_buffer.pop_front();
        }

        // maintain vad buffer
        self.vad_buffer.push_back(frame);
        while self.vad_buffer.len() > vad_frames {
            self.vad_buffer.pop_front();
        }
    }

    pub fn process_speech(&mut self, is_current_frame_speech: bool) -> SpeechBoundary {
        let now = Instant::now();

        if is_current_frame_speech {
            // println!("vad: detected speech frame");
            self.last_speech_time = Some(now);

            if !self.is_speech_active {
                if self.continuous_speech_start.is_none() {
                    // println!("vad: starting continuous speech detection");
                    self.continuous_speech_start = Some(now);
                }

                // Check if we've reached the speech threshold (700ms)
                if let Some(start) = self.continuous_speech_start {
                    let speech_duration = now.duration_since(start);
                    // println!("vad: speech duration: {:?}", speech_duration);

                    if speech_duration >= Duration::from_millis(CONFIG.speech_threshold_duration_ms)
                    {
                        // println!("vad: speech threshold reached (700ms)");
                        self.is_speech_active = true;
                        // Add pre-speech buffer (2s)
                        self.speech_buffer.extend(
                            self.pre_speech_buffer
                                .iter()
                                .flat_map(|frame| frame.iter().copied()),
                        );
                        return SpeechBoundary::Start;
                    }
                }
            }

            if self.is_speech_active {
                // Add current frame to speech buffer
                if let Some(frame) = self.vad_buffer.back() {
                    self.speech_buffer.extend(frame.iter());
                }
                return SpeechBoundary::Continuing;
            }
        } else {
            if self.is_speech_active {
                if let Some(last_speech) = self.last_speech_time {
                    let silence_duration = now.duration_since(last_speech);
                    // println!("vad: silence duration: {:?}", silence_duration);

                    // Check if silence threshold reached (1500ms)
                    if silence_duration
                        >= Duration::from_millis(CONFIG.silence_threshold_duration_ms)
                    {
                        // println!("vad: silence threshold reached (1500ms)");
                        self.is_speech_active = false;
                        self.continuous_speech_start = None;
                        return SpeechBoundary::End;
                    }
                }
                return SpeechBoundary::Continuing;
            }
        }

        SpeechBoundary::Silence
    }

    pub fn get_speech_buffer(&self) -> &[f32] {
        // println!(
        //     "vad: getting speech buffer, size: {}",
        //     self.speech_buffer.len()
        // );
        &self.speech_buffer
    }

    pub fn clear_speech_buffer(&mut self) {
        self.speech_buffer.clear();
    }

    // Add these getters/setters
    pub fn is_speech_active(&self) -> bool {
        self.is_speech_active
    }

    pub fn speech_buffer_size(&self) -> usize {
        self.speech_buffer.len()
    }
}

pub struct SileroVad {
    vad: Vad,
    buffer: VadBuffer,
}

impl SileroVad {
    pub async fn new() -> anyhow::Result<Self> {
        info!("initializing SileroVad...");
        let model_path = Self::get_or_download_model().await?;
        info!("silero vad model downloaded to: {:?}", model_path);
        let vad = Vad::new(model_path, 16000).map_err(|e| {
            debug!("silero vad error creating vad: {}", e);
            anyhow::anyhow!("vad creation error: {}", e)
        })?;
        info!("silero vad initialized successfully");
        Ok(Self {
            vad,
            buffer: VadBuffer::new(16000, 1600),
        })
    }

    async fn get_or_download_model() -> anyhow::Result<PathBuf> {
        let mut model_path = MODEL_PATH.lock().await;
        if let Some(path) = model_path.as_ref() {
            return Ok(path.clone());
        }

        let cache_dir = Self::get_cache_dir()?;
        let path = cache_dir.join("silero_vad.onnx");

        if path.exists() {
            *model_path = Some(path.clone());
            return Ok(path);
        }

        DOWNLOAD_ONCE.call_once(|| {
            tokio::spawn(async move {
                if let Err(e) = Self::download_model().await {
                    debug!("error downloading silerovad model: {}", e);
                }
            });
        });

        // wait for download to complete
        while !path.exists() {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        *model_path = Some(path.clone());
        Ok(path)
    }

    async fn download_model() -> anyhow::Result<()> {
        debug!("downloading silerovad model...");
        let url =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";
        let response = reqwest::get(url).await?;
        let model_data = response.bytes().await?;

        let cache_dir = Self::get_cache_dir()?;
        tokio::fs::create_dir_all(&cache_dir).await?;
        let path = cache_dir.join("silero_vad.onnx");

        let mut file = tokio::fs::File::create(&path).await?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &model_data).await?;
        debug!("silerovad model downloaded and saved to: {:?}", path);

        Ok(())
    }

    fn get_cache_dir() -> anyhow::Result<PathBuf> {
        let proj_dirs =
            dirs::cache_dir().ok_or_else(|| anyhow::anyhow!("failed to get cache dir"))?;
        Ok(proj_dirs.join("screenpipe").join("vad"))
    }
}

impl VadEngine for SileroVad {
    fn process_frame(&mut self, frame: &[f32]) -> anyhow::Result<bool> {
        let result = self.vad.compute(frame).unwrap();
        // println!("vad: frame probability: {}", result.prob);
        Ok(result.prob > 0.3) // More sensitive threshold
    }

    fn reset(&mut self) {
        self.buffer.clear_speech_buffer();
    }

    fn buffer(&mut self) -> &mut VadBuffer {
        &mut self.buffer
    }
}

pub async fn create_vad_engine(engine: VadEngineEnum) -> anyhow::Result<Box<dyn VadEngine>> {
    match engine {
        VadEngineEnum::Silero => {
            let silero_vad = SileroVad::new().await?;
            Ok(Box::new(silero_vad))
        }
    }
}

unsafe impl Send for SileroVad {}
