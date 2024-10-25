use crate::audio_processing::{audio_frames_to_speech_frames, audio_to_mono, AudioInput};
use crate::vad_engine::VadEngine;
use anyhow::{anyhow, Result};
use chrono::Utc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::StreamError;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use std::{fmt, thread};
use tokio::sync::{broadcast, oneshot};

#[derive(Clone, Debug, PartialEq)]
pub enum AudioTranscriptionEngine {
    Deepgram,
    WhisperTiny,
    WhisperDistilLargeV3,
    WhisperLargeV3Turbo,
    WhisperLargeV3,
}

impl fmt::Display for AudioTranscriptionEngine {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AudioTranscriptionEngine::Deepgram => write!(f, "Deepgram"),
            AudioTranscriptionEngine::WhisperTiny => write!(f, "WhisperTiny"),
            AudioTranscriptionEngine::WhisperDistilLargeV3 => write!(f, "WhisperLarge"),
            AudioTranscriptionEngine::WhisperLargeV3Turbo => write!(f, "WhisperLargeV3Turbo"),
            AudioTranscriptionEngine::WhisperLargeV3 => write!(f, "WhisperLargeV3"),
        }
    }
}

impl Default for AudioTranscriptionEngine {
    fn default() -> Self {
        AudioTranscriptionEngine::WhisperLargeV3Turbo
    }
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize, Debug, Deserialize)]
pub enum DeviceType {
    Input,
    Output,
}

#[derive(Clone, Eq, PartialEq, Hash, Serialize, Debug)]
pub struct AudioDevice {
    pub name: String,
    pub device_type: DeviceType,
}

impl AudioDevice {
    pub fn new(name: String, device_type: DeviceType) -> Self {
        AudioDevice { name, device_type }
    }

    pub fn from_name(name: &str) -> Result<Self> {
        if name.trim().is_empty() {
            return Err(anyhow!("Device name cannot be empty"));
        }

        let (name, device_type) = if name.to_lowercase().ends_with("(input)") {
            (
                name.trim_end_matches("(input)").trim().to_string(),
                DeviceType::Input,
            )
        } else if name.to_lowercase().ends_with("(output)") {
            (
                name.trim_end_matches("(output)").trim().to_string(),
                DeviceType::Output,
            )
        } else {
            return Err(anyhow!(
                "Device type (input/output) not specified in the name"
            ));
        };

        Ok(AudioDevice::new(name, device_type))
    }
}

impl fmt::Display for AudioDevice {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{} ({})",
            self.name,
            match self.device_type {
                DeviceType::Input => "input",
                DeviceType::Output => "output",
            }
        )
    }
}

pub fn parse_audio_device(name: &str) -> Result<AudioDevice> {
    AudioDevice::from_name(name)
}

async fn get_device_and_config(
    audio_device: &AudioDevice,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig)> {
    let host = cpal::default_host();

    info!("device: {:?}", audio_device.to_string());

    let is_output_device = audio_device.device_type == DeviceType::Output;
    let is_display = audio_device.to_string().contains("Display");

    let cpal_audio_device = if audio_device.to_string() == "default" {
        match audio_device.device_type {
            DeviceType::Input => host.default_input_device(),
            DeviceType::Output => host.default_output_device(),
        }
    } else {
        let mut devices = match audio_device.device_type {
            DeviceType::Input => host.input_devices()?,
            DeviceType::Output => host.output_devices()?,
        };

        #[cfg(target_os = "macos")]
        {
            if is_output_device {
                if let Ok(screen_capture_host) = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)
                {
                    devices = screen_capture_host.input_devices()?;
                }
            }
        }

        devices.find(|x| {
            x.name()
                .map(|y| {
                    y == audio_device
                        .to_string()
                        .replace(" (input)", "")
                        .replace(" (output)", "")
                        .trim()
                })
                .unwrap_or(false)
        })
    }
    .ok_or_else(|| anyhow!("Audio device not found"))?;

    // if output device and windows, using output config
    let config = if is_output_device && !is_display {
        cpal_audio_device.default_output_config()?
    } else {
        cpal_audio_device.default_input_config()?
    };
    Ok((cpal_audio_device, config))
}

