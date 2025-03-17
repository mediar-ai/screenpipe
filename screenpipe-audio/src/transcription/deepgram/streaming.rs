use anyhow::Result;
use bytes::BufMut;
use bytes::Bytes;
use bytes::BytesMut;
use chrono::DateTime;
use chrono::Utc;
use crossbeam::channel::RecvError;
use deepgram::common::options::Encoding;
use deepgram::common::stream_response::StreamResponse;
use futures::channel::mpsc::{self, Receiver as FuturesReceiver};
use futures::{SinkExt, TryStreamExt};
use screenpipe_core::Language;
use screenpipe_events::send_event;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{atomic::AtomicBool, Arc};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast::Receiver;
use tokio::sync::oneshot;
use tracing::debug;
use tracing::info;
use serde_json;
use serde_json::Value;

// Add this near other static/global variables
static LAST_DISPLAY_AUDIO_ACTIVITY: AtomicI64 = AtomicI64::new(0);

use crate::core::device::AudioDevice;
use crate::core::device::DeviceType;
use crate::core::stream::AudioStream;
use crate::transcription::deepgram::CUSTOM_DEEPGRAM_API_TOKEN;
use crate::transcription::deepgram::DEEPGRAM_WEBSOCKET_URL;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeTranscriptionEvent {
    pub timestamp: DateTime<Utc>,
    pub device: String,
    pub transcription: String,
    pub is_final: bool,
    pub is_input: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
}

/// Starts a Deepgram transcription stream for the given audio stream
///
/// # Arguments
/// * `stream` - The audio stream to transcribe
/// * `languages` - List of languages to transcribe (currently unused)
/// * `is_running` - Atomic boolean to control the stream lifecycle
/// * `deepgram_api_key` - Optional custom API key for Deepgram
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

