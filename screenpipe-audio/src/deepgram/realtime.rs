use crate::{
    deepgram::CUSTOM_DEEPGRAM_API_TOKEN, deepgram::DEEPGRAM_WEBSOCKET_URL,
    realtime::RealtimeTranscriptionEvent, AudioStream,
};
use anyhow::Result;
use bytes::BufMut;
use bytes::Bytes;
use bytes::BytesMut;
use crossbeam::channel::RecvError;
use deepgram::common::options::Encoding;
use deepgram::common::stream_response::StreamResponse;
use futures::channel::mpsc::{self, Receiver as FuturesReceiver};
use futures::{SinkExt, TryStreamExt};
use screenpipe_core::AudioDevice;
use screenpipe_core::AudioDeviceType;
use screenpipe_core::Language;
use screenpipe_events::send_event;
use std::sync::{atomic::AtomicBool, Arc};
use std::time::Duration;
use tokio::sync::broadcast::Receiver;
use tokio::sync::oneshot;

pub async fn stream_transcription_deepgram(
    stream: Arc<AudioStream>,
    languages: Arc<Vec<Language>>,
    is_running: Arc<AtomicBool>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    start_deepgram_stream(
        stream.subscribe().await,
        stream.device.clone(),
        stream.device_config.sample_rate().0,
        is_running,
        languages,
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
    _languages: Arc<Vec<Language>>,
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

fn get_stream(mut stream: Receiver<Vec<f32>>) -> FuturesReceiver<Result<Bytes, RecvError>> {
    let (mut tx, rx) = mpsc::channel(1);

    tokio::spawn(async move {
        while let Ok(data) = stream.recv().await {
            let mut bytes = BytesMut::with_capacity(data.len() * 2);
            for sample in data {
                bytes.put_i16_le((sample * i16::MAX as f32) as i16);
            }
            tx.send(Ok(bytes.freeze())).await.unwrap();
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
        let is_input = device.device_type == AudioDeviceType::Input;

        if !text.is_empty() {
            let _ = send_event(
                "transcription",
                RealtimeTranscriptionEvent {
                    timestamp: chrono::Utc::now(),
                    device: device.to_string(),
                    transcription: text.to_string(),
                    is_final,
                    is_input,
                },
            );
        }
    }
}
