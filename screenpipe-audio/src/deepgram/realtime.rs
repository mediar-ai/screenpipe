use crate::DeviceType;
use crate::{
    deepgram::CUSTOM_DEEPGRAM_API_TOKEN, realtime::RealtimeTranscriptionEvent, AudioStream,
};
use anyhow::Result;
use bytes::BufMut;
use bytes::Bytes;
use bytes::BytesMut;
use crossbeam::channel::RecvError;
use deepgram::common::options::Encoding;
use deepgram::common::stream_response::StreamResponse;
use futures::channel::mpsc::{self, Receiver as FuturesReceiver};
use futures::stream::StreamExt;
use futures::SinkExt;
use screenpipe_core::Language;
use serde_json::json;
use std::sync::{atomic::AtomicBool, Arc};
use std::time::Duration;
use tokio::join;
use tokio::sync::broadcast::Receiver;
use tokio::time::sleep;
use tracing::error;

pub async fn stream_transcription_deepgram(
    stream: Arc<AudioStream>,
    realtime_transcription_sender: Arc<tokio::sync::broadcast::Sender<RealtimeTranscriptionEvent>>,
    languages: Vec<Language>,
    is_running: Arc<AtomicBool>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    start_deepgram_stream(
        stream,
        realtime_transcription_sender,
        is_running,
        languages,
        deepgram_api_key,
    )
    .await?;

    Ok(())
}
async fn start_deepgram_stream(
    stream: Arc<AudioStream>,
    realtime_transcription_sender: Arc<tokio::sync::broadcast::Sender<RealtimeTranscriptionEvent>>,
    is_running: Arc<AtomicBool>,
    _languages: Vec<Language>,
    deepgram_api_key: Option<String>,
) -> Result<()> {
    let sample_rate = stream.device_config.sample_rate().0;
    let deepgram =
        deepgram::Deepgram::new(deepgram_api_key.unwrap_or(CUSTOM_DEEPGRAM_API_TOKEN.to_string()))?;
    let deepgram_transcription = deepgram.transcription();

    let audio_stream = stream.subscribe().await;

    let req = deepgram_transcription
        .stream_request()
        .keep_alive()
        .channels(1)
        .sample_rate(sample_rate)
        .encoding(Encoding::Linear16);

    let mut handle = req.clone().handle().await?;
    let is_running_handle = tokio::spawn({
        async move {
            while is_running.load(std::sync::atomic::Ordering::Relaxed) {
                sleep(Duration::from_secs(1)).await;
            }
            handle.close_stream().await.unwrap();
        }
    });

    let mut results = req.stream(get_stream(audio_stream)).await?;

    while let Some(result) = results.next().await {
        match result {
            Ok(result) => {
                if let StreamResponse::TranscriptResponse {
                    channel, is_final, ..
                } = result
                {
                    let res = channel.alternatives.first().unwrap();
                    let text = res.transcript.clone();
                    let is_input = stream.device.device_type == DeviceType::Input;

                    match realtime_transcription_sender.send(RealtimeTranscriptionEvent {
                        timestamp: chrono::Utc::now(),
                        device: stream.device.to_string(),
                        transcription: json!({
                          "transcript": text
                        })
                        .to_string(),
                        is_final,
                        is_input,
                    }) {
                        Ok(_) => {}
                        Err(e) => {
                            if !e.to_string().contains("channel closed") {
                                error!("Error sending transcription event: {}", e);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("Error getting transcription: {}", e);
            }
        }
    }

    join!(is_running_handle).0?;

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