pub async fn record_and_transcribe(
    audio_stream: Arc<AudioStream>,
    whisper_sender: crossbeam::channel::Sender<AudioInput>,
    data_dir: Arc<PathBuf>,
) -> Result<()> {
    println!(
        "starting continuous recording for {}",
        audio_stream.device.to_string()
    );

    let mut receiver = audio_stream.subscribe();

    println!("successfully subscribed to audio stream");

    // Add timeout to prevent infinite waiting
    let timeout = Duration::from_secs(1000);

    loop {
        println!("waiting for audio segment");
        match tokio::time::timeout(timeout, receiver.recv()).await {
            Ok(Ok(segment)) => {
                println!("received audio segment, length: {}", segment.frames.len());
                let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
                let sanitized_device_name =
                    audio_stream.device.to_string().replace(['/', '\\'], "_");
                let file_path =
                    data_dir.join(format!("{}_{}.mp4", sanitized_device_name, new_file_name));
                let file_path_clone = Arc::new(file_path);

                if let Err(e) = whisper_sender.send(AudioInput {
                    data: Arc::new(vec![segment]),
                    device: audio_stream.device.clone(),
                    sample_rate: audio_stream.device_config.sample_rate().0,
                    channels: audio_stream.device_config.channels(),
                    output_path: file_path_clone,
                }) {
                    println!("failed to send audio to audio model: {}", e);
                }
                println!("sent audio segment to audio model");
            }
            Ok(Err(e)) => {
                println!("error receiving from broadcast channel: {}", e);
                // Consider if you want to break the loop here
            }
            Err(_) => {
                println!("timeout waiting for audio segment");
                // Consider if you want to break the loop here
            }
        }
    }
}

pub async fn list_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    for device in host.input_devices()? {
        if let Ok(name) = device.name() {
            devices.push(AudioDevice::new(name, DeviceType::Input));
        }
    }

    // Filter function to exclude macOS speakers and AirPods for output devices
    fn should_include_output_device(name: &str) -> bool {
        #[cfg(target_os = "macos")]
        {
            !name.to_lowercase().contains("speakers") && !name.to_lowercase().contains("airpods")
        }
        #[cfg(not(target_os = "macos"))]
        {
            // Avoid "unused variable" warning in non-macOS systems
            let _ = name;
            true
        }
    }

    // macos hack using screen capture kit for output devices - does not work well
    #[cfg(target_os = "macos")]
    {
        // !HACK macos is supposed to use special macos feature "display capture"
        // ! see https://github.com/RustAudio/cpal/pull/894
        if let Ok(host) = cpal::host_from_id(cpal::HostId::ScreenCaptureKit) {
            for device in host.input_devices()? {
                if let Ok(name) = device.name() {
                    if should_include_output_device(&name) {
                        devices.push(AudioDevice::new(name, DeviceType::Output));
                    }
                }
            }
        }
    }

    // add default output device - on macos think of custom virtual devices
    for device in host.output_devices()? {
        if let Ok(name) = device.name() {
            if should_include_output_device(&name) {
                devices.push(AudioDevice::new(name, DeviceType::Output));
            }
        }
    }

    // last, add devices that are listed in .devices() which are not already in the devices vector
    let other_devices = host.devices().unwrap();
    for device in other_devices {
        if !devices.iter().any(|d| d.name == device.name().unwrap())
            && should_include_output_device(&device.name().unwrap())
        {
            // TODO: not sure if it can be input, usually aggregate or multi output
            devices.push(AudioDevice::new(device.name().unwrap(), DeviceType::Output));
        }
    }

    Ok(devices)
}

pub fn default_input_device() -> Result<AudioDevice> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or(anyhow!("No default input device detected"))?;
    Ok(AudioDevice::new(device.name()?, DeviceType::Input))
}
// this should be optional ?
pub fn default_output_device() -> Result<AudioDevice> {
    #[cfg(target_os = "macos")]
    {
        // ! see https://github.com/RustAudio/cpal/pull/894
        if let Ok(host) = cpal::host_from_id(cpal::HostId::ScreenCaptureKit) {
            if let Some(device) = host.default_input_device() {
                if let Ok(name) = device.name() {
                    return Ok(AudioDevice::new(name, DeviceType::Output));
                }
            }
        }
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| anyhow!("No default output device found"))?;
        return Ok(AudioDevice::new(device.name()?, DeviceType::Output));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| anyhow!("No default output device found"))?;
        return Ok(AudioDevice::new(device.name()?, DeviceType::Output));
    }
}

