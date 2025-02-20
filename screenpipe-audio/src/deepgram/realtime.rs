use crate::{
    deepgram::CUSTOM_DEEPGRAM_API_TOKEN, deepgram::DEEPGRAM_WEBSOCKET_URL,
    realtime::RealtimeTranscriptionEvent, AudioStream,
};
use crate::{AudioDevice, DeviceType};
use anyhow::Result;
use bytes::BufMut;
use bytes::Bytes;
use bytes::BytesMut;
use crossbeam::channel::RecvError;
use deepgram::common::options::Encoding;
use deepgram::common::stream_response::StreamResponse;
use futures::channel::mpsc::{self, Receiver as FuturesReceiver};
use futures::{SinkExt, TryStreamExt};
use screenpipe_core::Language;
use screenpipe_events::send_event;
use std::sync::{atomic::AtomicBool, Arc};
use std::time::Duration;
use tokio::sync::broadcast::Receiver;
use tokio::sync::oneshot;
use tracing::info;
use chrono::{DateTime, Utc};
use std::collections::VecDeque;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use similar_string::compare_similarity as similar_text;

pub async fn stream_transcription_deepgram(
    stream: Arc<AudioStream>,
    _languages: Vec<Language>, // TODO impl language
    is_running: Arc<AtomicBool>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    start_deepgram_stream(
        stream.subscribe().await,
        stream.device.clone(),
        stream.device_config.sample_rate().0,
        is_running,
        deepgram_api_key,
    )
    .await?;

    Ok(())
}

pub async fn start_deepgram_stream(
    stream: Receiver<Vec<f32>>,
    device: Arc<AudioDevice>,
    sample_rate: u32,
    is_running: Arc<AtomicBool>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    let api_key = deepgram_api_key.unwrap_or(CUSTOM_DEEPGRAM_API_TOKEN.to_string());

    if api_key.is_empty() {
        return Err(anyhow::anyhow!("Deepgram API key not found"));
    }

    // create shutdown rx from is_running
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();

    tokio::spawn(async move {
        loop {
            let running = is_running.load(std::sync::atomic::Ordering::SeqCst);
            if !running {
                shutdown_tx.send(()).unwrap();
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });

    info!("Starting deepgram stream for device: {}", device);

    let deepgram = match DEEPGRAM_WEBSOCKET_URL.as_str().is_empty() {
        true => deepgram::Deepgram::new(api_key)?,
        false => {
            deepgram::Deepgram::with_base_url_and_api_key(DEEPGRAM_WEBSOCKET_URL.as_str(), api_key)?
        }
    };

    let deepgram_transcription = deepgram.transcription();

    let req = deepgram_transcription
        .stream_request_with_options(
            deepgram::common::options::OptionsBuilder::new()
                .model(deepgram::common::options::Model::Nova2)
                .smart_format(true)
                .diarize(true)
                .build(),
        )
        .keep_alive()
        .channels(1)
        .sample_rate(sample_rate)
        .encoding(Encoding::Linear16);

    let mut handle = req.clone().handle().await?;
    let mut results = req.stream(get_stream(stream)).await?;
    let device_clone = device.clone();

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                info!("Shutting down deepgram stream for device: {}", device);
                break;
            }
            result = results.try_next() => {
                if let Ok(Some(result)) = result {
                    handle_transcription(
                        result,
                        device_clone.clone(),
                    ).await?;
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {
                continue;
            }
        }
    }

    handle.close_stream().await?;
    Ok(())
}

fn get_stream(mut stream: Receiver<Vec<f32>>) -> FuturesReceiver<Result<Bytes, RecvError>> {
    let (mut tx, rx) = mpsc::channel(1);

    tokio::spawn(async move {
        while let Ok(data) = stream.recv().await {
            let mut bytes = BytesMut::with_capacity(data.len() * 2);
            for sample in data {
                bytes.put_i16_le((sample * i16::MAX as f32) as i16);
            }
            if tx.send(Ok(bytes.freeze())).await.is_err() {
                tx.close_channel();
            }
        }
    });

    rx
}

#[derive(Clone, Debug)]
struct DisplayChunk {
    text: String,
    timestamp: DateTime<Utc>,
}

static DISPLAY_CHUNKS: Lazy<Arc<Mutex<VecDeque<DisplayChunk>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(VecDeque::new())));

