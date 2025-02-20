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
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast::Receiver;
use tokio::sync::oneshot;
use tracing::info;
use std::sync::atomic::{AtomicI64, Ordering};

// Add this near other static/global variables
static LAST_DISPLAY_AUDIO_ACTIVITY: AtomicI64 = AtomicI64::new(0);

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
    let mut results = req.stream(get_stream(stream, device.device_type.clone())).await?;
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
                    ).await;
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

fn get_stream(mut stream: Receiver<Vec<f32>>, device_type: DeviceType) -> FuturesReceiver<Result<Bytes, RecvError>> {
    let (mut tx, rx) = mpsc::channel(1);

    tokio::spawn(async move {
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
                        Ordering::SeqCst
                    );
                }
            } else if SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64
                - LAST_DISPLAY_AUDIO_ACTIVITY.load(Ordering::SeqCst) < 100 
            {
                continue;
            }

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

async fn handle_transcription(result: StreamResponse, device: Arc<AudioDevice>) {
    if let StreamResponse::TranscriptResponse {
        channel, is_final, ..
    } = result
    {
        let res = channel.alternatives.first().unwrap();
        let text = res.transcript.clone();
        let is_input = device.device_type == DeviceType::Input;
        
        let speaker = res.words.first()
            .and_then(|w| w.speaker)
            .map(|s| s.to_string());

        if !text.is_empty() {
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
    }
}