/// Initializes and manages a Deepgram streaming session
pub async fn start_deepgram_stream(
    stream: Receiver<Vec<f32>>,
    device: Arc<AudioDevice>,
    sample_rate: u32,
    is_running: Arc<AtomicBool>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    let api_key = deepgram_api_key.unwrap_or_else(|| CUSTOM_DEEPGRAM_API_TOKEN.to_string());

    if api_key.is_empty() {
        return Err(anyhow::anyhow!("Deepgram API key not found"));
    }

    // Remove the API key logging
    info!("initializing deepgram transcription service");

    // Log the WebSocket URL
    let ws_url = if DEEPGRAM_WEBSOCKET_URL.as_str().is_empty() {
        "default deepgram api".to_string()
    } else {
        DEEPGRAM_WEBSOCKET_URL.as_str().to_string()
    };
    debug!("connecting to deepgram at: {}", ws_url);
    
    // Log the audio configuration
    debug!("audio configuration: sample_rate={}, channels=1, device={}", sample_rate, device);

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();

    // Spawn shutdown monitor
    tokio::spawn(async move {
        while is_running.load(std::sync::atomic::Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let _ = shutdown_tx.send(()); // Ignore send errors if receiver is dropped
    });

    debug!("Starting deepgram stream for device: {}", device);

    let deepgram = match DEEPGRAM_WEBSOCKET_URL.as_str().is_empty() {
        true => deepgram::Deepgram::new(api_key)?,
        false => {
            debug!("using custom deepgram websocket url: {}", DEEPGRAM_WEBSOCKET_URL.as_str());
            deepgram::Deepgram::with_base_url_and_api_key(DEEPGRAM_WEBSOCKET_URL.as_str(), api_key)?
        }
    };

    let deepgram_transcription = deepgram.transcription();

    let options = deepgram::common::options::OptionsBuilder::new()
        .model(deepgram::common::options::Model::Nova2)
        .smart_format(true)
        .diarize(true)
        .build();
    
        debug!("deepgram options: {:?}", options);

    let req = deepgram_transcription
        .stream_request_with_options(options)
        .keep_alive()
        .channels(1)
        .sample_rate(sample_rate)
        .encoding(Encoding::Linear16);

    debug!("sending deepgram request with encoding=Linear16, channels=1, sample_rate={}", sample_rate);
    
    let mut handle = req.clone().handle().await?;
    debug!("deepgram handle created successfully");
    
    let mut results = req
        .stream(get_stream(stream, device.device_type.clone()))
        .await?;
    debug!("deepgram stream started successfully");
    
    let device_clone = device.clone();

    // Add a sample of the expected response format for debugging
    let sample_response = r#"
        {
            "type": "Results",
            "channel_index": [0,1],
            "duration": 3.02,
            "is_final": true,
            "speech_final": true,
            "channel": {
                "alternatives": [{"transcript": "sample", "confidence": 0.9, "words": []}]
            }
        }
    "#;

    // Try to parse the sample to see if our expected format matches
    match serde_json::from_str::<StreamResponse>(sample_response) {
        Ok(_) => debug!("sample response format is valid"),
        Err(e) => {
            debug!("expected format example error: {}", e);
            
            // Try to parse as generic JSON to see what we can extract
            if let Ok(value) = serde_json::from_str::<Value>(sample_response) {
                debug!("sample can be parsed as generic json: {}", value["type"]);
            }
        }
    };

    loop {
        tokio::select! {
            Ok(()) = &mut shutdown_rx => {
                debug!("Shutting down deepgram stream for device: {}", device);
                break;
            }
            result = results.try_next() => {
                match result {
                    Ok(Some(result)) => {
                        handle_transcription(result, device_clone.clone()).await;
                    }
                    Ok(None) => break, // Stream ended
                    Err(e) => {
                        // Log the error
                        debug!("Error in deepgram stream: {}", e);
                        
                        // Try to extract and process the raw JSON from the error
                        if let Some(raw_data) = e.to_string().find("data:") {
                            let raw_str = &e.to_string()[raw_data..];
                            debug!("Raw data excerpt: {}", raw_str);
                            
                            // Try to extract and process the raw JSON
                            if let Some(json_start) = raw_str.find('{') {
                                let json_str = &raw_str[json_start..];
                                if let Ok(value) = serde_json::from_str::<Value>(json_str) {
                                    debug!("Processing raw JSON from error: {}", value);
                                    
                                    // Try to handle as a Results type
                                    if value.get("type").and_then(|t| t.as_str()) == Some("Results") {
                                        debug!("Found Results type in error data, processing...");
                                        // Process the transcription data
                                        // ...
                                    }
                                }
                            }
                        }
                        
                        // Don't break the loop for deserialization errors
                        if e.to_string().contains("deserialization") {
                            debug!("Continuing despite deserialization error");
                            continue;
                        } else {
                            debug!("Breaking stream due to non-deserialization error");
                            break;
                        }
                    }
                }
            }
        }
    }

    handle.close_stream().await?;
    Ok(())
}

fn get_stream(
    mut stream: Receiver<Vec<f32>>,
    device_type: DeviceType,
) -> FuturesReceiver<Result<Bytes, RecvError>> {
    let (mut tx, rx) = mpsc::channel(1);

    tokio::spawn(async move {
        let mut packet_count = 0;
        let mut total_bytes = 0;
        
        while let Ok(data) = stream.recv().await {
            if device_type == DeviceType::Output {
                let sum_squares: f32 = data.iter().map(|&x| x * x).sum();
                let rms = (sum_squares / data.len() as f32).sqrt();

                if rms > 0.01 {
                    LAST_DISPLAY_AUDIO_ACTIVITY.store(
                        SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as i64,
                        Ordering::SeqCst,
                    );
                    
                    // Log display audio activity
                    debug!("display audio activity detected: rms={:.6}", rms);
                }
            } else if SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64
                - LAST_DISPLAY_AUDIO_ACTIVITY.load(Ordering::SeqCst)
                < 100
            {
                debug!("skipping input audio due to recent display activity");
                continue;
            }

            let mut bytes = BytesMut::with_capacity(data.len() * 2);
            for sample in data {
                bytes.put_i16_le((sample * i16::MAX as f32) as i16);
            }
            
            packet_count += 1;
            total_bytes += bytes.len();
            
            if packet_count % 100 == 0 {
                debug!("sent {} audio packets ({} bytes) to deepgram for device_type={:?}", 
                      packet_count, total_bytes, device_type);
            }
            
            if tx.send(Ok(bytes.freeze())).await.is_err() {
                debug!("stream receiver dropped, stopping audio transmission");
                break; // Stop if receiver is dropped
            }
        }
    });

    rx
}

async fn handle_transcription(result: StreamResponse, device: Arc<AudioDevice>) {
    // Try to handle the result as a StreamResponse enum variant first
    match result {
        StreamResponse::TranscriptResponse { channel, is_final, .. } => {
            debug!(
                "received transcription for device: {}, is_final: {}",
                device.name, is_final
            );
            let res = channel.alternatives.first().unwrap();
            let text = res.transcript.clone();
            let is_input = device.device_type == DeviceType::Input;

            let speaker = res
                .words
                .first()
                .and_then(|w| w.speaker)
                .map(|s| s.to_string());

            if !text.is_empty() {
                debug!("transcription text: {}", text);
                if let Some(speaker_id) = &speaker {
                    debug!("speaker identified: {}", speaker_id);
                }
                
                let _ = send_event(
                    "transcription",
                    RealtimeTranscriptionEvent {
                        timestamp: chrono::Utc::now(),
                        device: device.to_string(),
                        transcription: text.to_string(),
                        is_final,
                        is_input,
                        speaker,
                    },
                );
            }
        },
        // Add a custom handler for the "Results" type that Deepgram actually sends
        _ => {
            // Convert the StreamResponse to a JSON Value to handle it generically
            if let Ok(value) = serde_json::to_value(&result) {
                debug!("handling raw response: {}", value);
                
                // Check if this is a "Results" type response
                if value.get("type").and_then(|t| t.as_str()) == Some("Results") {
                    let is_final = value.get("is_final").and_then(|v| v.as_bool()).unwrap_or(false);
                    
                    // Extract the transcript from the channel alternatives
                    if let Some(channel) = value.get("channel") {
                        if let Some(alternatives) = channel.get("alternatives") {
                            if let Some(first_alt) = alternatives.get(0) {
                                if let Some(transcript) = first_alt.get("transcript").and_then(|t| t.as_str()) {
                                    if !transcript.is_empty() {
                                        debug!("extracted transcript from results: {}", transcript);
                                        
                                        // Extract speaker if available
                                        let speaker = if let Some(words) = first_alt.get("words") {
                                            if let Some(first_word) = words.get(0) {
                                                first_word.get("speaker").and_then(|s| s.as_u64()).map(|s| s.to_string())
                                            } else {
                                                None
                                            }
                                        } else {
                                            None
                                        };
                                        
                                        let is_input = device.device_type == DeviceType::Input;
                                        
                                        let _ = send_event(
                                            "transcription",
                                            RealtimeTranscriptionEvent {
                                                timestamp: chrono::Utc::now(),
                                                device: device.to_string(),
                                                transcription: transcript.to_string(),
                                                is_final,
                                                is_input,
                                                speaker,
                                            },
                                        );
                                    }
                                }
                            }
                        }
                    }
                } else {
                    debug!("unhandled response type: {:?}", value.get("type"));
                }
            } else {
                debug!("failed to convert response to json: {:?}", result);
            }
        }
    }
}