pub fn trigger_audio_permission() -> Result<()> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("No default input device found"))?;

    let config = device.default_input_config()?;

    // Attempt to build an input stream, which should trigger the permission request
    let _stream = device.build_input_stream(
        &config.into(),
        |_data: &[f32], _: &cpal::InputCallbackInfo| {
            // Do nothing, we just want to trigger the permission request
        },
        |err| eprintln!("Error in audio stream: {}", err),
        None,
    )?;

    // We don't actually need to start the stream
    // The mere attempt to build it should trigger the permission request

    Ok(())
}

#[derive(Clone, Debug)]
pub struct AudioSegment {
    pub frames: Arc<Vec<f32>>,
    pub speech_frames: Arc<Vec<f32>>,
}

#[derive(Clone)]
pub struct AudioStream {
    pub device: Arc<AudioDevice>,
    pub device_config: cpal::SupportedStreamConfig,
    transmitter: Arc<tokio::sync::broadcast::Sender<AudioSegment>>,
    stream_control: mpsc::Sender<StreamControl>,
    stream_thread: Option<Arc<tokio::sync::Mutex<Option<thread::JoinHandle<()>>>>>,
}

enum StreamControl {
    Stop(oneshot::Sender<()>),
}

impl AudioStream {
    pub async fn from_device(
        device: Arc<AudioDevice>,
        vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    ) -> Result<Self> {
        let (tx, _) = broadcast::channel::<AudioSegment>(1000);
        let tx_clone = tx.clone();
        let (cpal_audio_device, config) = get_device_and_config(&device).await?;
        let channels = config.channels();

        let device_clone = device.clone();
        let device_clone2 = device_clone.clone();
        let config_clone = config.clone();
        let config_clone2 = config_clone.clone();
        let (stream_control_tx, stream_control_rx) = mpsc::channel();
        let stream_control_tx_clone = stream_control_tx.clone();

        let vad_engine_clone = vad_engine.clone();

        let buffer = Arc::new(Mutex::new(Vec::new()));
        let buffer_clone = buffer.clone();

        let stream_thread = Arc::new(tokio::sync::Mutex::new(Some(thread::spawn(move || {
            info!(
                "starting audio capture thread for device: {}",
                device_clone.to_string()
            );
            let device = device_clone;
            let config = config_clone;
            let error_count = Arc::new(AtomicUsize::new(0));
            let error_count_clone = error_count.clone();

            let error_callback = move |err: StreamError| {
                error!("an error occurred on the audio stream: {}", err);
                let count = error_count_clone.fetch_add(1, Ordering::Relaxed);

                if count >= 3 {
                    warn!("exceeded maximum retry attempts, stopping recording");
                    let (tx, _) = oneshot::channel();
                    if let Err(e) = stream_control_tx_clone.send(StreamControl::Stop(tx)) {
                        error!("failed to send stop signal: {}", e);
                    }
                    return;
                }

                // Exponential backoff sleep
                let sleep_duration = Duration::from_millis(100 * 2_u64.pow(count as u32));
                thread::sleep(sleep_duration);
            };

            // TODO: shouldnt we bytemuck::cast_slice(data) ?
            let data_callback = move |data: &[f32], _: &_| {
                let mono = audio_to_mono(data, channels);

                // Add data to buffer
                let mut buffer = buffer_clone.lock().unwrap();
                buffer.extend_from_slice(&mono);

                const CHUNK_DURATION_MS: f32 = 3000.0;
                let buffer_duration_ms =
                    (buffer.len() as f32 / config_clone2.sample_rate().0 as f32) * 1000.0;
                if buffer_duration_ms < CHUNK_DURATION_MS {
                    return;
                }

                // Process with VAD and audio processing
                let mut vad = vad_engine_clone.lock().unwrap();
                if let Ok(Some(speech_frames)) = audio_frames_to_speech_frames(
                    &buffer,
                    device_clone2.clone(),
                    config_clone2.sample_rate().0,
                    &mut *vad,
                ) {
                    // info!("sending speech frames length: {}", speech_frames.len());
                    let speech_segment = AudioSegment {
                        frames: Arc::new(std::mem::take(&mut *buffer)),
                        speech_frames: Arc::new(speech_frames),
                    };
                    let _ = tx.send(speech_segment);
                }

                // Clear the buffer after processing attempt
                buffer.clear();
            };

            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I16 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I32 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I8 => cpal_audio_device
                    .build_input_stream(&config.into(), data_callback, error_callback, None)
                    .expect("Failed to build input stream"),
                _ => {
                    error!("unsupported sample format: {}", config.sample_format());
                    return;
                }
            };

            if let Err(e) = stream.play() {
                error!("failed to play stream for {}: {}", device.to_string(), e);
            }

            if let Ok(StreamControl::Stop(response)) = stream_control_rx.recv() {
                info!("stopped recording audio stream");
                stream.pause().ok();
                drop(stream);
                response.send(()).ok();
            }
        }))));