const CHECK_WINDOW_MS: i64 = 1000;   // Check mic against display within 1s
const BUFFER_WINDOW_MS: i64 = 2000;  // Keep 2s of display history
const SIMILARITY_THRESHOLD: f64 = 70.0;  // 70% similarity threshold instead of 0.7

async fn handle_transcription(result: StreamResponse, device: Arc<AudioDevice>) -> Result<()> {
    if let StreamResponse::TranscriptResponse {
        channel, is_final, ..
    } = result {
        let alternative = channel.alternatives.first().unwrap();
        let text = alternative.transcript.clone();
        let speaker = alternative.words.first()
            .and_then(|w| w.speaker)
            .map(|s| s.to_string());
        let now = Utc::now();
        let is_input = device.device_type == DeviceType::Input;

        info!("transcription from device: {} (type: {:?})", device, device.device_type);

        if text.is_empty() {
            return Ok(());
        }

        if !is_input {
            // Display audio: store and forward immediately
            if let Ok(mut chunks) = DISPLAY_CHUNKS.lock() {
                // Cleanup old chunks - with safe duration conversion
                while let Some(chunk) = chunks.front() {
                    let duration = now.signed_duration_since(chunk.timestamp);
                    if duration.num_milliseconds() > BUFFER_WINDOW_MS {
                        chunks.pop_front();
                    } else {
                        break;
                    }
                }
                
                chunks.push_back(DisplayChunk {
                    text: text.clone(),
                    timestamp: now,
                });
            }

            // Forward display transcription immediately
            info!("display transcription: {}", text);
            send_event(
                "transcription",
                RealtimeTranscriptionEvent {
                    timestamp: now,
                    device: device.to_string(),
                    transcription: text,
                    is_final,
                    is_input,
                    speaker,
                },
            )?;
            return Ok(());
        }

        // Increase delay to allow more time for display chunks to arrive
        // For mic input, add small delay to allow display chunks to be recorded
        tokio::time::sleep(Duration::from_millis(200)).await;  // Changed from 50ms to 200ms

        // For mic input, check against recent display chunks
        let should_skip = if let Ok(chunks) = DISPLAY_CHUNKS.lock() {
            let recent_chunks: String = chunks.iter()
                .filter(|chunk| {
                    let duration = now.signed_duration_since(chunk.timestamp);
                    duration.num_milliseconds().abs() <= CHECK_WINDOW_MS
                })
                .map(|chunk| chunk.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");

            info!("checking mic='{}' against display='{}'", text, recent_chunks);

            if !recent_chunks.is_empty() {
                let similarity = similar_text(&text.to_lowercase(), &recent_chunks.to_lowercase());
                if (similarity * 100.0) > SIMILARITY_THRESHOLD {
                    info!("skipping mic echo: mic='{}', recent_display='{}', similarity={:.2}%", 
                        text, recent_chunks, similarity * 100.0);
                    true
                } else {
                    info!("keeping mic input: similarity {:.2}% below threshold", similarity * 100.0);
                    false
                }
            } else {
                info!("no recent display chunks to compare against");
                false
            }
        } else {
            false
        };

        if !should_skip {
            // Forward unique mic input
            send_event(
                "transcription",
                RealtimeTranscriptionEvent {
                    timestamp: now,
                    device: device.to_string(),
                    transcription: text,
                    is_final,
                    is_input,
                    speaker,
                },
            )?;
        }
    }
    Ok(())
}