        Ok(AudioStream {
            device,
            device_config: config,
            transmitter: Arc::new(tx_clone),
            stream_control: stream_control_tx,
            stream_thread: Some(stream_thread),
        })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AudioSegment> {
        self.transmitter.subscribe()
    }

    pub async fn stop(mut self) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        self.stream_control.send(StreamControl::Stop(tx))?;
        rx.await?;

        if let Some(thread_arc) = self.stream_thread.take() {
            let thread_handle = tokio::task::spawn_blocking(move || {
                let mut thread_guard = thread_arc.blocking_lock();
                if let Some(join_handle) = thread_guard.take() {
                    join_handle
                        .join()
                        .map_err(|_| anyhow!("failed to join stream thread"))
                } else {
                    Ok(())
                }
            });

            thread_handle.await??;
        }

        Ok(())
    }

    // Add this near other AudioStream related code
    #[cfg(test)]
    pub async fn from_wav_file(
        wav_path: &str,
        vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    ) -> Result<Self> {
        use rodio::Decoder;
        use rodio::Source;
        use std::fs::File;
        use std::io::BufReader;

        let file = BufReader::new(File::open(wav_path)?);
        let decoder = Decoder::new(file)?;
        let sample_rate = decoder.sample_rate();
        let channels = decoder.channels();

        let (tx, _rx) = broadcast::channel::<AudioSegment>(1000);
        let tx = Arc::new(tx);
        let tx_clone = tx.clone();

        let (stream_control_tx, stream_control_rx) = mpsc::channel();

        let samples: Vec<f32> = decoder.map(|x: i16| x as f32 / i16::MAX as f32).collect();
        println!("loaded {} samples from wav file", samples.len());

        let device = Arc::new(AudioDevice::new(
            "test_device".to_string(),
            DeviceType::Input,
        ));
        let device_clone = device.clone();

        let config = cpal::SupportedStreamConfig::new(
            channels,
            cpal::SampleRate(sample_rate),
            cpal::SupportedBufferSize::Unknown,
            cpal::SampleFormat::F32,
        );

        let chunk_size = (sample_rate as f32 * 3.0) as usize; // 3 seconds chunks
        println!("chunk size: {}", chunk_size);

        let stream_thread = Arc::new(tokio::sync::Mutex::new(Some(thread::spawn({
            thread::sleep(Duration::from_secs(3));
            let tx = tx.clone();
            move || {
                // println!("starting test audio stream thread");

                for chunk in samples.chunks(chunk_size) {
                    // println!("processing chunk of {} samples", chunk.len());

                    let mut vad = vad_engine.lock().unwrap();
                    if let Ok(Some(speech_frames)) = audio_frames_to_speech_frames(
                        chunk,
                        device_clone.clone(),
                        sample_rate,
                        &mut *vad,
                    ) {
                        println!("sending {} speech frames", speech_frames.len());
                        let speech_segment = AudioSegment {
                            frames: Arc::new(chunk.to_vec()),
                            speech_frames: Arc::new(speech_frames),
                        };

                        match tx.send(speech_segment) {
                            Ok(n) => println!("successfully sent audio segment to {} receivers", n),
                            Err(e) => println!("failed to send audio segment: {}", e),
                        }
                    }

                    thread::sleep(Duration::from_millis(100));

                    if let Ok(StreamControl::Stop(response)) = stream_control_rx.try_recv() {
                        println!("received stop signal, ending processing");
                        response.send(()).ok();
                        return;
                    }
                }

                println!("finished processing all chunks");
            }
        }))));

        Ok(AudioStream {
            device,
            device_config: config,
            transmitter: tx_clone,
            stream_control: stream_control_tx,
            stream_thread: Some(stream_thread),
        })
    }
}

// Add this at the end of the file
#[cfg(test)]
pub mod tests {
    use crate::{create_whisper_channel, vad_engine::SileroVad};

    use super::*;

    use screenpipe_core::Language;
    use std::{
        collections::HashMap,
        path::PathBuf,
        sync::{Arc, Mutex},
    };
    use strsim::levenshtein;
    use tracing::{info, Level};
    use tracing_subscriber::{fmt, EnvFilter};

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_transcription_accuracy_direct() {
        // init tracing logs thing
        // fmt()
        //     .with_env_filter(
        //         EnvFilter::builder()
        //             .with_default_directive(Level::DEBUG.into())
        //             .parse_lossy("screenpipe_audio=debug"),
        //     )
        //     .with_target(false) // Removes the target from logs
        //     .with_thread_ids(true) // Adds thread IDs to logs
        //     .with_file(true) // Adds file name to logs
        //     .with_line_number(true) // Adds line numbers to logs
        //     .init();
        println!("starting transcription accuracy test");

        // Setup test cases
        let test_cases = vec![
            (
                "test_data/accuracy1.wav",
                r#"yo louis, here's the tldr of that mind-blowing meeting:
        - bob's cat walked across his keyboard 3 times. productivity increased by 200%.
        - sarah's virtual background glitched, revealing she was actually on a beach. no one noticed.
        - you successfully pretended to be engaged while scrolling twitter. achievement unlocked!
        - 7 people said "you're on mute" in perfect synchronization. new world record.
        - meeting could've been an email. shocking.
        key takeaway: we're all living in a simulation, and the devs are laughing.
        peace out, llama3.2:3b-instruct-q4_K_M"#,
            ),
            (
                "test_data/accuracy2.wav",
                r#"bro - got some good stuff from screenpipe here's the lowdown on your day, you productivity ninja:
        - absolutely demolished that 2-hour coding sesh on the new feature. the keyboard is still smoking, bro!
        - crushed 3 client calls like a boss. they're probably writing love letters to you as we speak, make sure to close john tomorrow 8.00 am according to our notes, let the cash flow in!
        - spent 45 mins on slack. 90% memes, 10% actual work. perfectly balanced, as all things should be
        - watched a rust tutorial. way to flex those brain muscles, you nerd!
        overall, you're killing it! 80% of your time on high-value tasks. the other 20%? probably spent admiring your own reflection, you handsome devil.
        PS: seriously, quit tiktok. your FBI agent is getting bored watching you scroll endlessly.
        what's the plan for tomorrow? more coding? more memes? world domination?
        generated by your screenpipe ai assistant (who's definitely not planning to take over the world... yet)"#,
            ),
            (
                "test_data/accuracy3.wav",
                r#"again, screenpipe allows you to get meeting summaries, locally, without leaking data to OpenAI, with any apps, like WhatsApp, Meet, Zoom, etc. and it's open source at github.com/mediar-ai/screenpipe"#,
            ),
            (
                "test_data/accuracy4.wav",
                r#"Eventually but, I mean, I feel like but, I mean, first, I mean, you think your your vision smart will be interesting because, yeah, you install once. You pay us, you install once. That that yours. So, basically, all the time Microsoft explained, you know, MS Office, long time ago, you just buy the the the software that you can using there forever unless you wanna you wanna update upgrade is the better version. Right? So it's a little bit, you know"#,
            ),
            (
                "test_data/accuracy5.wav",
                r#"Thank you. Yeah. So I cannot they they took it, refresh because of my one set top top time. And, also, second thing is, your byte was stolen. By the time?"#,
            ),
            // Add more test cases as needed
        ];

        println!("initialized {} test cases", test_cases.len());
        let engine = Arc::new(AudioTranscriptionEngine::WhisperLargeV3Turbo);
        println!("using engine: {}", engine);

        // Create channels
        println!("creating whisper channel");
        let (whisper_sender, whisper_receiver, _shutdown) =
            create_whisper_channel(engine.clone(), None, vec![Language::English])
                .await
                .expect("Failed to create whisper channel");
        println!("whisper channel created successfully");

        for (idx, (audio_file, expected_transcription)) in test_cases.iter().enumerate() {
            println!(
                "processing test case {}/{}: {}",
                idx + 1,
                test_cases.len(),
                audio_file
            );

            let data_dir = Arc::new(PathBuf::from("/tmp/sp-test"));
            println!("using data directory: {:?}", data_dir);

            println!("initializing vad engine");
            let vad = SileroVad::new().await.unwrap();
            println!("vad engine initialized");

            println!("creating audio stream from file: {}", audio_file);
            let audio_stream = Arc::new(
                AudioStream::from_wav_file(audio_file, Arc::new(Mutex::new(Box::new(vad))))
                    .await
                    .expect("Failed to create audio stream"),
            );
            println!("audio stream created successfully");

            let whisper_sender_clone = whisper_sender.clone();
            let handle = tokio::spawn(async move {
                println!("abcd");
                match record_and_transcribe(audio_stream.clone(), whisper_sender_clone, data_dir)
                    .await
                {
                    Ok(_) => println!("record_and_transcribe completed successfully"),
                    Err(e) => println!("record_and_transcribe error: {}", e),
                }
            });

            tokio::time::sleep(Duration::from_secs(3)).await;

            let mut full_transcription = String::new();
            println!("collecting transcriptions from broadcast channel");

            let mut device_transcripts: HashMap<String, (String, Option<i64>)> = HashMap::new();
            let mut buffer_frames: HashMap<String, (Vec<String>, Vec<f32>)> = HashMap::new();

            loop {
                while let Ok(mut transcription) = whisper_receiver.recv() {
                    println!(
                        "device {} received transcription {:?}",
                        transcription.input.device, transcription.transcription
                    );

                    // Get device-specific previous transcript
                    let device_id = transcription.input.device.to_string();
                    let (previous_transcript, _) = device_transcripts
                        .entry(device_id.clone())
                        .or_insert((String::new(), None));

                    // Process with device-specific state
                    let mut current_transcript: Option<String> =
                        transcription.transcription.clone();
                    if let Some((_, current)) =
                        transcription.cleanup_overlap(previous_transcript.clone())
                    {
                        current_transcript = Some(current);
                    }

                    transcription.transcription = current_transcript.clone();
                    *previous_transcript = current_transcript.unwrap_or_default();
                    // buffer frames & transcript unless we have reached the chunk duration
                    let frames = buffer_frames
                        .entry(device_id.clone())
                        .or_insert((Vec::new(), Vec::new()));

                    // Buffer both transcription and frames
                    if let Some(transcript) = transcription.transcription {
                        frames.0.push(transcript);
                    }
                    frames.1.extend(
                        transcription
                            .input
                            .data
                            .iter()
                            .flat_map(|segment| segment.frames.iter())
                            .copied(), // Add .copied() to get owned f32 values
                    );

                    // Check if we've reached the chunk duration
                    let total_frames = frames.1.len();
                    let frames_per_chunk = (Duration::from_secs(3).as_secs_f32()
                        * transcription.input.sample_rate as f32)
                        as usize;

                    if total_frames < frames_per_chunk {
                        println!(
                            "buffering frames until encoding & saving to db: {}/{}",
                            total_frames, frames_per_chunk
                        );
                        continue; // Wait for more frames
                    }

                    // We have enough frames, process them but keep remainder
                    let (mut buffered_transcripts, mut frames_to_process) = buffer_frames
                        .get_mut(&device_id)
                        .map(|f| (std::mem::take(&mut f.0), std::mem::take(&mut f.1)))
                        .unwrap_or_default();

                    // Split frames at chunk boundary
                    let remainder_frames = frames_to_process.split_off(frames_per_chunk);

                    // Keep the last transcript if there are remaining frames
                    let remainder_transcript = if !remainder_frames.is_empty() {
                        buffered_transcripts.pop()
                    } else {
                        None
                    };

                    // Put remainder back in buffer
                    if !remainder_frames.is_empty() || remainder_transcript.is_some() {
                        if let Some(buffer) = buffer_frames.get_mut(&device_id) {
                            if let Some(transcript) = remainder_transcript {
                                buffer.0.push(transcript);
                            }
                            buffer.1 = remainder_frames;
                        }
                    }

                    // Join transcripts with spaces
                    let combined_transcript = buffered_transcripts.join(" ");
                    full_transcription = combined_transcript;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
                if full_transcription.split_whitespace().count() >= 10 {
                    println!("full transcription: {}", full_transcription);
                    break;
                }
            }
            let distance = levenshtein(expected_transcription, &full_transcription);
            let accuracy = 1.0 - (distance as f64 / expected_transcription.len() as f64);

            println!("=== Test Results for {} ===", audio_file);
            println!("Expected length: {}", expected_transcription.len());
            println!("Actual length: {}", full_transcription.len());
            println!("Levenshtein distance: {}", distance);
            println!("Accuracy: {:.2}%", accuracy * 100.0);
            println!("Expected: {}", expected_transcription);
            println!("Actual: {}", full_transcription);

            println!("waiting for recording task to complete");
            handle.await.expect("Recording task failed");
            println!("test case completed");
        }
    }
}
